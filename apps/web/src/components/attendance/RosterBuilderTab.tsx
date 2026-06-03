import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Badge, Button, ButtonGroup, Card, Col, Form, Row, Spinner, Table,
} from 'react-bootstrap';
import { useCreateRoster } from '../../hooks/useAttendance';
import { useMyZones, useZones, useZoneRosterData } from '../../hooks/useZones';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import type { ConflictDetail, RosterCreationResult, ZoneSite, ZoneRosterGuard } from '@stap/shared';
import InitialsAvatar from '../ui/InitialsAvatar';
import { exportRosterDraft } from '../../lib/exportToExcel';

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const SHIFT_LABELS: Record<string, string> = { DAY: 'Day', NIGHT: 'Night', FULL_24: '24hr' };

const numberBadgeStyle: React.CSSProperties = {
  width: '28px', height: '28px', borderRadius: '50%',
  background: '#1B3A6B', color: 'white',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 'bold', fontSize: '0.85rem', flexShrink: 0,
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface SelectedGuard {
  id:        string;
  firstName: string;
  lastName:  string;
  rank:      string | null;
  photoUrl:  string | null;
}

const ADMIN_ROLES = ['DIRECTOR', 'ASSISTANT_MANAGER'];

// ── Component ─────────────────────────────────────────────────────────────────

export default function RosterBuilderTab() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const createRoster = useCreateRoster();

  const isAdmin = ADMIN_ROLES.includes(user?.role ?? '');

  // ── Zone data (role-based) ──────────────────────────────────────────────────
  const { data: adminZonesData, isLoading: adminZonesLoading } = useZones({ isActive: true });
  const { data: myZonesRaw, isLoading: myZonesLoading } = useMyZones();

  const zones = isAdmin
    ? (adminZonesData?.data ?? [])
    : (myZonesRaw ?? []);
  const zonesLoading = isAdmin ? adminZonesLoading : myZonesLoading;

  // ── Step state ─────────────────────────────────────────────────────────────
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [selectedDate,   setSelectedDate]   = useState(todayStr());
  const [selectedSite,   setSelectedSite]   = useState<ZoneSite | null>(null);
  const [selectedShift,  setSelectedShift]  = useState<'DAY' | 'NIGHT' | 'FULL_24' | ''>('');
  const [selectedGuards, setSelectedGuards] = useState<SelectedGuard[]>([]);
  const [guardSearch,    setGuardSearch]    = useState('');

  // ── Zone roster data ───────────────────────────────────────────────────────
  const { data: rosterData, isLoading: rosterDataLoading } =
    useZoneRosterData(selectedZoneId || null, selectedDate);

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  // ── Auto-select single zone ─────────────────────────────────────────────────
  useEffect(() => {
    if (zones.length === 1 && !selectedZoneId) {
      setSelectedZoneId(zones[0].id);
    }
  }, [zones, selectedZoneId]);

  // ── Guard filtering ────────────────────────────────────────────────────────
  const selectedIds = useMemo(
    () => new Set(selectedGuards.map((g) => g.id)),
    [selectedGuards],
  );

  const filteredAvailable = useMemo(() => {
    const all: ZoneRosterGuard[] = rosterData?.guards ?? [];
    return all
      .filter((g) => !selectedIds.has(g.id))
      .filter((g) =>
        !guardSearch || g.fullName.toLowerCase().includes(guardSearch.toLowerCase()),
      );
  }, [rosterData, selectedIds, guardSearch]);

  const requiredGuards = selectedSite?.guardsRequired ?? 0;
  const isAtLimit      = requiredGuards > 0 && selectedGuards.length >= requiredGuards;
  const isOverLimit    = requiredGuards > 0 && selectedGuards.length > requiredGuards;

  const badgeBg =
    selectedGuards.length === 0 ? 'secondary' :
    requiredGuards === 0        ? 'success'   :
    selectedGuards.length < requiredGuards  ? 'warning'  :
    selectedGuards.length === requiredGuards ? 'success' : 'danger';

  const badgeText = requiredGuards > 0
    ? `${selectedGuards.length} / ${requiredGuards}`
    : `${selectedGuards.length} selected`;

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleZoneChange(zoneId: string) {
    setSelectedZoneId(zoneId);
    setSelectedSite(null);
    setSelectedGuards([]);
    setGuardSearch('');
    setSelectedShift('');
  }

  function handleDateChange(date: string) {
    setSelectedDate(date);
    setSelectedGuards([]);
  }

  function handleSiteSelect(site: ZoneSite) {
    const isSame = selectedSite?.id === site.id;
    setSelectedSite(isSame ? null : site);
    setSelectedGuards([]);
    setGuardSearch('');
    if (!isSame && site.defaultShiftType) {
      setSelectedShift(site.defaultShiftType as 'DAY' | 'NIGHT' | 'FULL_24');
    }
  }

  function selectGuard(guard: ZoneRosterGuard) {
    if (selectedIds.has(guard.id) || isAtLimit) return;
    setSelectedGuards((prev) => [
      ...prev,
      { id: guard.id, firstName: guard.firstName, lastName: guard.lastName,
        rank: guard.rank, photoUrl: guard.photoUrl },
    ]);
  }

  function removeGuard(guardId: string) {
    setSelectedGuards((prev) => prev.filter((g) => g.id !== guardId));
  }

  function resetAll() {
    setSelectedZoneId('');
    setSelectedSite(null);
    setSelectedGuards([]);
    setGuardSearch('');
    setSelectedShift('');
    setSelectedDate(todayStr());
  }

  const [result, setResult] = useState<{ created: number; conflicts: ConflictDetail[] } | null>(null);

  function handleExportRoster() {
    if (!selectedSite || !selectedShift || selectedGuards.length === 0) return;
    exportRosterDraft({
      zoneName:       selectedZone?.name ?? 'No Zone',
      siteName:       selectedSite.siteName,
      clientName:     selectedSite.client.clientName,
      location:       selectedSite.location,
      date:           selectedDate,
      shiftType:      selectedShift,
      supervisorName: selectedZone?.supervisor?.name ?? user?.name ?? 'N/A',
      guardsRequired: selectedSite.guardsRequired,
      guards:         selectedGuards,
    });
  }

  async function handleSubmit() {
    if (!selectedZoneId || !selectedSite || !selectedShift || selectedGuards.length === 0) return;

    try {
      const data = await createRoster.mutateAsync({
        siteId:      selectedSite.id,
        guardIds:    selectedGuards.map((g) => g.id),
        supervisorId: selectedZone?.supervisorId ?? user!.id,
        shiftType:   selectedShift,
        startDate:   `${selectedDate}T00:00:00.000Z`,
        recurring:   false,
      });
      const rosterResult = data as RosterCreationResult;
      setResult(rosterResult);
      if (rosterResult.conflicts?.length === 0) {
        showToast(`${rosterResult.created} guard(s) deployed successfully.`, 'success');
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to create roster', 'danger');
    }
  }

  // ── Progress step ──────────────────────────────────────────────────────────
  const currentStep = !selectedZoneId ? 1 : !selectedSite ? 2 : 3;

  // ── Success screen ─────────────────────────────────────────────────────────
  if (result) {
    const hasConflicts = result.conflicts.length > 0;
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
                  <tr><th>Guard</th><th>Date</th><th>Already deployed at</th></tr>
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
            <Button variant="outline-primary" onClick={() => { setResult(null); resetAll(); }}>
              Build Another Roster
            </Button>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div>

      {/* ── Progress indicator ────────────────────────────────────────────── */}
      <div className="d-flex align-items-center gap-0 mb-4">
        {([
          { num: 1, label: 'Zone & Date' },
          { num: 2, label: 'Site' },
          { num: 3, label: 'Guards' },
        ] as const).map((step, i) => (
          <React.Fragment key={step.num}>
            <div className="d-flex flex-column align-items-center">
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: currentStep >= step.num ? '#1B3A6B' : '#e9ecef',
                color:      currentStep >= step.num ? '#fff'    : '#6c757d',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 'bold', fontSize: '0.85rem',
                transition: 'all 0.2s ease',
              }}>
                {currentStep > step.num ? '✓' : step.num}
              </div>
              <div style={{
                fontSize: '0.7rem', marginTop: '4px', whiteSpace: 'nowrap',
                color:      currentStep >= step.num ? '#1B3A6B' : '#6c757d',
                fontWeight: currentStep === step.num ? 600 : 400,
              }}>
                {step.label}
              </div>
            </div>
            {i < 2 && (
              <div style={{
                flex: 1, height: '2px', margin: '0 4px', marginBottom: '18px',
                background:  currentStep > step.num ? '#1B3A6B' : '#e9ecef',
                transition: 'background 0.2s ease',
              }} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* ── SECTION 1: Zone & Date ────────────────────────────────────────── */}
      <Card className="mb-3">
        <Card.Header className="d-flex align-items-center gap-2">
          <span style={numberBadgeStyle}>1</span>
          <span className="fw-bold">Select Zone and Date</span>
        </Card.Header>
        <Card.Body>
          {!isAdmin && zones.length === 0 && !zonesLoading && (
            <Alert variant="warning" className="mb-0">
              You are not assigned to any zones. Contact your manager to be assigned to a zone.
            </Alert>
          )}
          <Row className="g-3">
            <Col md={7}>
              <Form.Label className="fw-bold small">
                Zone <span className="text-danger">*</span>
              </Form.Label>
              {zonesLoading ? (
                <div className="d-flex align-items-center gap-2 text-muted small py-2">
                  <Spinner size="sm" animation="border" /> Loading zones...
                </div>
              ) : (
                <Form.Select
                  value={selectedZoneId}
                  onChange={(e) => handleZoneChange(e.target.value)}
                >
                  <option value="">— Select a zone —</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}{z.supervisor ? ` — ${z.supervisor.name}` : ''}
                    </option>
                  ))}
                </Form.Select>
              )}
              {selectedZone && (
                <div className="mt-2 small text-muted">
                  🗺️ {selectedZone.name}
                  {selectedZone.supervisor && ` · Supervisor: ${selectedZone.supervisor.name}`}
                  {selectedZone.alternate  && ` · Alternate: ${selectedZone.alternate.name}`}
                </div>
              )}
            </Col>
            <Col md={5}>
              <Form.Label className="fw-bold small">
                Deployment Date <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
              />
              {selectedDate && (
                <div className="mt-2 small text-muted">
                  📅 {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', {
                    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
                  })}
                </div>
              )}
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* ── SECTION 2: Select Site ────────────────────────────────────────── */}
      {selectedZoneId && (
        <Card className="mb-3">
          <Card.Header className="d-flex align-items-center gap-2">
            <span style={numberBadgeStyle}>2</span>
            <span className="fw-bold">Select Site</span>
            {selectedSite && (
              <Badge bg="success" className="ms-auto">{selectedSite.siteName}</Badge>
            )}
          </Card.Header>
          <Card.Body>
            {rosterDataLoading ? (
              <div className="text-center py-3">
                <Spinner size="sm" animation="border" className="me-2" />
                Loading zone sites...
              </div>
            ) : (rosterData?.sites.length ?? 0) === 0 ? (
              <Alert variant="warning" className="mb-0">
                This zone has no active sites assigned. Go to the Zones page to assign sites
                before building a roster.
              </Alert>
            ) : (
              <Row className="g-2">
                {rosterData!.sites.map((site) => {
                  const isSelected = selectedSite?.id === site.id;
                  return (
                    <Col key={site.id} md={6}>
                      <div
                        onClick={() => handleSiteSelect(site)}
                        style={{
                          padding: '12px',
                          border: `2px solid ${isSelected ? '#0F7B6C' : '#ced4da'}`,
                          borderRadius: '0.5rem',
                          cursor: 'pointer',
                          background: isSelected ? '#D0EDE9' : '#fff',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = '#0F7B6C88';
                            e.currentTarget.style.background  = '#f8f9fa';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.borderColor = '#ced4da';
                            e.currentTarget.style.background  = '#fff';
                          }
                        }}
                      >
                        <div className="d-flex justify-content-between align-items-start">
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="fw-bold" style={{ fontSize: '0.9rem' }}>
                              {site.siteName}
                            </div>
                            <div className="text-muted" style={{ fontSize: '0.78rem' }}>
                              {site.client.clientName}
                            </div>
                            <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                              📍 {site.location}
                            </div>
                          </div>
                          <div className="text-end ms-2" style={{ flexShrink: 0 }}>
                            <Badge bg="secondary" className="d-block mb-1" style={{ fontSize: '0.65rem' }}>
                              {site.siteType.replace(/_/g, ' ')}
                            </Badge>
                            <small className="text-muted">{site.guardsRequired} req.</small>
                          </div>
                        </div>
                        {(site.requiresFirearms || site.requiresArmedGuards) && (
                          <div className="mt-2 d-flex gap-1 flex-wrap">
                            {site.requiresFirearms && (
                              <Badge bg="danger" style={{ fontSize: '0.65rem' }}>🔥 Firearms</Badge>
                            )}
                            {site.requiresArmedGuards && (
                              <Badge bg="warning" text="dark" style={{ fontSize: '0.65rem' }}>🔫 Armed</Badge>
                            )}
                          </div>
                        )}
                        {site.specialInstructions && (
                          <div style={{
                            marginTop: '8px', paddingTop: '8px',
                            borderTop: '1px solid #e0e0e0',
                            fontSize: '0.75rem', color: '#4A5568', lineHeight: 1.4,
                          }}>
                            <span style={{
                              fontWeight: 600, color: '#1B3A6B', fontSize: '0.72rem',
                              textTransform: 'uppercase', letterSpacing: '0.3px',
                            }}>
                              📋 Instructions:{' '}
                            </span>
                            {site.specialInstructions.length > 80
                              ? `${site.specialInstructions.substring(0, 80)}...`
                              : site.specialInstructions}
                          </div>
                        )}
                        {isSelected && (
                          <div className="mt-2" style={{ fontSize: '0.75rem', color: '#0F7B6C', fontWeight: 500 }}>
                            ✓ Selected
                          </div>
                        )}
                      </div>
                    </Col>
                  );
                })}
              </Row>
            )}
          </Card.Body>
        </Card>
      )}

      {/* ── SECTION 3: Assign Guards ──────────────────────────────────────── */}
      {selectedSite && (
        <Card className="mb-3">
          <Card.Header className="d-flex align-items-center gap-2">
            <span style={numberBadgeStyle}>3</span>
            <span className="fw-bold">Assign Guards to {selectedSite.siteName}</span>
          </Card.Header>
          <Card.Body>

            {/* Special instructions alert */}
            {selectedSite.specialInstructions && (
              <Alert variant="warning" className="mb-4" style={{
                borderLeft: '4px solid #E8701A', background: '#FEF9E7', borderRadius: '0.5rem',
              }}>
                <div className="d-flex align-items-start gap-2">
                  <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>📋</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#1B3A6B', fontSize: '0.88rem', marginBottom: '4px' }}>
                      Special Instructions — {selectedSite.siteName}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#4A5568', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {selectedSite.specialInstructions}
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '0.72rem', color: '#6c757d' }}>
                      These instructions apply to all guards deployed at this site. Ensure all guards are briefed before deployment.
                    </div>
                  </div>
                </div>
              </Alert>
            )}

            {/* Shift selection */}
            <div className="mb-3">
              <Form.Label className="fw-bold small">
                Shift Type <span className="text-danger">*</span>
              </Form.Label>
              <div className="d-flex gap-2">
                {(['DAY', 'NIGHT', 'FULL_24'] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={selectedShift === s ? 'primary' : 'outline-secondary'}
                    onClick={() => setSelectedShift(s)}
                  >
                    {SHIFT_LABELS[s]}
                  </Button>
                ))}
              </div>
            </div>

            {/* Two-panel guard selection */}
            <Row className="g-3">

              {/* LEFT: Available guards */}
              <Col md={6}>
                <div className="fw-bold mb-2" style={{ color: '#1B3A6B' }}>Available Guards</div>
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
                  {isAtLimit && (
                    <div style={{
                      padding: '6px 12px', background: '#d5f5e3', borderBottom: '1px solid #a9dfbf',
                      display: 'flex', alignItems: 'center', gap: '6px',
                      fontSize: '0.8rem', color: '#1e8449', fontWeight: 500,
                    }}>
                      <span>🔒</span>
                      <span>Limit reached — {requiredGuards} guard(s) selected. Remove a guard to select a different one.</span>
                    </div>
                  )}
                  <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                    {filteredAvailable.length === 0 ? (
                      <div className="p-3 text-muted text-center small">
                        {guardSearch ? 'No guards match your search' : 'All guards selected'}
                      </div>
                    ) : (
                      filteredAvailable.map((guard) => (
                        <div
                          key={guard.id}
                          onClick={() => { if (!isAtLimit) selectGuard(guard); }}
                          title={isAtLimit
                            ? `Maximum ${requiredGuards} guard(s) already selected`
                            : `Click to select ${guard.firstName} ${guard.lastName}`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '8px 12px',
                            cursor: isAtLimit ? 'not-allowed' : 'pointer',
                            borderBottom: '1px solid #f0f0f0',
                            userSelect: 'none',
                            opacity: isAtLimit ? 0.35 : 1,
                            pointerEvents: isAtLimit ? 'none' : 'auto',
                            transition: 'opacity 0.15s ease',
                          }}
                          onMouseEnter={(e) => { if (!isAtLimit) e.currentTarget.style.background = '#f8f9fa'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                        >
                          <InitialsAvatar name={guard.fullName} size={28} />
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
                          {guard.alreadyDeployed && (
                            <span style={{
                              fontSize: '0.65rem', background: '#fff3cd', color: '#856404',
                              padding: '1px 5px', borderRadius: '4px', flexShrink: 0, fontWeight: 500,
                            }}>
                              ⚠️ Deployed
                            </span>
                          )}
                          {!guard.alreadyDeployed && (
                            <span style={{ fontSize: '0.75rem', color: '#0F7B6C', flexShrink: 0 }}>
                              + Add
                            </span>
                          )}
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
                    <Badge bg={badgeBg} text={badgeBg === 'warning' ? 'dark' : undefined}>
                      {badgeText}
                    </Badge>
                  </div>
                </div>

                <div style={{
                  border: '1px solid #ced4da', borderRadius: '0.375rem',
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
                  <div style={{ marginTop: '6px', fontSize: '0.8rem' }}>
                    {selectedGuards.length === 0 && (
                      <span className="text-muted">
                        This site requires <strong>{requiredGuards}</strong> guard(s). Select from the list on the left.
                      </span>
                    )}
                    {selectedGuards.length > 0 && selectedGuards.length < requiredGuards && (
                      <span style={{ color: '#856404' }}>
                        ⚠️ {requiredGuards - selectedGuards.length} more guard(s) needed.
                      </span>
                    )}
                    {selectedGuards.length === requiredGuards && (
                      <span style={{ color: '#1e8449' }}>
                        ✅ All {requiredGuards} guard(s) selected. Ready to deploy.
                      </span>
                    )}
                    {isOverLimit && (
                      <span style={{ color: '#dc3545' }}>
                        ⚠️ {selectedGuards.length - requiredGuards} guard(s) over the required number.
                      </span>
                    )}
                  </div>
                )}
              </Col>
            </Row>
          </Card.Body>
        </Card>
      )}

      {/* ── Roster Summary + Submit ───────────────────────────────────────── */}
      {selectedSite && selectedGuards.length > 0 && selectedShift && (
        <Card className="border-0" style={{ background: '#D6E0F0' }}>
          <Card.Body>
            <div className="fw-bold mb-2" style={{ color: '#1B3A6B' }}>📋 Roster Summary</div>
            <Row className="g-2 small mb-3">
              <Col xs={6}>
                <span className="text-muted d-block">Zone</span>
                <span className="fw-bold">{selectedZone?.name ?? '—'}</span>
              </Col>
              <Col xs={6}>
                <span className="text-muted d-block">Site</span>
                <span className="fw-bold">{selectedSite.siteName}</span>
              </Col>
              <Col xs={6}>
                <span className="text-muted d-block">Date</span>
                <span className="fw-bold">
                  {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}
                </span>
              </Col>
              <Col xs={6}>
                <span className="text-muted d-block">Shift</span>
                <span className="fw-bold">{SHIFT_LABELS[selectedShift]}</span>
              </Col>
            </Row>
            <div className="small text-muted mb-3">
              Guards: {selectedGuards.map((g) => `${g.firstName} ${g.lastName}`).join(' · ')}
            </div>

            <Button
              variant={isOverLimit ? 'warning' : 'primary'}
              style={isOverLimit ? undefined : { backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
              className="w-100"
              disabled={createRoster.isPending}
              onClick={handleSubmit}
            >
              {createRoster.isPending ? (
                <><Spinner size="sm" animation="border" className="me-2" />Creating roster...</>
              ) : (
                <>
                  {isOverLimit && '⚠️ '}
                  {`Create Roster — ${selectedGuards.length} guard${selectedGuards.length !== 1 ? 's' : ''} at ${selectedSite.siteName}`}
                </>
              )}
            </Button>

            <Button
              variant="outline-success"
              className="w-100 mt-2"
              onClick={handleExportRoster}
            >
              <i className="bi bi-file-earmark-excel me-2" />Export Roster to Excel
            </Button>

            {isOverLimit && (
              <div className="text-warning small mt-1">
                ⚠️ You have selected more guards than required ({requiredGuards} required,{' '}
                {selectedGuards.length} selected). This is allowed but please confirm it is intentional.
              </div>
            )}
          </Card.Body>
        </Card>
      )}

    </div>
  );
}
