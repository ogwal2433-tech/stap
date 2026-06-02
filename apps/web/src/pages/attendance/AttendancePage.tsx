import { useState, useMemo } from 'react';
import {
  Alert, Badge, Button, Card, Col, Form, Row, Spinner, Tab, Tabs, Table,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDailySheet, useMarkAttendance, useDeleteDeployment } from '../../hooks/useAttendance';
import { useZones, useMyZones } from '../../hooks/useZones';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import RoleGuard from '../../components/RoleGuard';
import InitialsAvatar from '../../components/ui/InitialsAvatar';
import { ROLES, type UserRole } from '@stap/shared';
import type { MarkAttendanceInput, DeploymentResponse } from '@stap/shared';
import RosterBuilderTab from '../../components/attendance/RosterBuilderTab';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'AWOL' | '';

interface AttendanceEdit {
  status:  AttendanceStatus;
  timeIn:  string;
  timeOut: string;
  notes:   string;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: '',        label: '— Not Marked —' },
  { value: 'PRESENT', label: '✅ Present'      },
  { value: 'ABSENT',  label: '❌ Absent'       },
  { value: 'LATE',    label: '🕐 Late'         },
  { value: 'AWOL',    label: '🚨 AWOL'         },
];

const STATUS_BADGE: Record<string, string> = {
  PRESENT: 'success',
  ABSENT:  'danger',
  LATE:    'warning',
  AWOL:    'dark',
};

const SHIFT_BADGE: Record<string, { bg: string; label: string }> = {
  DAY:     { bg: 'primary',   label: 'Day'  },
  NIGHT:   { bg: 'secondary', label: 'Night' },
  FULL_24: { bg: 'dark',      label: '24hr' },
};

const STATUS_ROW_BG: Record<string, string> = {
  PRESENT: '#f0fff4',
  ABSENT:  '#fff5f5',
  AWOL:    '#fff5f5',
  LATE:    '#fffbea',
};

const STATUS_SELECT_BG: Record<string, string> = {
  PRESENT: '#d5f5e3',
  ABSENT:  '#fadbd8',
  AWOL:    '#fadbd8',
  LATE:    '#fef9e7',
};

const ROSTER_WRITE:     UserRole[] = [ROLES.DIRECTOR, ROLES.OPERATIONS_SUPERVISOR];
const ATTENDANCE_WRITE: UserRole[] = [
  ROLES.DIRECTOR, ROLES.ADMINISTRATOR, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR,
];
const ADMIN_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const { showToast } = useToast();
  const navigate      = useNavigate();
  const queryClient   = useQueryClient();
  const { user }      = useAuth();

  const isAdmin = ADMIN_ROLES.includes(user?.role as UserRole);

  const [selectedDate,   setSelectedDate]   = useState(todayStr());
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [edits, setEdits] = useState<Record<string, AttendanceEdit>>({});

  // Zone list for filter dropdown
  const { data: allZonesData } = useZones({ isActive: true, limit: 100 });
  const { data: myZonesData }  = useMyZones();
  const zones = useMemo(
    () => (isAdmin ? (allZonesData?.data ?? []) : (myZonesData ?? [])),
    [isAdmin, allZonesData, myZonesData],
  );

  const { data: sheet, isLoading, refetch } = useDailySheet(
    selectedDate,
    selectedSiteId || undefined,
    selectedZoneId || undefined,
  );
  const markAttendanceMutation = useMarkAttendance();
  const deleteDeploymentMutation = useDeleteDeployment();

  // Flat list of sites in the current sheet (for site filter dropdown)
  const allSites = useMemo(() => {
    if (!sheet) return [];
    return sheet.zones.flatMap((z) => z.sites).map((s) => s.site);
  }, [sheet]);

  // Flat list of all deployments for summary bar
  const allDeployments = useMemo(() => {
    if (!sheet) return [];
    return sheet.zones.flatMap((z) => z.sites).flatMap((s) => s.deployments);
  }, [sheet]);

  // Summary counts
  const totalDeployed  = allDeployments.length;
  const totalPresent   = allDeployments.filter((d) => d.attendance?.status === 'PRESENT').length;
  const totalAbsent    = allDeployments.filter((d) => ['ABSENT', 'AWOL'].includes(d.attendance?.status ?? '')).length;
  const totalUnmarked  = allDeployments.filter((d) => !d.attendance).length;

  // Number of edits with a status set
  const pendingCount = Object.values(edits).filter((e) => e.status).length;

  function getEdit(
    key: string,
    dep?: { attendance?: { status: string; timeIn: string | null; timeOut: string | null; notes: string | null } | null },
  ): AttendanceEdit {
    if (edits[key]) return edits[key];
    if (dep?.attendance) {
      return {
        status:  dep.attendance.status as AttendanceStatus,
        timeIn:  dep.attendance.timeIn  ? dep.attendance.timeIn.substring(11, 16)  : '',
        timeOut: dep.attendance.timeOut ? dep.attendance.timeOut.substring(11, 16) : '',
        notes:   dep.attendance.notes ?? '',
      };
    }
    return { status: '', timeIn: '', timeOut: '', notes: '' };
  }

  function setEdit(key: string, patch: Partial<AttendanceEdit>) {
    setEdits((prev) => ({ ...prev, [key]: { ...getEdit(key), ...prev[key], ...patch } }));
  }

  function markSiteAll(siteId: string, status: 'PRESENT' | 'ABSENT') {
    const siteGroup = sheet?.zones.flatMap((z) => z.sites).find((s) => s.site.id === siteId);
    if (!siteGroup) return;
    const updates: Record<string, AttendanceEdit> = {};
    for (const d of siteGroup.deployments) {
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
        date:    `${selectedDate}T00:00:00.000Z`,
        status:  edit.status as 'PRESENT' | 'ABSENT' | 'LATE' | 'AWOL',
        timeIn:  edit.timeIn  || undefined,
        timeOut: edit.timeOut || undefined,
        notes:   edit.notes   || undefined,
      });
    }

    if (records.length === 0) {
      showToast('No attendance changes to save', 'warning');
      return;
    }

    try {
      const result = await markAttendanceMutation.mutateAsync(records);
      showToast(`Attendance saved for ${result.marked + result.updated} guard(s)`, 'success');
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ['daily-sheet'] });
      refetch();
    } catch {
      showToast('Failed to save attendance', 'danger');
    }
  }

  async function handleDeleteDeployment(id: string) {
    if (!confirm('Remove this guard from the roster? This cannot be undone.')) return;
    try {
      await deleteDeploymentMutation.mutateAsync(id);
      showToast('Deployment removed', 'success');
      refetch();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove deployment';
      showToast(msg, 'danger');
    }
  }

  function GuardRow({ dep, siteId, index }: { dep: DeploymentResponse; siteId: string; index: number }) {
    const key  = `${dep.guard.id}:${siteId}:${dep.id}`;
    const edit = getEdit(key, dep);
    const shift = SHIFT_BADGE[dep.shiftType] ?? { bg: 'secondary', label: dep.shiftType };
    const rowBg = edit.status ? (STATUS_ROW_BG[edit.status] ?? '#fff') : '#fff';
    const selectBg = edit.status ? (STATUS_SELECT_BG[edit.status] ?? '#fff') : '#fff';
    const isAbsent = edit.status === 'ABSENT' || edit.status === 'AWOL';

    return (
      <tr style={{ background: rowBg, fontSize: '0.85rem' }}>
        <td className="text-muted align-middle" style={{ width: 36 }}>{index}</td>
        <td className="align-middle">
          <div className="d-flex align-items-center gap-2">
            <InitialsAvatar name={dep.guard.fullName} size={28} />
            <div>
              <div style={{ fontWeight: 500 }}>{dep.guard.fullName}</div>
              {dep.guard.rank && (
                <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>
                  {dep.guard.rank.replace(/_/g, ' ')}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="align-middle" style={{ width: 72 }}>
          <Badge bg={shift.bg} style={{ fontSize: '0.72rem' }}>{shift.label}</Badge>
        </td>
        {/* Status — screen */}
        <td className="align-middle d-print-none" style={{ width: 160 }}>
          <Form.Select
            size="sm"
            value={edit.status}
            onChange={(e) => setEdit(key, { status: e.target.value as AttendanceStatus })}
            style={{ fontSize: '0.8rem', background: selectBg }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Form.Select>
        </td>
        {/* Status — print */}
        <td className="align-middle d-none d-print-table-cell" style={{ width: 80 }}>
          {edit.status
            ? <Badge bg={STATUS_BADGE[edit.status] ?? 'secondary'}>{edit.status}</Badge>
            : <span className="text-muted">—</span>}
        </td>
        <td className="align-middle d-print-none" style={{ width: 86 }}>
          <Form.Control
            size="sm" type="time"
            value={edit.timeIn}
            disabled={isAbsent}
            onChange={(e) => setEdit(key, { timeIn: e.target.value })}
            style={{ fontSize: '0.8rem' }}
          />
        </td>
        <td className="align-middle d-print-none" style={{ width: 86 }}>
          <Form.Control
            size="sm" type="time"
            value={edit.timeOut}
            disabled={isAbsent}
            onChange={(e) => setEdit(key, { timeOut: e.target.value })}
            style={{ fontSize: '0.8rem' }}
          />
        </td>
        <td className="align-middle d-print-none">
          <Form.Control
            size="sm" type="text"
            placeholder="Note…"
            value={edit.notes}
            onChange={(e) => setEdit(key, { notes: e.target.value })}
            style={{ fontSize: '0.8rem' }}
          />
        </td>
        {/* Signature column for print */}
        <td className="d-none d-print-table-cell" style={{ minWidth: 120 }}>&nbsp;</td>
        <td className="align-middle d-print-none" style={{ width: 36 }}>
          <RoleGuard allowedRoles={ROSTER_WRITE}>
            {!dep.attendance && (
              <Button
                size="sm" variant="outline-danger"
                title="Remove from roster"
                onClick={() => handleDeleteDeployment(dep.id)}
              >
                <i className="bi bi-x-lg" />
              </Button>
            )}
          </RoleGuard>
        </td>
      </tr>
    );
  }

  const hasZoneData = (sheet?.zones ?? []).some((z) => z.zoneId !== null);

  const deploymentSheet = (
    <div>
      {/* Controls */}
      <Card className="border-0 shadow-sm mb-3 d-print-none">
        <Card.Body>
          <Row className="g-2 align-items-end">
            <Col xs={6} md={3}>
              <Form.Label className="small fw-semibold">Date</Form.Label>
              <Form.Control
                type="date"
                value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setEdits({}); }}
              />
            </Col>
            <Col xs={6} md={3}>
              <Form.Label className="small fw-semibold">Zone</Form.Label>
              <Form.Select
                value={selectedZoneId}
                onChange={(e) => { setSelectedZoneId(e.target.value); setSelectedSiteId(''); }}
              >
                <option value="">All Zones</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={12} md={3}>
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
            <Col className="d-flex gap-2 justify-content-end">
              <Button variant="outline-secondary" size="sm" onClick={() => window.print()}>
                <i className="bi bi-printer me-1" />Print
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

      {!isLoading && (!sheet || sheet.zones.length === 0) && (
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

      {sheet && sheet.zones.length > 0 && (
        <div className="attendance-sheet">
          {/* Summary bar */}
          <div
            className="d-print-none"
            style={{
              background: '#1B3A6B', color: 'white',
              padding: '10px 16px', borderRadius: '0.5rem 0.5rem 0 0',
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
            }}
          >
            <div style={{ fontWeight: 600 }}>
              📅{' '}
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', {
                weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
              })}
            </div>
            <div className="d-flex gap-3 flex-wrap">
              <span style={{ fontSize: '0.85rem' }}>👮 {totalDeployed} deployed</span>
              <span style={{ fontSize: '0.85rem', color: '#A9DFBF' }}>✅ {totalPresent} present</span>
              <span style={{ fontSize: '0.85rem', color: totalAbsent  > 0 ? '#F1948A' : '#A9DFBF' }}>
                ❌ {totalAbsent} absent
              </span>
              <span style={{ fontSize: '0.85rem', color: totalUnmarked > 0 ? '#FAD7A0' : '#A9DFBF' }}>
                ⏳ {totalUnmarked} unmarked
              </span>
            </div>
          </div>

          {sheet.zones.map((zone, zoneIdx) => (
            <div key={zone.zoneId ?? 'no-zone'} className="mb-3">
              {/* Zone header — only when multiple zones or zone data present */}
              {hasZoneData && (
                <div
                  className="zone-header"
                  style={{
                    background: '#1B3A6B', color: 'white',
                    padding: '6px 16px', fontSize: '0.8rem',
                    fontWeight: 600, letterSpacing: '0.5px',
                    marginTop: zoneIdx > 0 ? 12 : 0,
                  }}
                >
                  🗺️ {zone.zoneName ?? 'No Zone'}
                </div>
              )}

              {zone.sites.map((siteGroup) => {
                const required = siteGroup.site.guardsRequired;
                const deployed = siteGroup.deployments.length;
                const underStaffed = required > 0 && deployed < required;

                return (
                  <div key={siteGroup.site.id} className="mb-2 shadow-sm border rounded overflow-hidden">
                    {/* Site header */}
                    <div
                      className="site-group-header d-flex align-items-center justify-content-between flex-wrap gap-2"
                      style={{
                        background: '#F2F4F7',
                        padding: '10px 16px',
                        borderLeft: '4px solid #0F7B6C',
                        borderBottom: '1px solid #D0D5DD',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1B3A6B' }}>
                          {siteGroup.site.siteName}
                        </span>
                        <span style={{ marginLeft: 8, fontSize: '0.8rem', color: '#6c757d' }}>
                          {siteGroup.site.client.clientName}
                        </span>
                        <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#6c757d' }}>
                          📍 {siteGroup.site.location}
                        </span>
                      </div>
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span style={{
                          fontSize: '0.8rem',
                          color: underStaffed ? '#dc3545' : '#1e8449',
                          fontWeight: 500,
                        }}>
                          👮 {deployed}
                          {required > 0 && ` / ${required} required`}
                        </span>
                        {siteGroup.presentCount > 0 && (
                          <Badge bg="success" style={{ fontSize: '0.7rem' }}>
                            ✅ {siteGroup.presentCount} present
                          </Badge>
                        )}
                        {siteGroup.absentCount > 0 && (
                          <Badge bg="danger" style={{ fontSize: '0.7rem' }}>
                            ❌ {siteGroup.absentCount} absent
                          </Badge>
                        )}
                        {siteGroup.unmarkedCount > 0 && (
                          <Badge bg="warning" text="dark" style={{ fontSize: '0.7rem' }}>
                            ⏳ {siteGroup.unmarkedCount} unmarked
                          </Badge>
                        )}
                        <RoleGuard allowedRoles={ATTENDANCE_WRITE}>
                          <Button
                            size="sm" variant="outline-success"
                            className="d-print-none"
                            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                            onClick={() => markSiteAll(siteGroup.site.id, 'PRESENT')}
                          >
                            Mark All Present
                          </Button>
                          <Button
                            size="sm" variant="outline-danger"
                            className="d-print-none"
                            style={{ fontSize: '0.75rem', padding: '2px 8px' }}
                            onClick={() => markSiteAll(siteGroup.site.id, 'ABSENT')}
                          >
                            Mark All Absent
                          </Button>
                        </RoleGuard>
                      </div>
                    </div>

                    {/* Guards table */}
                    <Table responsive hover size="sm" className="mb-0 align-middle small" style={{ borderTop: 'none' }}>
                      <thead className="table-light d-print-table-header-group">
                        <tr style={{ fontSize: '0.78rem', color: '#6c757d', fontWeight: 600 }}>
                          <th style={{ width: 36 }}>#</th>
                          <th>Guard</th>
                          <th style={{ width: 72 }}>Shift</th>
                          <th className="d-print-none" style={{ width: 160 }}>Status</th>
                          <th className="d-none d-print-table-cell" style={{ width: 80 }}>Status</th>
                          <th className="d-print-none" style={{ width: 86 }}>Time In</th>
                          <th className="d-print-none" style={{ width: 86 }}>Time Out</th>
                          <th className="d-print-none">Notes</th>
                          <th className="d-none d-print-table-cell" style={{ minWidth: 120 }}>Signature</th>
                          <th className="d-print-none" style={{ width: 36 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {siteGroup.deployments.map((dep, idx) => (
                          <GuardRow
                            key={dep.id}
                            dep={dep}
                            siteId={siteGroup.site.id}
                            index={idx + 1}
                          />
                        ))}
                      </tbody>
                    </Table>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Floating save button */}
      <RoleGuard allowedRoles={ATTENDANCE_WRITE}>
        {pendingCount > 0 && (
          <div
            className="d-print-none floating-save"
            style={{
              position: 'fixed', bottom: 24, right: 24, zIndex: 1050,
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              borderRadius: '0.5rem', overflow: 'hidden',
            }}
          >
            <Button
              variant="success"
              size="lg"
              disabled={markAttendanceMutation.isPending}
              onClick={handleSaveAttendance}
            >
              {markAttendanceMutation.isPending ? (
                <><Spinner size="sm" animation="border" className="me-2" />Saving…</>
              ) : (
                <>💾 Save Attendance ({pendingCount} change{pendingCount !== 1 ? 's' : ''})</>
              )}
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

      {/* Print-only — always render sheet when printing */}
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
          .zone-header {
            background: #1B3A6B !important;
            color: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .site-group-header {
            background: #f0f0f0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            page-break-inside: avoid;
          }
          .guard-row { page-break-inside: avoid; }
          .floating-save { display: none !important; }
          table { border-collapse: collapse; }
          th, td { border: 1px solid #ccc !important; padding: 4px 8px !important; }
        }
      `}</style>
    </div>
  );
}
