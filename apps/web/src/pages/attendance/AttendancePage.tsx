import { useState, useMemo } from 'react';
import {
  Alert, Badge, Button, Card, Col, Form, Row, Spinner, Tab, Tabs, Table,
  Accordion,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDailySheet, useMarkAttendance, useDeleteDeployment } from '../../hooks/useAttendance';
import { useClientList } from '../../hooks/useClients';
import { useToast } from '../../context/ToastContext';
import RoleGuard from '../../components/RoleGuard';
import InitialsAvatar from '../../components/ui/InitialsAvatar';
import { ROLES, type UserRole } from '@stap/shared';
import type { MarkAttendanceInput } from '@stap/shared';
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
  DAY: { bg: 'primary', label: 'Day' },
  NIGHT: { bg: 'secondary', label: 'Night' },
  FULL_24: { bg: 'dark', label: '24hr' },
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
            <Col className="ms-auto d-flex gap-2 justify-content-end">
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
          {sheet.sites.map((siteGroup, idx) => {
            const deployedCount = siteGroup.deployments.length;
            const required = siteGroup.site.guardsRequired;
            const metRequirement = deployedCount >= required;

            return (
              <Accordion.Item eventKey={String(idx)} key={siteGroup.site.id} className="mb-2 border-0 shadow-sm">
                <Accordion.Header>
                  <div className="d-flex align-items-center gap-3 w-100 me-3">
                    <div>
                      <span className="fw-bold">{siteGroup.site.siteName}</span>
                      <span className="text-muted small ms-2">— {siteGroup.site.client.clientName}</span>
                    </div>
                    <Badge bg={metRequirement ? 'success' : 'danger'} className="ms-auto">
                      {deployedCount}/{required} guards
                    </Badge>
                    {siteGroup.supervisor && (
                      <span className="text-muted small d-none d-md-inline">
                        Supervisor: {siteGroup.supervisor.name}
                      </span>
                    )}
                  </div>
                </Accordion.Header>
                <Accordion.Body className="p-0">
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
                      {siteGroup.deployments.map((d) => {
                        const key = `${d.guard.id}:${siteGroup.site.id}:${d.id}`;
                        const edit = getEdit(key, d);
                        const shift = SHIFT_BADGE[d.shiftType] ?? { bg: 'secondary', label: d.shiftType };

                        return (
                          <tr key={d.id}>
                            <td>
                              <div className="d-flex align-items-center gap-2">
                                <InitialsAvatar name={d.guard.fullName} size={28} />
                                <span className="fw-medium">{d.guard.fullName}</span>
                              </div>
                            </td>
                            <td>
                              <Badge bg={shift.bg}>{shift.label}</Badge>
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
                                onChange={(e) => setEdit(key, { status: e.target.value as AttendanceStatus })}
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
                        onClick={() => markSiteAll(siteGroup.site.id, 'PRESENT')}
                      >
                        Mark All Present
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => markSiteAll(siteGroup.site.id, 'ABSENT')}
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
