import { useMemo, useState } from 'react';
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
import InitialsAvatar from '../ui/InitialsAvatar';

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

interface SelectedGuard {
  id:        string;
  firstName: string;
  lastName:  string;
  rank:      string | null;
  photoUrl:  string | null;
}

export default function RosterBuilderTab() {
  const { showToast } = useToast();
  const createRoster = useCreateRoster();

  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedGuards, setSelectedGuards] = useState<SelectedGuard[]>([]);
  const [guardSearch, setGuardSearch] = useState('');
  const [requiredGuards, setRequiredGuards] = useState(0);
  const [shiftType, setShiftType] = useState<'DAY' | 'NIGHT' | 'FULL_24'>('DAY');
  const [supervisorId, setSupervisorId] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [recurring, setRecurring] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);

  const [result, setResult] = useState<{ created: number; conflicts: ConflictDetail[] } | null>(null);

  const { data: sitesData } = useQuery({
    queryKey: ['sites-all'],
    queryFn: () => clientsApi.getAllSites({ limit: 100 }),
  });

  const { data: guardsData } = useQuery({
    queryKey: ['guards-roster'],
    queryFn: () => guardsApi.list({ page: 1, limit: 100, status: 'ACTIVE', sortBy: 'lastName', sortOrder: 'asc' }),
  });

  const { data: supervisorsData } = useQuery({
    queryKey: ['supervisors'],
    queryFn: () => usersApi.list({ roles: 'OPERATIONS_SUPERVISOR,FIELD_SUPERVISOR', status: 'ACTIVE' }),
    staleTime: 5 * 60 * 1000,
  });

  const selectedSite = sitesData?.data.find((s) => s.id === selectedSiteId) as (SiteResponse & { client?: { clientName: string } }) | undefined;

  const selectedIds = useMemo(
    () => new Set(selectedGuards.map((g) => g.id)),
    [selectedGuards],
  );

  const filteredAvailableGuards = useMemo(
    () =>
      (guardsData?.data ?? [])
        .filter((g) => !selectedIds.has(g.id))
        .filter((g) => {
          if (!guardSearch) return true;
          return `${g.firstName} ${g.lastName}`.toLowerCase().includes(guardSearch.toLowerCase());
        }),
    [guardsData, selectedIds, guardSearch],
  );

  const isAtLimit = requiredGuards > 0 && selectedGuards.length >= requiredGuards;

  function handleSiteChange(siteId: string) {
    setSelectedSiteId(siteId);
    const site = sitesData?.data.find((s) => s.id === siteId);
    setRequiredGuards(site?.guardsRequired ?? 0);
    setSelectedGuards([]);
    setGuardSearch('');
  }

  function selectGuard(guard: { id: string; firstName: string; lastName: string; rank?: string; photoUrl?: string | null }) {
    if (selectedGuards.some((g) => g.id === guard.id)) return;
    if (isAtLimit) return;
    setSelectedGuards((prev) => [
      ...prev,
      { id: guard.id, firstName: guard.firstName, lastName: guard.lastName, rank: guard.rank ?? null, photoUrl: guard.photoUrl ?? null },
    ]);
  }

  function removeGuard(guardId: string) {
    setSelectedGuards((prev) => prev.filter((g) => g.id !== guardId));
  }

  function toggleDayOfWeek(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  async function handleSubmit() {
    if (!selectedSiteId) return showToast('Please select a site', 'warning');
    if (selectedGuards.length === 0) return showToast('Please select at least one guard', 'warning');
    if (!supervisorId) return showToast('Please select a supervisor', 'warning');

    try {
      const data = await createRoster.mutateAsync({
        siteId:     selectedSiteId,
        guardIds:   selectedGuards.map((g) => g.id),
        supervisorId,
        shiftType,
        startDate:  `${startDate}T00:00:00.000Z`,
        endDate:    recurring && endDate ? `${endDate}T23:59:59.999Z` : undefined,
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

  function resetForm() {
    setResult(null);
    setSelectedGuards([]);
    setGuardSearch('');
    setRequiredGuards(0);
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
            <Button variant="outline-primary" onClick={resetForm}>
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
            <Form.Select value={selectedSiteId} onChange={(e) => handleSiteChange(e.target.value)}>
              <option value="">— Choose a site —</option>
              {sitesData?.data.map((s) => (
                <option key={s.id} value={s.id}>{s.siteName}</option>
              ))}
            </Form.Select>
            {selectedSite && (
              <div className="mt-2 text-muted small">
                Guards required: <strong>{selectedSite.guardsRequired}</strong>
              </div>
            )}
          </Col>

          {/* Step 2 — Shift + Supervisor */}
          <Col md={6}>
            <h6 className="fw-semibold mb-2">Step 2 — Assignment Details</h6>
            <Row className="g-2">
              <Col md={5}>
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
              <Col md={7}>
                <Form.Label className="small">Supervisor</Form.Label>
                <Form.Select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)}>
                  <option value="">— Select supervisor —</option>
                  {supervisorsData?.data.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role.replace(/_/g, ' ')})
                    </option>
                  ))}
                </Form.Select>
              </Col>
            </Row>
          </Col>

          {/* Step 3 — Guard Selection: two-panel */}
          <Col md={12}>
            <h6 className="fw-semibold mb-3">Step 3 — Select Guards</h6>
            {!selectedSiteId ? (
              <p className="text-muted small">Select a site first.</p>
            ) : (
              <Row className="g-3">

                {/* LEFT: Available guards */}
                <Col md={6}>
                  <div className="fw-bold mb-2" style={{ color: '#1B3A6B' }}>
                    Available Guards
                  </div>
                  {isAtLimit && (
                    <div className="text-center py-1 mb-2" style={{
                      background: '#d5f5e3', borderRadius: '4px',
                      fontSize: '0.8rem', color: '#1e8449', fontWeight: 500,
                    }}>
                      ✅ Required number of guards reached. Remove a guard to select a different one.
                    </div>
                  )}
                  <div style={{ border: '1px solid #ced4da', borderRadius: '0.375rem', overflow: 'hidden' }}>
                    <div style={{ padding: '6px 8px', borderBottom: '1px solid #e9ecef', background: '#f8f9fa' }}>
                      <Form.Control
                        type="text"
                        size="sm"
                        placeholder="Search guards by name..."
                        value={guardSearch}
                        onChange={(e) => setGuardSearch(e.target.value)}
                      />
                    </div>
                    <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                      {filteredAvailableGuards.length === 0 ? (
                        <div className="p-3 text-muted text-center small">
                          {guardSearch ? 'No guards match your search' : 'All guards selected'}
                        </div>
                      ) : (
                        filteredAvailableGuards.map((guard) => (
                          <div
                            key={guard.id}
                            onClick={() => selectGuard(guard)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '8px 12px',
                              cursor: isAtLimit ? 'not-allowed' : 'pointer',
                              borderBottom: '1px solid #f0f0f0',
                              userSelect: 'none',
                              opacity: isAtLimit ? 0.4 : 1,
                            }}
                            onMouseEnter={(e) => { if (!isAtLimit) e.currentTarget.style.background = '#f8f9fa'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <InitialsAvatar name={`${guard.firstName} ${guard.lastName}`} size={28} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: '0.9rem', fontWeight: 500, color: '#1A1A1A',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              }}>
                                {guard.firstName} {guard.lastName}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                                {guard.rank?.replace(/_/g, ' ') ?? 'Guard'}
                              </div>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#0F7B6C', flexShrink: 0 }}>
                              + Add
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </Col>

                {/* RIGHT: Selected guards */}
                <Col md={6}>
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <span className="fw-bold" style={{ color: '#1B3A6B' }}>Selected Guards</span>
                    <div className="d-flex align-items-center gap-2">
                      {selectedGuards.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedGuards([])}
                          style={{
                            background: 'none', border: 'none', color: '#dc3545',
                            fontSize: '0.8rem', cursor: 'pointer', padding: 0,
                          }}
                        >
                          Clear all
                        </button>
                      )}
                      <Badge bg={selectedGuards.length > 0 ? 'success' : 'secondary'}>
                        {selectedGuards.length} selected
                        {requiredGuards > 0 && ` / ${requiredGuards} required`}
                      </Badge>
                    </div>
                  </div>

                  <div style={{
                    border: '1px solid #ced4da',
                    borderRadius: '0.375rem',
                    minHeight: '310px',
                    background: selectedGuards.length === 0 ? '#f8f9fa' : '#fff',
                  }}>
                    {selectedGuards.length === 0 ? (
                      <div style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                        justifyContent: 'center', height: '310px',
                        color: '#6c757d', textAlign: 'center', padding: '20px',
                      }}>
                        <div style={{ fontSize: '2rem', marginBottom: '8px' }}>👥</div>
                        <div style={{ fontSize: '0.875rem' }}>No guards selected yet</div>
                        <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                          Click a guard on the left to add them
                        </div>
                      </div>
                    ) : (
                      <div style={{ maxHeight: '310px', overflowY: 'auto' }}>
                        {selectedGuards.map((guard, index) => (
                          <div
                            key={guard.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '8px 12px',
                              borderBottom: index < selectedGuards.length - 1 ? '1px solid #f0f0f0' : 'none',
                              background: '#fff',
                            }}
                          >
                            <span style={{
                              width: '22px', height: '22px', background: '#1B3A6B', color: '#fff',
                              borderRadius: '50%', display: 'flex', alignItems: 'center',
                              justifyContent: 'center', fontSize: '0.7rem', fontWeight: 'bold', flexShrink: 0,
                            }}>
                              {index + 1}
                            </span>
                            <InitialsAvatar name={`${guard.firstName} ${guard.lastName}`} size={28} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontSize: '0.9rem', fontWeight: 500, color: '#1A1A1A',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              }}>
                                {guard.firstName} {guard.lastName}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                                {guard.rank?.replace(/_/g, ' ') ?? 'Guard'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeGuard(guard.id)}
                              style={{
                                background: 'none', border: 'none', color: '#dc3545',
                                cursor: 'pointer', fontSize: '1.1rem', padding: '0 4px',
                                flexShrink: 0, lineHeight: 1,
                              }}
                              title="Remove guard"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {requiredGuards > 0 && (
                    <div className="mt-2">
                      {selectedGuards.length === 0 && (
                        <small className="text-muted">This site requires {requiredGuards} guard(s).</small>
                      )}
                      {selectedGuards.length > 0 && selectedGuards.length < requiredGuards && (
                        <small className="text-warning">
                          ⚠️ {requiredGuards - selectedGuards.length} more guard(s) needed for this site.
                        </small>
                      )}
                      {selectedGuards.length === requiredGuards && (
                        <small className="text-success">✅ Required number of guards selected.</small>
                      )}
                      {selectedGuards.length > requiredGuards && (
                        <small className="text-danger">
                          ⚠️ {selectedGuards.length - requiredGuards} guard(s) over the required number.
                        </small>
                      )}
                    </div>
                  )}
                </Col>
              </Row>
            )}
          </Col>

          {/* Step 4 — Schedule */}
          <Col md={12}>
            <h6 className="fw-semibold mb-3">Step 4 — Schedule</h6>
            <Row className="g-3">
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

          {/* Step 5 — Roster Summary (visible when guards + site selected) */}
          {selectedGuards.length > 0 && selectedSiteId && (
            <Col md={12}>
              <div style={{
                padding: '1rem', background: '#D6E0F0',
                borderRadius: '0.5rem', border: '1px solid rgba(27,58,107,0.13)',
              }}>
                <div className="fw-bold mb-2" style={{ color: '#1B3A6B' }}>📋 Roster Summary</div>
                <Row className="g-2 small">
                  <Col xs={6} md={3}>
                    <span className="text-muted d-block">Site</span>
                    <span className="fw-bold">{selectedSite?.siteName ?? '—'}</span>
                  </Col>
                  <Col xs={6} md={3}>
                    <span className="text-muted d-block">Date</span>
                    <span className="fw-bold">
                      {startDate
                        ? new Date(`${startDate}T00:00:00`).toLocaleDateString('en-GB', {
                            day: '2-digit', month: 'short', year: 'numeric',
                          })
                        : '—'}
                    </span>
                  </Col>
                  <Col xs={6} md={3}>
                    <span className="text-muted d-block">Shift</span>
                    <span className="fw-bold">
                      {shiftType === 'FULL_24' ? '24hr' : shiftType.charAt(0) + shiftType.slice(1).toLowerCase()}
                    </span>
                  </Col>
                  <Col xs={6} md={3}>
                    <span className="text-muted d-block">Guards</span>
                    <span className="fw-bold">{selectedGuards.length} guard(s)</span>
                  </Col>
                </Row>
                <div className="mt-2 small text-muted">
                  {selectedGuards.map((g) => `${g.firstName} ${g.lastName}`).join(' · ')}
                </div>
              </div>
            </Col>
          )}

          {/* Submit */}
          <Col md={12}>
            <Button
              style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
              onClick={handleSubmit}
              disabled={createRoster.isPending || !selectedSiteId || selectedGuards.length === 0 || !supervisorId}
            >
              {createRoster.isPending ? (
                <><Spinner size="sm" animation="border" className="me-2" />Creating...</>
              ) : (
                `Create Roster${selectedGuards.length > 0
                  ? ` (${selectedGuards.length} guard${selectedGuards.length !== 1 ? 's' : ''})`
                  : ''}`
              )}
            </Button>
          </Col>

        </Row>
      </Card.Body>
    </Card>
  );
}
