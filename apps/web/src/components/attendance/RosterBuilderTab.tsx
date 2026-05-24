import { useState, useMemo } from 'react';
import {
  Alert, Badge, Button, ButtonGroup, Card, Col, Form, Row, Spinner, Table,
} from 'react-bootstrap';
import { useCreateRoster } from '../../hooks/useAttendance';
import { useShiftTypes } from '../../hooks/useSettings';
import { useToast } from '../../context/ToastContext';
import { SearchableSelect } from '../ui/SearchableSelect';
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

type DeploymentType = 'UNARMED' | 'ARMED' | 'FIREARMS';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function RosterBuilderTab() {
  const { showToast } = useToast();
  const createRoster = useCreateRoster();
  const { data: shiftTypes = [] } = useShiftTypes(true);

  // Step state
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedGuardIds, setSelectedGuardIds] = useState<string[]>([]);
  const [guardOvertimeHours, setGuardOvertimeHours] = useState<Record<string, number>>({});
  const [shiftTypeCode, setShiftTypeCode] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [supervisorId, setSupervisorId] = useState('');
  const [startDate, setStartDate] = useState(todayStr());
  const [recurring, setRecurring] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [deploymentType, setDeploymentType] = useState<DeploymentType>('UNARMED');
  const [weaponsDetails, setWeaponsDetails] = useState('');

  // Guard list search state
  const [guardSearch, setGuardSearch] = useState('');

  const [result, setResult] = useState<{ created: number; conflicts: ConflictDetail[] } | null>(null);

  // Fetch all sites
  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ['sites-all'],
    queryFn: () => clientsApi.getAllSites({ limit: 200 }),
  });

  // Fetch all active guards
  const { data: guardsData } = useQuery({
    queryKey: ['guards-roster'],
    queryFn: () => guardsApi.list({ page: 1, limit: 200, status: 'ACTIVE', sortBy: 'lastName', sortOrder: 'asc' }),
  });

  // Fetch supervisors
  const { data: supervisorsData, isLoading: supervisorsLoading } = useQuery({
    queryKey: ['supervisors'],
    queryFn: () => usersApi.list({ roles: 'OPERATIONS_SUPERVISOR,FIELD_SUPERVISOR', status: 'ACTIVE' }),
    staleTime: 5 * 60 * 1000,
  });

  const selectedSite = sitesData?.data.find((s) => s.id === selectedSiteId) as (SiteResponse & { client?: { clientName: string } }) | undefined;

  // Shift types filtered to those allowed at the selected site
  const availableShiftTypes = useMemo(() => {
    if (!selectedSite?.allowedShiftTypes?.length) return shiftTypes;
    return shiftTypes.filter((s) => selectedSite.allowedShiftTypes.includes(s.code));
  }, [shiftTypes, selectedSite]);

  // Build options for SearchableSelect
  const siteOptions = useMemo(
    () => (sitesData?.data ?? []).map((s) => ({
      value:    s.id,
      label:    s.siteName,
      sublabel: (s as SiteResponse & { client?: { clientName: string } }).client?.clientName ?? '',
    })),
    [sitesData],
  );

  const supervisorOptions = useMemo(
    () => (supervisorsData?.data ?? []).map((u) => ({
      value:    u.id,
      label:    u.name,
      sublabel: u.role.replace(/_/g, ' '),
    })),
    [supervisorsData],
  );

  const filteredGuards = useMemo(() => {
    if (!guardsData?.data) return [];
    const q = guardSearch.toLowerCase();
    return guardsData.data.filter((g) =>
      `${g.fullName} ${g.phone ?? ''}`.toLowerCase().includes(q),
    );
  }, [guardsData, guardSearch]);

  function handleSiteChange(siteId: string) {
    setSelectedSiteId(siteId);
    setSelectedGuardIds([]);

    const site = sitesData?.data.find((s) => s.id === siteId) as (SiteResponse & { client?: { clientName: string } }) | undefined;
    if (!site) return;

    // Auto-select default shift type and fill times
    if (site.defaultShiftType) {
      handleShiftSelect(site.defaultShiftType);
    }

    // Auto-set deployment type based on site security requirements
    if (site.requiresFirearms) {
      setDeploymentType('FIREARMS');
    } else if (site.requiresArmedGuards) {
      setDeploymentType('ARMED');
    } else {
      setDeploymentType('UNARMED');
    }
  }

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

  function handleShiftSelect(code: string) {
    setShiftTypeCode(code);
    const shift = shiftTypes.find((s) => s.code === code);
    if (shift?.startTime) setStartTime(shift.startTime);
    if (shift?.endTime) setEndTime(shift.endTime);
  }

  async function handleSubmit() {
    if (!selectedSiteId) return showToast('Please select a site', 'warning');
    if (selectedGuardIds.length === 0) return showToast('Please select at least one guard', 'warning');
    if (!shiftTypeCode) return showToast('Please select a shift type', 'warning');
    if (!supervisorId) return showToast('Please select a supervisor', 'warning');

    try {
      const data = await createRoster.mutateAsync({
        siteId:       selectedSiteId,
        guardIds:     selectedGuardIds.map((id) => ({
          guardId:      id,
          overtimeHours: guardOvertimeHours[id] ?? 0,
        })),
        supervisorId,
        shiftType: shiftTypeCode,
        startDate: `${startDate}T00:00:00.000Z`,
        endDate: recurring && endDate ? `${endDate}T23:59:59.999Z` : undefined,
        recurring,
        daysOfWeek: recurring ? daysOfWeek : undefined,
        deploymentType,
        weaponsDetails: weaponsDetails || undefined,
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

  const selectedShift = shiftTypes.find((s) => s.code === shiftTypeCode);

  return (
    <Card className="border-0 shadow-sm">
      <Card.Body>
        <Row className="g-4">
          {/* Step 1 — Site */}
          <Col md={6}>
            <h6 className="fw-semibold mb-2">Step 1 — Select Site</h6>
            <SearchableSelect
              options={siteOptions}
              value={selectedSiteId}
              onChange={handleSiteChange}
              placeholder="— Choose a site —"
              searchPlaceholder="Search sites..."
              isLoading={sitesLoading}
            />
            {selectedSite && (
              <div className="mt-2 text-muted small">
                Guards required: <strong>{selectedSite.guardsRequired}</strong>
              </div>
            )}
            {selectedSite && (selectedSite.requiresFirearms || selectedSite.requiresArmedGuards || selectedSite.requiresWeapons) && (
              <Alert variant="warning" className="py-2 mt-2 mb-0">
                <strong>⚠️ Security Requirements:</strong>
                <ul className="mb-0 mt-1 small ps-3">
                  {selectedSite.requiresFirearms    && <li>🔥 Firearms required at this site</li>}
                  {selectedSite.requiresArmedGuards && <li>🔫 Armed guards required</li>}
                  {selectedSite.requiresWeapons     && <li>🛡️ Other weapons/equipment required</li>}
                  {selectedSite.equipmentDetails    && <li>{selectedSite.equipmentDetails}</li>}
                </ul>
              </Alert>
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
              <div style={{ border: '1px solid #ced4da', borderRadius: '0.375rem', overflow: 'hidden' }}>
                {/* Search inside the guard list box */}
                <div style={{ padding: '6px 8px', borderBottom: '1px solid #e9ecef', background: '#f8f9fa' }}>
                  <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Search guards by name or phone..."
                    value={guardSearch}
                    onChange={(e) => setGuardSearch(e.target.value)}
                  />
                </div>
                {/* Scrollable guard checkboxes */}
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {filteredGuards.length === 0 ? (
                    <div className="p-3 text-muted text-center small">No guards found</div>
                  ) : (
                    filteredGuards.map((g) => (
                      <div key={g.id} className="d-flex align-items-center gap-2" style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0' }}>
                        <Form.Check
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
                          style={{ flex: 1 }}
                        />
                        {selectedGuardIds.includes(g.id) && (
                          <div className="d-flex align-items-center gap-1" style={{ minWidth: 120 }}>
                            <span className="text-muted" style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>OT hrs:</span>
                            <Form.Control
                              type="number"
                              size="sm"
                              min={0}
                              step={0.5}
                              value={guardOvertimeHours[g.id] ?? ''}
                              placeholder="0"
                              onChange={(e) => setGuardOvertimeHours((prev) => ({
                                ...prev,
                                [g.id]: parseFloat(e.target.value) || 0,
                              }))}
                              style={{ width: 60, fontSize: '0.75rem' }}
                            />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </Col>

          {/* Step 3 — Details */}
          <Col md={12}>
            <h6 className="fw-semibold mb-3">Step 3 — Assignment Details</h6>
            <Row className="g-3">
              {/* Shift Type */}
              <Col md={4}>
                <Form.Label className="small">
                  Shift Type
                  {selectedSite?.allowedShiftTypes?.length ? (
                    <span className="text-muted ms-1" style={{ fontSize: '0.7rem' }}>
                      (filtered by site)
                    </span>
                  ) : null}
                </Form.Label>
                {availableShiftTypes.length === 0 ? (
                  <p className="text-muted small">Loading shift types...</p>
                ) : (
                  <div className="d-flex gap-3 flex-wrap">
                    {availableShiftTypes.map((s) => (
                      <Form.Check
                        key={s.id}
                        type="radio"
                        id={`shift-${s.code}`}
                        name="shiftTypeCode"
                        value={s.code}
                        label={
                          <span>
                            {s.name}
                            {s.isOvertime && <Badge bg="warning" text="dark" className="ms-1" style={{ fontSize: '0.6rem' }}>OT</Badge>}
                          </span>
                        }
                        checked={shiftTypeCode === s.code}
                        onChange={() => handleShiftSelect(s.code)}
                      />
                    ))}
                  </div>
                )}
              </Col>

              {/* Auto-filled times */}
              <Col md={4}>
                <Form.Label className="small">Start Time</Form.Label>
                <Form.Control
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  placeholder="Auto-fills on shift select"
                />
                {selectedShift?.startTime && (
                  <Form.Text className="text-muted">Default: {selectedShift.startTime}</Form.Text>
                )}
              </Col>

              <Col md={4}>
                <Form.Label className="small">End Time</Form.Label>
                <Form.Control
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  placeholder="Auto-fills on shift select"
                />
                {selectedShift?.endTime && (
                  <Form.Text className="text-muted">Default: {selectedShift.endTime}</Form.Text>
                )}
              </Col>

              {/* Deployment Type */}
              <Col md={12}>
                <Form.Label className="small">Deployment Type</Form.Label>
                <div>
                  <ButtonGroup>
                    {(['UNARMED', 'ARMED', 'FIREARMS'] as DeploymentType[]).map((dt) => (
                      <Button
                        key={dt}
                        size="sm"
                        variant={deploymentType === dt ? (dt === 'UNARMED' ? 'secondary' : dt === 'ARMED' ? 'warning' : 'danger') : 'outline-secondary'}
                        onClick={() => setDeploymentType(dt)}
                      >
                        {dt === 'UNARMED' ? 'Unarmed' : dt === 'ARMED' ? '🔫 Armed' : '🔥 Firearms'}
                      </Button>
                    ))}
                  </ButtonGroup>
                </div>
                {deploymentType !== 'UNARMED' && (
                  <Form.Control
                    as="textarea"
                    rows={2}
                    className="mt-2"
                    placeholder="Specify weapons or equipment issued (optional)"
                    value={weaponsDetails}
                    onChange={(e) => setWeaponsDetails(e.target.value)}
                  />
                )}
              </Col>

              <Col md={4}>
                <Form.Label className="small">Supervisor</Form.Label>
                <SearchableSelect
                  options={supervisorOptions}
                  value={supervisorId}
                  onChange={setSupervisorId}
                  placeholder="— Select supervisor —"
                  searchPlaceholder="Search supervisors..."
                  isLoading={supervisorsLoading}
                />
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
                  <Col md={3}><span className="text-muted">Shift:</span> <strong>{selectedShift?.name ?? (shiftTypeCode || '—')}</strong></Col>
                  <Col md={3}><span className="text-muted">Start:</span> <strong>{startDate}</strong></Col>
                  <Col md={3}><span className="text-muted">Type:</span> <strong>{deploymentType}</strong></Col>
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
              disabled={createRoster.isPending || !selectedSiteId || selectedGuardIds.length === 0 || !supervisorId || !shiftTypeCode}
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
