import { useState, useEffect, useRef } from 'react';
import { Alert, Button, Card, Form, Navbar, Spinner } from 'react-bootstrap';
import { useSubmitCheckin } from '../../hooks/useAttendance';
import { useAuth } from '../../context/AuthContext';
import { clientsApi } from '../../lib/clients.api';
import { useQuery } from '@tanstack/react-query';
import type { SupervisorCheckinInput } from '@stap/shared';
import { COMPANY_NAME } from '../../lib/branding';

interface QueuedCheckin {
  data: SupervisorCheckinInput;
  timestamp: string;
}

const QUEUE_KEY = 'stap_checkin_queue';

function loadQueue(): QueuedCheckin[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedCheckin[];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedCheckin[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export default function CheckinPage() {
  const { user } = useAuth();
  const submitCheckin = useSubmitCheckin();

  const [siteId, setSiteId] = useState('');
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLon, setGpsLon] = useState<number | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'loading' | 'ok' | 'denied' | 'idle'>('loading');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [incidentFlag, setIncidentFlag] = useState(false);
  const [notes, setNotes] = useState('');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [queueCount, setQueueCount] = useState(loadQueue().length);
  const [submitted, setSubmitted] = useState(false);
  const [submittedAt, setSubmittedAt] = useState('');

  const photoInputRef = useRef<HTMLInputElement>(null);

  // Load today's deployments for this supervisor to populate site selector
  const { data: sitesData } = useQuery({
    queryKey: ['sites-all-checkin'],
    queryFn: () => clientsApi.getAllSites({ limit: 200 }),
  });

  // Auto-capture GPS on load
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLat(pos.coords.latitude);
        setGpsLon(pos.coords.longitude);
        setGpsStatus('ok');
      },
      () => setGpsStatus('denied'),
      { timeout: 10000 },
    );
  }, []);

  // Monitor online/offline
  useEffect(() => {
    const goOnline = () => {
      setIsOffline(false);
      flushQueue();
    };
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function flushQueue() {
    const queue = loadQueue();
    if (queue.length === 0) return;
    const failed: QueuedCheckin[] = [];
    for (const item of queue) {
      try {
        await submitCheckin.mutateAsync({ data: item.data });
      } catch {
        failed.push(item);
      }
    }
    saveQueue(failed);
    setQueueCount(failed.length);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!siteId) return;

    const data: SupervisorCheckinInput = {
      siteId,
      gpsLat: gpsLat ?? undefined,
      gpsLon: gpsLon ?? undefined,
      notes: notes || undefined,
      incidentFlag,
    };

    if (isOffline) {
      // TODO Sprint 4 PWA: replace localStorage with IndexedDB for better offline storage capacity
      // and reliability across browser sessions
      const queue = loadQueue();
      queue.push({ data, timestamp: new Date().toISOString() });
      saveQueue(queue);
      setQueueCount(queue.length);
      setSubmitted(true);
      setSubmittedAt(new Date().toLocaleTimeString());
      return;
    }

    try {
      await submitCheckin.mutateAsync({ data, photo: photo ?? undefined });
      setSubmitted(true);
      setSubmittedAt(new Date().toLocaleTimeString());
    } catch {
      // Error handled by component state
    }
  }

  function resetForm() {
    setSiteId('');
    setPhoto(null);
    setPhotoPreview(null);
    setIncidentFlag(false);
    setNotes('');
    setSubmitted(false);
    setSubmittedAt('');
    if (photoInputRef.current) photoInputRef.current.value = '';
  }

  if (submitted) {
    return (
      <>
        <Navbar bg="dark" variant="dark" className="px-3">
          <Navbar.Brand className="fw-bold small">{COMPANY_NAME} — Site Check-in</Navbar.Brand>
        </Navbar>
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '80vh', padding: '1rem' }}>
          <Card className="shadow-sm text-center" style={{ maxWidth: 360, width: '100%' }}>
            <Card.Body className="py-5">
              <div style={{ fontSize: '3rem' }}>✅</div>
              <h5 className="fw-bold mt-3">Check-in Submitted</h5>
              <p className="text-muted small">Recorded at {submittedAt}</p>
              {isOffline && (
                <Alert variant="warning" className="small">Saved offline — will sync when you reconnect.</Alert>
              )}
              <Button
                variant="primary"
                style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
                className="w-100 mt-2"
                onClick={resetForm}
              >
                Submit Another
              </Button>
            </Card.Body>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar bg="dark" variant="dark" className="px-3">
        <Navbar.Brand className="fw-bold small">{COMPANY_NAME} — Site Check-in</Navbar.Brand>
        <div className="ms-auto text-white small">{user?.name}</div>
      </Navbar>

      {isOffline && (
        <Alert variant="warning" className="mb-0 rounded-0 small text-center">
          You are offline — check-in will sync when connection is restored.
          {queueCount > 0 && ` (${queueCount} queued)`}
        </Alert>
      )}

      <div className="d-flex justify-content-center py-4 px-3">
        <Card className="shadow-sm" style={{ maxWidth: 480, width: '100%' }}>
          <Card.Header className="fw-semibold" style={{ backgroundColor: '#1B3A6B', color: '#fff' }}>
            Site Check-in
          </Card.Header>
          <Card.Body>
            <Form onSubmit={handleSubmit}>
              {/* Site selector */}
              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold">Site *</Form.Label>
                <Form.Select
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  required
                  style={{ fontSize: '1rem', padding: '0.75rem' }}
                >
                  <option value="">— Select site —</option>
                  {sitesData?.data.map((s) => (
                    <option key={s.id} value={s.id}>{s.siteName}</option>
                  ))}
                </Form.Select>
              </Form.Group>

              {/* GPS location */}
              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold">Location</Form.Label>
                {gpsStatus === 'loading' && (
                  <div className="text-muted small">
                    <Spinner animation="border" size="sm" className="me-2" />
                    Capturing location...
                  </div>
                )}
                {gpsStatus === 'ok' && (
                  <Alert variant="success" className="py-2 small mb-0">
                    Location captured: {gpsLat?.toFixed(6)}, {gpsLon?.toFixed(6)}
                  </Alert>
                )}
                {gpsStatus === 'denied' && (
                  <>
                    <Alert variant="warning" className="py-2 small mb-2">
                      Location access denied. You may enter coordinates manually.
                    </Alert>
                    <div className="d-flex gap-2">
                      <Form.Control
                        type="number"
                        step="any"
                        placeholder="Latitude"
                        value={gpsLat ?? ''}
                        onChange={(e) => setGpsLat(parseFloat(e.target.value) || null)}
                      />
                      <Form.Control
                        type="number"
                        step="any"
                        placeholder="Longitude"
                        value={gpsLon ?? ''}
                        onChange={(e) => setGpsLon(parseFloat(e.target.value) || null)}
                      />
                    </div>
                  </>
                )}
              </Form.Group>

              {/* Photo capture */}
              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold">Site Photo</Form.Label>
                <Form.Control
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  style={{ fontSize: '0.9rem' }}
                />
                {photoPreview && (
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="mt-2 rounded"
                    style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }}
                  />
                )}
              </Form.Group>

              {/* Incident flag */}
              <Form.Group className="mb-3">
                <Form.Check
                  type="switch"
                  id="incident-flag"
                  label="Flag as incident requiring follow-up"
                  checked={incidentFlag}
                  onChange={(e) => setIncidentFlag(e.target.checked)}
                  style={{ fontSize: '1rem' }}
                />
              </Form.Group>

              {/* Notes */}
              {(incidentFlag) && (
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold">Notes {incidentFlag && <span className="text-danger">*</span>}</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="Describe the incident or provide additional context..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    required={incidentFlag}
                  />
                </Form.Group>
              )}

              {!incidentFlag && (
                <Form.Group className="mb-3">
                  <Form.Label>Notes (optional)</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    placeholder="Any additional notes..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Form.Group>
              )}

              {submitCheckin.isError && (
                <Alert variant="danger" className="small">Failed to submit check-in. Please try again.</Alert>
              )}

              <Button
                type="submit"
                className="w-100 py-3 fw-semibold"
                style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B', fontSize: '1rem' }}
                disabled={submitCheckin.isPending || !siteId}
              >
                {submitCheckin.isPending
                  ? <><Spinner size="sm" animation="border" className="me-2" />Submitting...</>
                  : 'Submit Check-in'}
              </Button>
            </Form>
          </Card.Body>
        </Card>
      </div>
    </>
  );
}
