import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { usePastRosterDates, useCopyRoster } from '../../hooks/useAttendance';
import { attendanceApi } from '../../lib/attendance.api';
import type { CopyRosterResult } from '@stap/shared';

interface Props {
  show:      boolean;
  onClose:   () => void;
  onSuccess: (targetDate: string) => void;
}

const SKIP_LABELS: Record<string, string> = {
  ALREADY_DEPLOYED: 'Already deployed on this date',
  INACTIVE:         'Guard is no longer active',
  ON_LEAVE:         'Guard is currently on leave',
};

export default function CopyRosterModal({ show, onClose, onSuccess }: Props) {
  const { data: pastDates } = usePastRosterDates(14);
  const mutation            = useCopyRoster();

  const [sourceDate,        setSourceDate]        = useState('');
  const [targetDate,        setTargetDate]         = useState('');
  const [selectedSiteIds,   setSelectedSiteIds]    = useState<string[]>([]);
  const [overwriteExisting, setOverwriteExisting]  = useState(false);
  const [sourceSites,       setSourceSites]        = useState<{ siteId: string; siteName: string; guardCount: number }[]>([]);
  const [lastResult,        setLastResult]         = useState<CopyRosterResult | null>(null);
  const [apiError,          setApiError]           = useState('');

  // Load sites on the source date
  useEffect(() => {
    if (!sourceDate) { setSourceSites([]); setSelectedSiteIds([]); return; }
    attendanceApi.getDailySheet(`${sourceDate}T00:00:00.000Z`)
      .then(sheet => {
        const sites = sheet.zones.flatMap(z => z.sites).map(s => ({
          siteId:     s.site.id,
          siteName:   s.site.siteName,
          guardCount: s.deployments.length,
        }));
        setSourceSites(sites);
        setSelectedSiteIds([]);
      })
      .catch(() => { setSourceSites([]); setSelectedSiteIds([]); });
  }, [sourceDate]);

  const toggleSite = (id: string) =>
    setSelectedSiteIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  function resetForm() {
    setSourceDate(''); setTargetDate(''); setSelectedSiteIds([]);
    setOverwriteExisting(false); setSourceSites([]); setApiError('');
  }

  function handleClose() { resetForm(); setLastResult(null); onClose(); }

  const sameDate  = !!sourceDate && !!targetDate && sourceDate === targetDate;
  const canSubmit = !!sourceDate && !!targetDate && !sameDate && !mutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    setApiError('');
    try {
      const result = await mutation.mutateAsync({
        sourceDate:        `${sourceDate}T00:00:00.000Z`,
        targetDate:        `${targetDate}T00:00:00.000Z`,
        siteIds:           selectedSiteIds.length > 0 ? selectedSiteIds : undefined,
        overwriteExisting,
      });
      setLastResult(result);
    } catch (err: any) {
      setApiError(err?.response?.data?.error ?? 'Failed to copy roster. Please try again.');
    }
  }

  return (
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Copy Roster to a New Date</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {lastResult ? (
          /* ── Result screen ── */
          <div>
            <div className="text-center mb-3">
              <div style={{ fontSize: '3rem' }}>{lastResult.created > 0 ? '✅' : '⚠️'}</div>
              <div className="fw-bold mt-2" style={{ color: '#1B3A6B' }}>
                {lastResult.created > 0 ? 'Roster Copied Successfully' : 'No Deployments Created'}
              </div>
            </div>

            <Row className="g-3 mb-3">
              <Col xs={6}>
                <div style={{ background: '#d5f5e3', borderRadius: '0.5rem', padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: '#1E8449' }}>{lastResult.created}</div>
                  <div style={{ fontSize: '0.78rem', color: '#1E8449' }}>Deployments Created</div>
                </div>
              </Col>
              <Col xs={6}>
                <div style={{
                  background: lastResult.skipped > 0 ? '#fff3cd' : '#F2F4F7',
                  borderRadius: '0.5rem', padding: 12, textAlign: 'center',
                }}>
                  <div style={{ fontSize: '2rem', fontWeight: 700, color: lastResult.skipped > 0 ? '#856404' : '#6c757d' }}>
                    {lastResult.skipped}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: lastResult.skipped > 0 ? '#856404' : '#6c757d' }}>Guards Skipped</div>
                </div>
              </Col>
            </Row>

            {lastResult.sitesSummary.length > 1 && (
              <div className="mb-3">
                <div className="fw-bold small text-muted mb-2">By Site:</div>
                {lastResult.sitesSummary.map(site => (
                  <div key={site.siteId} className="d-flex justify-content-between align-items-center py-1" style={{ borderBottom: '1px solid #f0f0f0', fontSize: '0.83rem' }}>
                    <span>{site.siteName}</span>
                    <div className="d-flex gap-2">
                      <Badge bg="success" style={{ fontSize: '0.7rem' }}>{site.copied} copied</Badge>
                      {site.skipped > 0 && <Badge bg="warning" text="dark" style={{ fontSize: '0.7rem' }}>{site.skipped} skipped</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {lastResult.skippedReasons.length > 0 && (
              <details className="mb-3">
                <summary className="small text-muted" style={{ cursor: 'pointer' }}>
                  Why were guards skipped? ({lastResult.skippedReasons.length})
                </summary>
                <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#6c757d' }}>
                  {lastResult.skippedReasons.map((r, i) => (
                    <div key={i} className="py-1" style={{ borderBottom: '1px solid #f0f0f0' }}>
                      <strong>{r.guardName}</strong>{' — '}{SKIP_LABELS[r.reason] ?? r.reason}
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div className="d-flex gap-2">
              <Button variant="outline-secondary" className="flex-fill" onClick={() => { resetForm(); setLastResult(null); }}>
                Copy Another Date
              </Button>
              <Button
                variant="primary"
                className="flex-fill"
                onClick={() => { onSuccess(lastResult.targetDate); handleClose(); }}
              >
                View {new Date(lastResult.targetDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} Roster →
              </Button>
            </div>
          </div>
        ) : (
          /* ── Form ── */
          <>
            {/* Source date */}
            <div className="mb-4">
              <Form.Label className="fw-bold">
                Copy From <span className="text-danger">*</span>
              </Form.Label>
              <div className="text-muted small mb-2">Select a past date that already has a roster.</div>

              {pastDates && pastDates.length > 0 && (
                <div className="mb-3">
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1B3A6B', marginBottom: 8 }}>
                    Recent Rosters — click to select:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {pastDates.map(pd => {
                      const dateStr = pd.date.split('T')[0];
                      const active  = sourceDate === dateStr;
                      return (
                        <button
                          key={pd.date}
                          type="button"
                          onClick={() => setSourceDate(dateStr)}
                          style={{
                            padding: '6px 12px', borderRadius: '0.5rem', cursor: 'pointer', textAlign: 'left',
                            border:      `2px solid ${active ? '#1B3A6B' : '#ced4da'}`,
                            background:  active ? '#D6E0F0' : '#fff',
                            minWidth:    140,
                          }}
                        >
                          <div style={{ fontWeight: 600, color: '#1B3A6B', fontSize: '0.8rem' }}>
                            {new Date(pd.date).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#6c757d', marginTop: 2 }}>
                            {pd.guardCount} guard(s) · {pd.siteCount} site(s)
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#6c757d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
                            {pd.siteSummary}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: '0.78rem', color: '#6c757d', marginBottom: 4 }}>Or enter a date manually:</div>
                <Form.Control
                  type="date"
                  value={sourceDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setSourceDate(e.target.value)}
                  style={{ maxWidth: 200 }}
                />
              </div>
            </div>

            {/* Target date */}
            <div className="mb-4">
              <Form.Label className="fw-bold">
                Copy To <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="date"
                value={targetDate}
                onChange={e => setTargetDate(e.target.value)}
                isInvalid={sameDate}
                style={{ maxWidth: 200 }}
              />
              {sameDate && <div style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: 4 }}>Source and target dates cannot be the same.</div>}
              {targetDate && !sameDate && (
                <Form.Text style={{ color: '#0F7B6C' }}>
                  {new Date(targetDate).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                </Form.Text>
              )}
            </div>

            {/* Site filter */}
            {sourceSites.length > 0 && (
              <div className="mb-4">
                <Form.Label className="fw-bold small">Which Sites to Copy</Form.Label>
                <Form.Text className="text-muted d-block mb-2">Leave all unchecked to copy all sites.</Form.Text>
                <div style={{ border: '1px solid #ced4da', borderRadius: '0.375rem', maxHeight: 160, overflowY: 'auto', padding: 8 }}>
                  {sourceSites.map(site => (
                    <Form.Check
                      key={site.siteId}
                      type="checkbox"
                      id={`site-${site.siteId}`}
                      label={<span><strong>{site.siteName}</strong><span className="text-muted ms-2 small">{site.guardCount} guard(s)</span></span>}
                      checked={selectedSiteIds.includes(site.siteId)}
                      onChange={() => toggleSite(site.siteId)}
                    />
                  ))}
                </div>
                {selectedSiteIds.length > 0 && (
                  <div className="mt-2">
                    <small className="text-muted">{selectedSiteIds.length} site(s) selected</small>
                    <button type="button" onClick={() => setSelectedSiteIds([])} style={{ background: 'none', border: 'none', color: '#dc3545', fontSize: '0.75rem', cursor: 'pointer', marginLeft: 8 }}>
                      Clear
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Options */}
            <div className="mb-4">
              <Form.Check
                type="switch"
                id="overwrite-existing"
                label="Replace existing deployments on the target date for copied sites"
                checked={overwriteExisting}
                onChange={e => setOverwriteExisting(e.target.checked)}
              />
              <Form.Text className="text-muted d-block ms-5">
                {overwriteExisting
                  ? '⚠️ Existing deployments for the copied sites on the target date will be deleted and replaced.'
                  : 'Guards already deployed on the target date will be skipped automatically.'}
              </Form.Text>
            </div>

            {/* Summary */}
            {sourceDate && targetDate && !sameDate && (
              <div style={{ background: '#D6E0F0', borderRadius: '0.5rem', padding: '12px 16px', marginBottom: 16, fontSize: '0.82rem' }}>
                <div className="fw-bold mb-1" style={{ color: '#1B3A6B' }}>📋 Copy Summary</div>
                <div>From: <strong>{new Date(sourceDate).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</strong></div>
                <div>To: <strong>{new Date(targetDate).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</strong></div>
                <div>Sites: {selectedSiteIds.length > 0 ? `${selectedSiteIds.length} selected` : 'All sites from source date'}</div>
                {overwriteExisting && (
                  <div className="mt-1" style={{ color: '#856404', fontWeight: 600 }}>⚠️ Will overwrite existing deployments</div>
                )}
              </div>
            )}

            {apiError && <Alert variant="danger" className="small py-2">{apiError}</Alert>}
          </>
        )}
      </Modal.Body>

      {!lastResult && (
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={handleClose} disabled={mutation.isPending}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {mutation.isPending
              ? <><Spinner size="sm" animation="border" className="me-1" />Copying…</>
              : 'Copy Roster'}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}
