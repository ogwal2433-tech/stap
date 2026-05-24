import { useState, useMemo } from 'react';
import {
  Alert, Badge, Button, Card, Col, Form, Modal, Row, Spinner, Tab, Tabs, Table,
  Accordion,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDailySheet, useMarkAttendance, useDeleteDeployment, useCopyRoster } from '../../hooks/useAttendance';
import { useClientList } from '../../hooks/useClients';
import { useToast } from '../../context/ToastContext';
import RoleGuard from '../../components/RoleGuard';
import InitialsAvatar from '../../components/ui/InitialsAvatar';
import { ROLES, type UserRole } from '@stap/shared';
import type { MarkAttendanceInput, GuardBasicResponse } from '@stap/shared';
import { attendanceApi } from '../../lib/attendance.api';
import RosterBuilderTab from '../../components/attendance/RosterBuilderTab';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'AWOL' | '';

interface AttendanceEdit {
  status: AttendanceStatus;
  timeIn: string;
  timeOut: string;
  notes: string;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: '', label: '— Not Marked —' },
  { value: 'PRESENT', label: '✅ Present' },
  { value: 'ABSENT', label: '❌ Absent' },
  { value: 'LATE', label: '🕐 Late' },
  { value: 'AWOL', label: '🚨 AWOL' },
];

const STATUS_BADGE: Record<string, string> = {
  PRESENT: 'success',
  ABSENT: 'danger',
  LATE: 'warning',
  AWOL: 'dark',
};

const SHIFT_BADGE: Record<string, { bg: string; label: string }> = {
  DAY:     { bg: 'primary',   label: 'Day' },
  NIGHT:   { bg: 'secondary', label: 'Night' },
  FULL_24: { bg: 'dark',      label: '24hr' },
};

const DEPLOY_TYPE_BADGE: Record<string, { bg: string; label: string } | undefined> = {
  ARMED:    { bg: 'warning', label: '🔫 Armed' },
  FIREARMS: { bg: 'danger',  label: '🔥 Firearms' },
};

const ROSTER_WRITE: UserRole[] = [ROLES.DIRECTOR, ROLES.OPERATIONS_SUPERVISOR];
const ATTENDANCE_WRITE: UserRole[] = [
  ROLES.DIRECTOR,
  ROLES.ADMINISTRATOR,
  ROLES.OPERATIONS_SUPERVISOR,
  ROLES.FIELD_SUPERVISOR,
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [sheetSearch, setSheetSearch] = useState('');

  // Copy roster modal state
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceDate, setCopySourceDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [copyTargetDate, setCopyTargetDate] = useState(todayStr());
  const copyRoster = useCopyRoster();

  // Replacement prompt state: key = deploymentId
  const [replacementPrompt, setReplacementPrompt] = useState<Record<string, boolean>>({});
  const [replacements, setReplacements] = useState<Record<string, GuardBasicResponse[]>>({});
  const [loadingReplacements, setLoadingReplacements] = useState<Record<string, boolean>>({});

  // Per-guard editable attendance state: key = `guardId:siteId:deploymentId`
  const [edits, setEdits] = useState<Record<string, AttendanceEdit>>({});

  const { data: sheet, isLoading, refetch } = useDailySheet(
    selectedDate,
    selectedSiteId || undefined,
  );
  const { data: clients } = useClientList({ limit: 100 });
  const markAttendance = useMarkAttendance();
  const deleteDeployment = useDeleteDeployment();

  // Build flat list of all sites for the filter dropdown
  const allSites = useMemo(() => {
    if (!sheet) return [];
    return sheet.sites.map((s) => s.site);
  }, [sheet]);

  function getEdit(key: string, deployment: { attendance?: { status: string; timeIn: string | null; timeOut: string | null; notes: string | null } | undefined }): AttendanceEdit {
    if (edits[key]) return edits[key];
    if (deployment.attendance) {
      return {
        status: deployment.attendance.status as AttendanceStatus,
        timeIn: deployment.attendance.timeIn
          ? deployment.attendance.timeIn.substring(11, 16)
          : '',
        timeOut: deployment.attendance.timeOut
          ? deployment.attendance.timeOut.substring(11, 16)
          : '',
        notes: deployment.attendance.notes ?? '',
      };
    }
    return { status: '', timeIn: '', timeOut: '', notes: '' };
  }

  function setEdit(key: string, patch: Partial<AttendanceEdit>) {
    setEdits((prev) => ({ ...prev, [key]: { ...getEdit(key, {}), ...prev[key], ...patch } }));
  }

  function markSiteAll(siteId: string, status: 'PRESENT' | 'ABSENT') {
    const siteData = sheet?.sites.find((s) => s.site.id === siteId);
    if (!siteData) return;
    const updates: Record<string, AttendanceEdit> = {};
    for (const d of siteData.deployments) {
      const key = `${d.guard.id}:${siteId}:${d.id}`;
      updates[key] = { ...getEdit(key, d), status };
    }
    setEdits((prev) => ({ ...prev, ...updates }));
  }

  async function handleSaveAttendance() {
    const records: MarkAttendanceInput['records'] = [];
    for (const [key, edit] of Object.entries(edits)) {
      if (!edit.status) continue;
      const [guardId, siteId] = key.split(':');
      records.push({
        guardId,
        siteId,
        date: `${selectedDate}T00:00:00.000Z`,
        status: edit.status as 'PRESENT' | 'ABSENT' | 'LATE' | 'AWOL',
        timeIn: edit.timeIn || undefined,
        timeOut: edit.timeOut || undefined,
        notes: edit.notes || undefined,
      });
    }

    if (records.length === 0) {
      showToast('No attendance changes to save', 'warning');
      return;
    }

    try {
      const result = await markAttendance.mutateAsync(records);
      showToast(`Attendance saved for ${result.marked + result.updated} guard(s)`, 'success');
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ['deployments-today'] });
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      refetch();
    } catch {
      showToast('Failed to save attendance', 'danger');
    }
  }

  function handleStatusChange(key: string, status: string, deploymentId: string) {
    setEdit(key, { status: status as AttendanceStatus });
    if (status === 'ABSENT' || status === 'AWOL') {
      setReplacementPrompt((prev) => ({ ...prev, [deploymentId]: true }));
    } else {
      setReplacementPrompt((prev) => ({ ...prev, [deploymentId]: false }));
    }
  }

  async function loadReplacements(deploymentId: string, siteId: string, absentGuardId: string) {
    setLoadingReplacements((prev) => ({ ...prev, [deploymentId]: true }));
    try {
      const guards = await attendanceApi.getAvailableReplacements(
        siteId,
        `${selectedDate}T00:00:00.000Z`,
        absentGuardId,
      );
      setReplacements((prev) => ({ ...prev, [deploymentId]: guards }));
    } catch {
      showToast('Failed to load available replacements', 'danger');
    } finally {
      setLoadingReplacements((prev) => ({ ...prev, [deploymentId]: false }));
    }
  }

  async function assignReplacement(repGuardId: string, siteId: string, supervisorId: string, shiftType: string, originalGuardId: string, deploymentId: string) {
    try {
      await attendanceApi.createRoster({
        siteId,
        guardIds: [repGuardId],
        supervisorId,
        shiftType,
        startDate: `${selectedDate}T00:00:00.000Z`,
        replacementForGuardId: originalGuardId,
      } as Parameters<typeof attendanceApi.createRoster>[0]);
      showToast('Replacement assigned', 'success');
      setReplacementPrompt((prev) => ({ ...prev, [deploymentId]: false }));
      queryClient.invalidateQueries({ queryKey: ['daily-sheet'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to assign replacement';
      showToast(msg, 'danger');
    }
  }

  async function handleCopyRoster() {
    try {
      await copyRoster.mutateAsync({
        sourceDate: `${copySourceDate}T00:00:00.000Z`,
        targetDate: `${copyTargetDate}T00:00:00.000Z`,
      });
      setShowCopyModal(false);
      setSelectedDate(copyTargetDate);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to copy roster';
      showToast(msg, 'danger');
    }
  }

  async function handleDeleteDeployment(id: string) {
    if (!confirm('Remove this guard from the roster? This cannot be undone.')) return;
    try {
      await deleteDeployment.mutateAsync(id);
      showToast('Deployment removed', 'success');
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove deployment';
      showToast(msg, 'danger');
    }
  }

  const deploymentSheet = (
    <div>
      {/* Controls */}
      <Card className="border-0 shadow-sm mb-3 d-print-none">
        <Card.Body>
          <Row className="align-items-end g-2">
            <Col md={3}>
              <Form.Label className="small fw-semibold">Date</Form.Label>
              <Form.Control
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setEdits({});
                }}
              />
            </Col>
            <Col md={3}>
              <Form.Label className="small fw-semibold">Site</Form.Label>
              <Form.Select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
              >
                <option value="">All Sites</option>
                {allSites.map((s) => (
                  <option key={s.id} value={s.id}>{s.siteName}</option>
                ))}
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Label className="small fw-semibold">Search</Form.Label>
              <div className="d-flex">
                <Form.Control
                  type="text"
                  placeholder="Guard name or site..."
                  value={sheetSearch}
                  onChange={(e) => setSheetSearch(e.target.value)}
                  size="sm"
                />
                {sheetSearch && (
                  <Button size="sm" variant="link" className="px-1" onClick={() => setSheetSearch('')}>✕</Button>
                )}
              </div>
            </Col>
            <Col className="ms-auto d-flex gap-2 justify-content-end align-items-end">
              <RoleGuard allowedRoles={ROSTER_WRITE}>
                <Button
                  variant="outline-primary"
                  size="sm"
                  onClick={() => setShowCopyModal(true)}
                >
                  <i className="bi bi-copy me-1" />Copy Roster
                </Button>
              </RoleGuard>
              <RoleGuard allowedRoles={ATTENDANCE_WRITE}>
                <Button
                  variant="success"
                  size="sm"
                  onClick={handleSaveAttendance}
                  disabled={markAttendance.isPending}
                >
                  {markAttendance.isPending
                    ? <Spinner size="sm" animation="border" />
                    : 'Save Attendance'}
                </Button>
              </RoleGuard>
              <Button variant="outline-secondary" size="sm" onClick={() => window.print()}>
                <i className="bi bi-printer me-1" />Print Sheet
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Print header */}
      <div className="d-none d-print-block mb-3">
        <h5 className="fw-bold">STAP Security Ltd — Daily Deployment Sheet</h5>
        <div className="small">Date: {selectedDate}</div>
      </div>

      {isLoading && (
        <div className="text-center py-5">
          <Spinner animation="border" variant="primary" />
        </div>
      )}

      {!isLoading && (!sheet || sheet.sites.length === 0) && (
        <Alert variant="light">
          No deployments found for {selectedDate}.{' '}
          <button
            className="btn btn-link p-0 small"
            onClick={() => navigate('/attendance', { state: { tab: 'roster' } })}
          >
            Build a roster
          </button>
        </Alert>
      )}

      {sheet && sheet.sites.length > 0 && (
        <Accordion defaultActiveKey={sheet.sites.map((_, i) => String(i))} alwaysOpen>
          {sheet.sites
            .map((siteGroup) => {
              // Apply sheet search filter
              if (!sheetSearch) return siteGroup;
              const q = sheetSearch.toLowerCase();
              if (siteGroup.site.siteName.toLowerCase().includes(q)) return siteGroup;
              const filtered = siteGroup.deployments.filter((d) =>
                d.guard.fullName.toLowerCase().includes(q),
              );
              if (filtered.length === 0) return null;
              return { ...siteGroup, deployments: filtered };
            })
            .filter(Boolean)
            .map((siteGroup, idx) => {
            const deployedCount = siteGroup!.deployments.length;
            const required = siteGroup!.site.guardsRequired;
            const metRequirement = deployedCount >= required;

            return (
              <Accordion.Item eventKey={String(idx)} key={siteGroup!.site.id} className="mb-2 border-0 shadow-sm">
                <Accordion.Header>
                  <div className="d-flex align-items-center gap-3 w-100 me-3">
                    <div>
                      <span className="fw-bold">{siteGroup!.site.siteName}</span>
                      <span className="text-muted small ms-2">— {siteGroup!.site.client.clientName}</span>
                    </div>
                    <Badge bg={metRequirement ? 'success' : 'danger'} className="ms-auto">
                      {deployedCount}/{required} guards
                    </Badge>
                    {siteGroup!.supervisor && (
                      <span className="text-muted small d-none d-md-inline">
                        Supervisor: {siteGroup!.supervisor.name}
                      </span>
                    )}
                  </div>
                </Accordion.Header>
                <Accordion.Body className="p-0">
                  {siteGroup!.deployments.some((d) => d.copiedFromDate) && (
                    <div className="px-3 pt-2 text-muted" style={{ fontSize: '0.75rem' }}>
                      📋 Roster copied from {new Date(siteGroup!.deployments.find((d) => d.copiedFromDate)!.copiedFromDate!).toLocaleDateString()}
                    </div>
                  )}
                  <Table responsive hover size="sm" className="mb-0 align-middle small">
                    <thead className="table-light d-print-table-header-group">
                      <tr>
                        <th>Guard</th>
                        <th>Shift</th>
                        <th style={{ width: 90 }}>Time In</th>
                        <th style={{ width: 90 }}>Time Out</th>
                        <th style={{ width: 160 }}>Status</th>
                        <th>Notes</th>
                        <th className="d-print-none">Actions</th>
                        <th className="d-none d-print-table-cell">Signature</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteGroup!.deployments.map((d) => {
                        const key = `${d.guard.id}:${siteGroup!.site.id}:${d.id}`;
                        const edit = getEdit(key, d);
                        const shift = SHIFT_BADGE[d.shiftType] ?? { bg: 'secondary', label: d.shiftType };
                        const deployBadge = DEPLOY_TYPE_BADGE[d.deploymentType ?? ''];
                        const showReplacement = !!replacementPrompt[d.id];

                        return (
                          <>
                          <tr key={d.id}>
                            <td>
                              <div className="d-flex align-items-center gap-2">
                                <InitialsAvatar name={d.guard.fullName} size={28} />
                                <span className="fw-medium">{d.guard.fullName}</span>
                              </div>
                            </td>
                            <td>
                              <Badge bg={shift.bg}>{shift.label}</Badge>
                              {deployBadge && (
                                <Badge bg={deployBadge.bg} text={deployBadge.bg === 'warning' ? 'dark' : undefined} className="ms-1">
                                  {deployBadge.label}
                                </Badge>
                              )}
                              {d.overtimeHours != null && d.overtimeHours > 0 && (
                                <Badge bg="warning" text="dark" className="ms-1">OT: {d.overtimeHours}hrs</Badge>
                              )}
                            </td>
                            <td className="d-print-none">
                              <Form.Control
                                size="sm"
                                type="text"
                                placeholder="HH:MM"
                                value={edit.timeIn}
                                onChange={(e) => setEdit(key, { timeIn: e.target.value })}
                                style={{ width: 80 }}
                              />
                            </td>
                            <td className="d-print-none">
                              <Form.Control
                                size="sm"
                                type="text"
                                placeholder="HH:MM"
                                value={edit.timeOut}
                                onChange={(e) => setEdit(key, { timeOut: e.target.value })}
                                style={{ width: 80 }}
                              />
                            </td>
                            <td className="d-print-none">
                              <Form.Select
                                size="sm"
                                value={edit.status}
                                onChange={(e) => handleStatusChange(key, e.target.value, d.id)}
                              >
                                {STATUS_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </Form.Select>
                            </td>
                            <td className="d-none d-print-table-cell">
                              {edit.status
                                ? <Badge bg={STATUS_BADGE[edit.status] ?? 'secondary'}>{edit.status}</Badge>
                                : <span className="text-muted">—</span>}
                            </td>
                            <td className="d-print-none">
                              <Form.Control
                                size="sm"
                                type="text"
                                placeholder="Optional notes"
                                value={edit.notes}
                                onChange={(e) => setEdit(key, { notes: e.target.value })}
                              />
                            </td>
                            <td className="d-print-none">
                              <RoleGuard allowedRoles={ROSTER_WRITE}>
                                {!d.attendance && (
                                  <Button
                                    size="sm"
                                    variant="outline-danger"
                                    onClick={() => handleDeleteDeployment(d.id)}
                                  >
                                    <i className="bi bi-x-lg" />
                                  </Button>
                                )}
                              </RoleGuard>
                            </td>
                            <td className="d-none d-print-table-cell" style={{ minWidth: 120 }}>&nbsp;</td>
                          </tr>
                          {/* Inline replacement prompt */}
                          {showReplacement && (
                            <tr key={`repl-${d.id}`}>
                              <td colSpan={8} className="p-0">
                                <div className="alert alert-warning py-2 mb-0 rounded-0">
                                  <div className="d-flex align-items-center justify-content-between">
                                    <span className="small fw-bold">
                                      ⚠️ {d.guard.fullName} marked as {edit.status}. Assign a replacement?
                                    </span>
                                    <div className="d-flex gap-2">
                                      <Button
                                        size="sm"
                                        variant="outline-primary"
                                        disabled={loadingReplacements[d.id]}
                                        onClick={() => loadReplacements(d.id, siteGroup!.site.id, d.guard.id)}
                                      >
                                        {loadingReplacements[d.id] ? <Spinner size="sm" animation="border" /> : 'Find Replacement'}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline-secondary"
                                        onClick={() => setReplacementPrompt((prev) => ({ ...prev, [d.id]: false }))}
                                      >
                                        Skip
                                      </Button>
                                    </div>
                                  </div>
                                  {replacements[d.id] && (
                                    <div className="mt-2">
                                      {replacements[d.id].length === 0 ? (
                                        <p className="small text-muted mt-1 mb-0">No available guards found for today.</p>
                                      ) : (
                                        replacements[d.id].map((rep) => (
                                          <div key={rep.id} className="d-flex align-items-center gap-2 py-1 border-top">
                                            <InitialsAvatar name={rep.fullName} size={24} />
                                            <span className="small">{rep.fullName}</span>
                                            {rep.rank && <Badge bg="secondary" className="ms-1" style={{ fontSize: '0.6rem' }}>{rep.rank}</Badge>}
                                            <Button
                                              size="sm"
                                              variant="success"
                                              className="ms-auto"
                                              onClick={() => assignReplacement(
                                                rep.id,
                                                siteGroup!.site.id,
                                                siteGroup!.supervisor?.id ?? '',
                                                d.shiftType,
                                                d.guard.id,
                                                d.id,
                                              )}
                                            >
                                              Assign
                                            </Button>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          </>
                        );
                      })}
                    </tbody>
                  </Table>
                  {/* Bulk mark row */}
                  <div className="d-flex gap-2 px-3 py-2 border-top d-print-none">
                    <RoleGuard allowedRoles={ATTENDANCE_WRITE}>
                      <Button
                        size="sm"
                        variant="outline-success"
                        onClick={() => markSiteAll(siteGroup!.site.id, 'PRESENT')}
                      >
                        Mark All Present
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => markSiteAll(siteGroup!.site.id, 'ABSENT')}
                      >
                        Mark All Absent
                      </Button>
                    </RoleGuard>
                  </div>
                </Accordion.Body>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}

      {/* Sticky save button */}
      <RoleGuard allowedRoles={ATTENDANCE_WRITE}>
        {Object.keys(edits).length > 0 && (
          <div
            className="d-print-none"
            style={{
              position: 'sticky',
              bottom: 16,
              display: 'flex',
              justifyContent: 'flex-end',
              pointerEvents: 'none',
            }}
          >
            <Button
              variant="success"
              onClick={handleSaveAttendance}
              disabled={markAttendance.isPending}
              style={{ pointerEvents: 'all', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
            >
              {markAttendance.isPending
                ? <><Spinner size="sm" animation="border" className="me-2" />Saving...</>
                : `Save Attendance (${Object.values(edits).filter((e) => e.status).length} records)`}
            </Button>
          </div>
        )}
      </RoleGuard>
    </div>
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4 d-print-none">
        <h4 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>Attendance</h4>
      </div>

      <Tabs defaultActiveKey="sheet" className="mb-3 d-print-none">
        <Tab eventKey="sheet" title="Today's Deployment Sheet">
          {deploymentSheet}
        </Tab>
        <Tab eventKey="roster" title="Roster Builder">
          <RoleGuard
            allowedRoles={ROSTER_WRITE}
            fallback={<Alert variant="warning">You do not have permission to build rosters.</Alert>}
          >
            <RosterBuilderTab />
          </RoleGuard>
        </Tab>
      </Tabs>

      {/* Print-only deployment sheet (always visible when printing) */}
      <div className="d-none d-print-block">
        {deploymentSheet}
      </div>

      {/* Copy Roster Modal */}
      <Modal show={showCopyModal} onHide={() => setShowCopyModal(false)} size="sm">
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Copy Previous Roster</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="info" className="small py-2">
            Guards who are no longer active or already deployed on the target date will be skipped automatically.
          </Alert>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-semibold">Copy roster from this date</Form.Label>
            <Form.Control
              type="date"
              value={copySourceDate}
              onChange={(e) => setCopySourceDate(e.target.value)}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label className="small fw-semibold">Apply to this date</Form.Label>
            <Form.Control
              type="date"
              value={copyTargetDate}
              onChange={(e) => setCopyTargetDate(e.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setShowCopyModal(false)}>Cancel</Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleCopyRoster}
            disabled={copyRoster.isPending || !copySourceDate || !copyTargetDate}
          >
            {copyRoster.isPending ? <><Spinner size="sm" className="me-1" />Copying…</> : 'Copy Roster'}
          </Button>
        </Modal.Footer>
      </Modal>

      <style>{`
        @media print {
          body { font-size: 11px !important; }
          .d-print-none { display: none !important; }
          .d-print-block { display: block !important; }
          .d-print-table-cell { display: table-cell !important; }
          .d-print-table-header-group { display: table-header-group !important; }
          nav, .sidebar, header { display: none !important; }
        }
      `}</style>
    </div>
  );
}
