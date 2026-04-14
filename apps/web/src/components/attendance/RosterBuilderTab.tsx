import { useState } from 'react';
import {
  Alert, Badge, Button, Card, Col, Form, Row, Spinner, Table,
} from 'react-bootstrap';
import { useCreateRoster } from '../../hooks/useAttendance';
import { useToast } from '../../context/ToastContext';
import type { ConflictDetail, SiteResponse } from '@stap/shared';
import { clientsApi } from '../../lib/clients.api';
import { useQuery } from '@tanstack/react-query';
import { guardsApi } from '../../lib/guards.api';
import { usersApi } from '../../lib/users.api';

const DAYS_OF_WEEK = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function RosterBuilderTab() {
  const { showToast } = useToast();
  const createRoster = useCreateRoster();

  // Step state
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedGuardIds, setSelectedGuardIds] = useState<string[]>([]);
  const [shiftType, setShiftType] = useState<'DAY' | 'NIGHT' | 'FULL_24'>('DAY');
  const [supervisorId, setSupervisorId] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [recurring, setRecurring] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);

  const [result, setResult] = useState<{ created: number; conflicts: ConflictDetail[] } | null>(null);

  // Fetch all sites
  const { data: sitesData } = useQuery({
    queryKey: ['sites-all'],
    queryFn: () => clientsApi.getAllSites({ limit: 100 }),
  });

  // Fetch all active guards
  const { data: guardsData } = useQuery({
    queryKey: ['guards-roster'],
    queryFn: () => guardsApi.list({ page: 1, limit: 100, status: 'ACTIVE', sortBy: 'lastName', sortOrder: 'asc' }),
  });

  // Fetch supervisors
  const { data: supervisorsData } = useQuery({
    queryKey: ['supervisors'],
    queryFn: () => usersApi.list({ roles: 'OPERATIONS_SUPERVISOR,FIELD_SUPERVISOR', status: 'ACTIVE' }),
    staleTime: 5 * 60 * 1000,
  });

  const selectedSite = sitesData?.data.find((s) => s.id === selectedSiteId) as (SiteResponse & { client?: { clientName: string } }) | undefined;

  function toggleGuard(guardId: string) {
    setSelectedGuardIds((prev) =>
      prev.includes(guardId) ? prev.filter((id) => id !== guardId) : [...prev, guardId],
    );
  }

  function toggleDayOfWeek(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  async function handleSubmit() {
    if (!selectedSiteId) return showToast('Please select a site', 'warning');
    if (selectedGuardIds.length === 0) return showToast('Please select at least one guard', 'warning');
    if (!supervisorId) return showToast('Please select a supervisor', 'warning');

    try {
      const data = await createRoster.mutateAsync({
        siteId: selectedSiteId,
        guardIds: selectedGuardIds,
        supervisorId,
        shiftType,
        startDate: `${startDate}T00:00:00.000Z`,
        endDate: recurring && endDate ? `${endDate}T23:59:59.999Z` : undefined,
        recurring,
        daysOfWeek: recurring ? daysOfWeek : undefined,
      });
      setResult(data);
      showToast(`${data.created} deployment(s) created`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create roster';
      showToast(msg, 'danger');
    }
  }

  if (result) {
    return (
      <Card className="border-0 shadow-sm">
        <Card.Body>
          <div className="text-center py-3">
            <div style={{ fontSize: '3rem' }}>✅</div>
            <h5 className="fw-bold mt-2">{result.created} deployment(s) created</h5>
          </div>

          {result.conflicts.length > 0 && (
            <Alert variant="warning" className="mt-3">
              <Alert.Heading className="h6">
                <i className="bi bi-exclamation-triangle me-2" />
                {result.conflicts.length} conflict(s) skipped
              </Alert.Heading>
              <Table size="sm" className="mt-2 mb-0">
                <thead>
                  <tr>
                    <th>Guard</th>
                    <th>Date</th>
                    <th>Already deployed at</th>
                  </tr>
                </thead>
                <tbody>
                  {result.conflicts.map((c, i) => (
                    <tr key={i}>
                      <td>{c.guardName}</td>
                      <td>{new Date(c.date).toLocaleDateString()}</td>
                      <td>{c.existingSite}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Alert>
          )}

          <div className="text-center mt-3">
            <Button variant="outline-primary" onClick={() => { setResult(null); setSelectedGuardIds([]); }}>
              Build Another Roster
            </Button>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <Card.Body>
        <Row className="g-4">
          {/* Step 1 — Site */}
          <Col md={6}>
            <h6 className="fw-semibold mb-2">Step 1 — Select Site</h6>
            <Form.Select
              value={selectedSiteId}
              onChange={(e) => { setSelectedSiteId(e.target.value); setSelectedGuardIds([]); }}
            >
              <option value="">— Choose a site —</option>
              {sitesData?.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.siteName}
                </option>
              ))}
            </Form.Select>
            {selectedSite && (
              <div className="mt-2 text-muted small">
                Guards required: <strong>{selectedSite.guardsRequired}</strong>
              </div>
            )}
          </Col>

          {/* Step 2 — Guards */}
          <Col md={6}>
            <h6 className="fw-semibold mb-2">
              Step 2 — Select Guards{' '}
              {selectedGuardIds.length > 0 && (
                <Badge bg="primary">{selectedGuardIds.length} selected</Badge>
              )}
            </h6>
            {!selectedSiteId ? (
              <p className="text-muted small">Select a site first.</p>
            ) : (
              <>
                <Form.Check
                  label="Select All"
                  checked={selectedGuardIds.length === (guardsData?.data.length ?? 0)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedGuardIds(guardsData?.data.map((g) => g.id) ?? []);
                    } else {
                      setSelectedGuardIds([]);
                    }
                  }}
                  className="mb-2 fw-semibold"
                />
                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: 4, padding: '0.5rem' }}>
                  {guardsData?.data.map((g) => (
                    <Form.Check
                      key={g.id}
                      id={`guard-${g.id}`}
                      label={
                        <span>
                          {g.fullName}{' '}
                          <Badge bg={g.employmentStatus === 'ACTIVE' ? 'success' : 'secondary'} className="ms-1" style={{ fontSize: '0.65rem' }}>
                            {g.employmentStatus}
                          </Badge>
                        </span>
                      }
                      checked={selectedGuardIds.includes(g.id)}
                      onChange={() => toggleGuard(g.id)}
                      className="mb-1"
                    />
                  ))}
                </div>
              </>
            )}
          </Col>

          {/* Step 3 — Details */}
          <Col md={12}>
            <h6 className="fw-semibold mb-3">Step 3 — Assignment Details</h6>
            <Row className="g-3">
              <Col md={4}>
                <Form.Label className="small">Shift Type</Form.Label>
                <div className="d-flex gap-3">
                  {(['DAY', 'NIGHT', 'FULL_24'] as const).map((s) => (
                    <Form.Check
                      key={s}
                      type="radio"
                      id={`shift-${s}`}
                      label={s === 'FULL_24' ? '24hr' : s.charAt(0) + s.slice(1).toLowerCase()}
                      checked={shiftType === s}
                      onChange={() => setShiftType(s)}
                    />
                  ))}
                </div>
              </Col>

              <Col md={4}>
                <Form.Label className="small">Supervisor</Form.Label>
                <Form.Select
                  value={supervisorId}
                  onChange={(e) => setSupervisorId(e.target.value)}
                >
                  <option value="">— Select supervisor —</option>
                  {supervisorsData?.data.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role.replace(/_/g, ' ')})
                    </option>
                  ))}
                </Form.Select>
              </Col>

              <Col md={4}>
                <Form.Label className="small">Start Date</Form.Label>
                <Form.Control
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Col>

              <Col md={12}>
                <Form.Check
                  type="switch"
                  id="recurring-toggle"
                  label="Recurring roster"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                />
                {recurring && (
                  <div className="mt-3 ps-2 border-start border-3">
                    <Row className="g-3">
                      <Col md={4}>
                        <Form.Label className="small">End Date</Form.Label>
                        <Form.Control
                          type="date"
                          value={endDate}
                          min={startDate}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                        <Form.Text className="text-muted">Max 90 days from start</Form.Text>
                      </Col>
                      <Col md={8}>
                        <Form.Label className="small">Days of Week</Form.Label>
                        <div className="d-flex gap-2 flex-wrap">
                          {DAYS_OF_WEEK.map((d) => (
                            <Form.Check
                              key={d.value}
                              type="checkbox"
                              id={`dow-${d.value}`}
                              label={d.label}
                              checked={daysOfWeek.includes(d.value)}
                              onChange={() => toggleDayOfWeek(d.value)}
                            />
                          ))}
                        </div>
                      </Col>
                    </Row>
                  </div>
                )}
              </Col>
            </Row>
          </Col>

          {/* Step 4 — Review */}
          <Col md={12}>
            <h6 className="fw-semibold mb-2">Step 4 — Review & Confirm</h6>
            <Card className="bg-light border-0">
              <Card.Body className="py-2 small">
                <Row className="g-1">
                  <Col md={3}><span className="text-muted">Site:</span> <strong>{selectedSite?.siteName ?? '—'}</strong></Col>
                  <Col md={3}><span className="text-muted">Guards:</span> <strong>{selectedGuardIds.length}</strong></Col>
                  <Col md={3}><span className="text-muted">Shift:</span> <strong>{shiftType}</strong></Col>
                  <Col md={3}><span className="text-muted">Start:</span> <strong>{startDate}</strong></Col>
                  {recurring && endDate && (
                    <Col md={3}><span className="text-muted">End:</span> <strong>{endDate}</strong></Col>
                  )}
                </Row>
              </Card.Body>
            </Card>

            <Button
              className="mt-3"
              style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
              onClick={handleSubmit}
              disabled={createRoster.isPending || !selectedSiteId || selectedGuardIds.length === 0 || !supervisorId}
            >
              {createRoster.isPending
                ? <><Spinner size="sm" animation="border" className="me-2" />Creating...</>
                : 'Create Roster'}
            </Button>
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
}
