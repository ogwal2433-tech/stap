import { useState, useMemo } from 'react';
import { useCompanyBranding } from '../../hooks/useCompanyBranding';
import {
  Alert, Badge, Button, Card, Col, Form, Row, Spinner, Tab, Tabs, Table,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDailySheet, useMarkAttendance, useDeleteDeployment } from '../../hooks/useAttendance';
import { useZones, useMyZones } from '../../hooks/useZones';
import { useAllSites } from '../../hooks/useClients';
import { useToast } from '../../context/ToastContext';
import { useAuth, useHasPermission } from '../../context/AuthContext';
import RoleGuard from '../../components/RoleGuard';
import InitialsAvatar from '../../components/ui/InitialsAvatar';
import CopyRosterModal from '../../components/attendance/CopyRosterModal';
import ReplacementModal from '../../components/attendance/ReplacementModal';
import { ROLES, type UserRole } from '@security360/shared';
import type { MarkAttendanceInput, DeploymentResponse } from '@security360/shared';
import RosterBuilderTab from '../../components/attendance/RosterBuilderTab';
import AttendanceRecordsTab from '../../components/attendance/AttendanceRecordsTab';
import { exportAttendanceSheet } from '../../lib/exportToExcel';
import { getApiErrorMessage } from '../../lib/api';

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'AWOL' | '';

interface AttendanceEdit {
  status: AttendanceStatus;
  notes:  string;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: '',        label: '— Not Marked —' },
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT',  label: 'Absent'  },
  { value: 'LATE',    label: 'Late'    },
  { value: 'AWOL',    label: 'AWOL'    },
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

const ROSTER_WRITE:     UserRole[] = [ROLES.DIRECTOR, ROLES.MD, ROLES.OPERATIONS_SUPERVISOR];
const ATTENDANCE_WRITE: UserRole[] = [
  ROLES.DIRECTOR, ROLES.MD, ROLES.ADMINISTRATOR, ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR,
];
const ADMIN_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// A deployment matches when every whitespace-separated token of the query
// appears somewhere in its guard/site/client details — typing "john kamp"
// narrows to John at a Kampala site, and each extra token narrows further.
function deploymentMatches(dep: DeploymentResponse, query: string): boolean {
  const haystack = [
    dep.guard.fullName,
    dep.guard.phone ?? '',
    dep.guard.rank ?? '',
    dep.site.siteName,
    dep.site.client.clientName,
    dep.site.location,
    dep.supervisor.name,
  ].join(' ').toLowerCase();
  return query.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
}

export default function AttendancePage() {
  const { data: companyBranding } = useCompanyBranding();
  const { showToast } = useToast();
  const navigate      = useNavigate();
  const queryClient   = useQueryClient();
  const { user }      = useAuth();

  const isAdmin = ADMIN_ROLES.includes(user?.role as UserRole);
  // Roles such as Control Room may read the sheet but not mark it. The save bar
  // is already RoleGuard-ed; this stops the inputs looking editable when it is
  // never going to appear.
  const canMarkAttendance = ATTENDANCE_WRITE.includes(user?.role as UserRole);

  const [selectedDate,   setSelectedDate]   = useState(todayStr());
  const [selectedSiteId, setSelectedSiteId] = useState('');
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [showCopyModal,  setShowCopyModal]  = useState(false);
  const [replacementTarget, setReplacementTarget] = useState<{
    id: string; guardId: string; guardName: string; systemId: string | null;
    siteId: string; siteName: string; clientName: string; shiftType: string; date: string;
  } | null>(null);
  // Tracks which deployment IDs currently show the inline replacement prompt.
  // Must live in the parent — GuardRow is defined inside AttendancePage, so its
  // own useState resets on every parent re-render (remount).
  const [absencePromptIds, setAbsencePromptIds] = useState<Set<string>>(new Set());
  const [isInstructionsExpanded, setIsInstructionsExpanded] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, AttendanceEdit>>({});
  // Row keys ticked in the checkbox column. Feeds the bulk status bar so a
  // supervisor can mark any subset of guards in one click and save once.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  // Deployment id currently being removed, so its delete button can disable
  // and a double-click cannot fire a second request.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Live search over the sheet below — narrows rows as you type.
  const [search, setSearch] = useState('');

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

  // Options for the site dropdown.
  //
  // Read from /sites rather than from the sheet, for two reasons. The sheet
  // narrows to the chosen site, so deriving the options from it left the
  // dropdown holding only the site already selected. And the sheet lists only
  // sites with someone deployed today, so a site nobody was rostered to could
  // not be selected at all — which is exactly the case a supervisor is
  // checking when they go looking for it.
  const canListSites = useHasPermission('sites.view');
  const { data: sitesInZone } = useAllSites(
    { zoneId: selectedZoneId || undefined },
    canListSites,
  );

  // HR reaches the attendance sheet without sites.view. Falling back to the
  // sheet keeps their dropdown working — with the sites deployed today, as
  // before — rather than handing them an empty one.
  const { data: zoneSheet } = useDailySheet(
    selectedDate,
    undefined,
    selectedZoneId || undefined,
  );

  const siteOptions = useMemo(() => {
    if (canListSites && sitesInZone) {
      return sitesInZone.map((s) => ({
        id:       s.id,
        siteName: s.siteName,
        zoneName: s.zone?.name ?? null,
      }));
    }
    const source = zoneSheet ?? sheet;
    if (!source) return [];
    return source.zones.flatMap((z) =>
      z.sites.map((s) => ({ id: s.site.id, siteName: s.site.siteName, zoneName: z.zoneName })),
    );
  }, [canListSites, sitesInZone, zoneSheet, sheet]);

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

  // Live search: active as soon as there is any non-space input. The summary
  // counts above always describe the whole day — only the rows below narrow.
  const searchQuery  = search.trim().toLowerCase();
  const searchActive = searchQuery.length > 0;
  const searchMatches = useMemo(
    () => (searchActive ? allDeployments.filter((d) => deploymentMatches(d, searchQuery)).length : 0),
    [searchActive, searchQuery, allDeployments],
  );

  // Number of edits with a status set
  const pendingCount = Object.values(edits).filter((e) => e.status).length;

  function getEdit(
    key: string,
    dep?: { attendance?: { status: string; notes: string | null } | null },
  ): AttendanceEdit {
    if (edits[key]) return edits[key];
    if (dep?.attendance) {
      return {
        status: dep.attendance.status as AttendanceStatus,
        notes:  dep.attendance.notes ?? '',
      };
    }
    return { status: '', notes: '' };
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

  function toggleSelected(key: string, on: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  }

  function toggleSiteSelected(deployments: { guard: { id: string }; id: string }[], siteId: string, on: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const d of deployments) {
        const key = `${d.guard.id}:${siteId}:${d.id}`;
        if (on) next.add(key); else next.delete(key);
      }
      return next;
    });
  }

  function applyStatusToSelected(status: Exclude<AttendanceStatus, ''>) {
    const updates: Record<string, AttendanceEdit> = {};
    for (const key of selectedKeys) {
      updates[key] = { ...getEdit(key), status };
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
        date:   `${selectedDate}T00:00:00.000Z`,
        status: edit.status as 'PRESENT' | 'ABSENT' | 'LATE' | 'AWOL',
        notes:  edit.notes || undefined,
      });
    }

    if (records.length === 0) {
      showToast('No attendance changes to save', 'warning');
      return;
    }

    try {
      const result = await markAttendanceMutation.mutateAsync(records);
      const savedCount = result.marked + result.updated;
      const skipped = result.skippedDeserted ?? 0;
      if (skipped > 0) {
        const names = result.skippedNames?.join(', ');
        showToast(
          `Saved ${savedCount} guard(s). Skipped ${skipped} archived guard(s)${names ? `: ${names}` : ''}.`,
          'warning',
        );
      } else {
        showToast(`Attendance saved for ${savedCount} guard(s)`, 'success');
      }
      setEdits({});
      setSelectedKeys(new Set());
      queryClient.invalidateQueries({ queryKey: ['daily-sheet'] });
      refetch();
    } catch (err: unknown) {
      // Surface the server's message (e.g. overpayment-style validations) so a
      // failed batch explains itself instead of a bare "Failed to save".
      showToast(getApiErrorMessage(err, 'Failed to save attendance'), 'danger');
    }
  }

  async function handleDeleteDeployment(id: string) {
    if (!confirm('Remove this guard from the roster? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await deleteDeploymentMutation.mutateAsync(id);
      showToast('Deployment removed', 'success');
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        for (const key of next) if (key.endsWith(`:${id}`)) next.delete(key);
        return next;
      });
      refetch();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        // Already removed elsewhere (or by the deserter purge) — treat as done
        // and refresh rather than surfacing a scary error.
        showToast('Deployment was already removed — refreshing the sheet.', 'warning');
        queryClient.invalidateQueries({ queryKey: ['daily-sheet'] });
        refetch();
      } else {
        showToast(getApiErrorMessage(err, 'Failed to remove deployment'), 'danger');
      }
    } finally {
      setDeletingId(null);
    }
  }

  function GuardRow({ dep, siteId, index }: { dep: DeploymentResponse; siteId: string; index: number }) {
    const key  = `${dep.guard.id}:${siteId}:${dep.id}`;
    const edit = getEdit(key, dep);
    const shift = SHIFT_BADGE[dep.shiftType] ?? { bg: 'secondary', label: dep.shiftType };
    const rowBg = edit.status ? (STATUS_ROW_BG[edit.status] ?? '#fff') : '#fff';
    const selectBg = edit.status ? (STATUS_SELECT_BG[edit.status] ?? '#fff') : '#fff';

    const showReplacementPrompt = absencePromptIds.has(dep.id);

    const setShowReplacementPrompt = (show: boolean) => {
      setAbsencePromptIds(prev => {
        const next = new Set(prev);
        show ? next.add(dep.id) : next.delete(dep.id);
        return next;
      });
    };

    const handleStatusChange = (newStatus: AttendanceStatus) => {
      setEdit(key, { status: newStatus });
      setShowReplacementPrompt(['ABSENT', 'AWOL'].includes(newStatus));
    };

    return (
      <>
      <tr style={{ background: rowBg, fontSize: '0.85rem' }}>
        <td className="align-middle d-print-none" style={{ width: 32 }}>
          {canMarkAttendance && (
            <Form.Check
              type="checkbox"
              checked={selectedKeys.has(key)}
              onChange={(e) => toggleSelected(key, e.target.checked)}
              aria-label={`Select ${dep.guard.fullName}`}
              style={{ margin: 0 }}
            />
          )}
        </td>
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
              {dep.attendance?.replacedByGuardId && (
                <div style={{ fontSize: '0.72rem', color: '#0F7B6C', marginTop: 1 }}>
                  <i className="bi bi-arrow-left-right me-1" />Replacement assigned
                </div>
              )}
              {dep.isReplacement && (
                <div style={{ fontSize: '0.72rem', color: '#1E8449', marginTop: 1 }}>
                  <i className="bi bi-arrow-left-right me-1" />Replacement{dep.replacementReason ? ` — ${dep.replacementReason.toLowerCase()}` : ''}
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
            onChange={(e) => handleStatusChange(e.target.value as AttendanceStatus)}
            disabled={!canMarkAttendance}
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
        <td className="align-middle d-print-none">
          <Form.Control
            size="sm" type="text"
            placeholder="Note…"
            value={edit.notes}
            onChange={(e) => setEdit(key, { notes: e.target.value })}
            disabled={!canMarkAttendance}
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
                disabled={deletingId === dep.id}
                onClick={() => handleDeleteDeployment(dep.id)}
              >
                {deletingId === dep.id
                  ? <Spinner size="sm" animation="border" />
                  : <i className="bi bi-x-lg" />}
              </Button>
            )}
          </RoleGuard>
        </td>
      </tr>
      {showReplacementPrompt && (
        <tr style={{ background: '#fffbe6' }}>
          <td colSpan={9} style={{ padding: '6px 14px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, padding: '6px 10px', background: '#fff3cd',
              borderRadius: '0.375rem', border: '1px solid #ffc107',
            }}>
              <div style={{ fontSize: '0.8rem', color: '#664d03', fontWeight: 500 }}>
                <i className="bi bi-exclamation-triangle-fill me-1" />Guard marked absent — assign a replacement?
              </div>
              <div className="d-flex gap-2">
                <Button
                  size="sm" variant="warning"
                  style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                  onClick={() => {
                    setShowReplacementPrompt(false);
                    setReplacementTarget({
                      id:         dep.id,
                      guardId:    dep.guard.id,
                      guardName:  dep.guard.fullName,
                      systemId:   null,
                      siteId:     dep.site.id,
                      siteName:   dep.site.siteName,
                      clientName: dep.site.client.clientName,
                      shiftType:  dep.shiftType,
                      date:       dep.date,
                    });
                  }}
                >
                  <i className="bi bi-arrow-left-right me-1" />Find Replacement
                </Button>
                <Button
                  size="sm" variant="outline-secondary"
                  style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                  onClick={() => setShowReplacementPrompt(false)}
                >
                  Skip
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
      </>
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
                onChange={(e) => { setSelectedDate(e.target.value); setEdits({}); setSelectedKeys(new Set()); }}
              />
            </Col>
            <Col xs={6} md={3}>
              <Form.Label className="small fw-semibold" htmlFor="attendance-zone">Zone</Form.Label>
              <Form.Select
                id="attendance-zone"
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
              <Form.Label className="small fw-semibold" htmlFor="attendance-site">Site</Form.Label>
              <Form.Select
                id="attendance-site"
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
              >
                <option value="">
                  {selectedZoneId ? 'All sites in this zone' : 'All Sites'}
                </option>
                {siteOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.siteName}
                    {/* The zone is only worth naming when the list spans more than one. */}
                    {!selectedZoneId && s.zoneName ? ` (${s.zoneName})` : ''}
                  </option>
                ))}
              </Form.Select>
            </Col>
            <Col xs={12} md={3} className="d-print-none">
              <Form.Label className="small fw-semibold" htmlFor="attendance-search">Search</Form.Label>
              <Form.Control
                id="attendance-search"
                type="search"
                size="sm"
                placeholder="Guard, site, client, phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </Col>
            <Col className="d-flex gap-2 justify-content-end">
              <Button
                variant="outline-success"
                size="sm"
                disabled={!sheet || sheet.zones.length === 0}
                onClick={() => sheet && exportAttendanceSheet(sheet, selectedDate, companyBranding.company_name)}
              >
                <i className="bi bi-file-earmark-excel me-1" />Export Excel
              </Button>
              <Button variant="outline-secondary" size="sm" onClick={() => window.print()}>
                <i className="bi bi-printer me-1" />Print
              </Button>
              <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.MD, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR] as UserRole[]}>
                <Button variant="outline-primary" size="sm" onClick={() => setShowCopyModal(true)}>
                  <i className="bi bi-clipboard-check me-1" />Copy Roster
                </Button>
              </RoleGuard>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {/* Print header */}
      <div className="d-none d-print-block mb-3">
        <h5 className="fw-bold">{companyBranding.company_name} — Daily Deployment Sheet</h5>
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

      {!isLoading && searchActive && sheet && sheet.zones.length > 0 && searchMatches === 0 && (
        <Alert variant="light" className="d-print-none">
          No deployments match "{search.trim()}". Clear the search to see the full sheet.
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
              <i className="bi bi-calendar3 me-1" />
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', {
                weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
              })}
            </div>
            <div className="d-flex gap-3 flex-wrap">
              <span style={{ fontSize: '0.85rem' }}><i className="bi bi-person-badge me-1" />{totalDeployed} deployed</span>
              <span style={{ fontSize: '0.85rem', color: '#A9DFBF' }}><i className="bi bi-check-circle me-1" />{totalPresent} present</span>
              <span style={{ fontSize: '0.85rem', color: totalAbsent  > 0 ? '#F1948A' : '#A9DFBF' }}>
                <i className="bi bi-x-circle me-1" />{totalAbsent} absent
              </span>
              <span style={{ fontSize: '0.85rem', color: totalUnmarked > 0 ? '#FAD7A0' : '#A9DFBF' }}>
                <i className="bi bi-hourglass-split me-1" />{totalUnmarked} unmarked
              </span>
            </div>
          </div>

          {/* Bulk status bar — visible once any rows are ticked */}
          {canMarkAttendance && selectedKeys.size > 0 && (
            <div
              className="d-print-none"
              style={{
                background: '#0F7B6C', color: 'white',
                padding: '8px 16px', borderRadius: 0,
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
              }}
            >
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {selectedKeys.size} guard{selectedKeys.size !== 1 ? 's' : ''} selected
              </span>
              <div className="d-flex gap-2 flex-wrap">
                <Button
                  size="sm" variant="light"
                  style={{ fontSize: '0.75rem', padding: '2px 10px' }}
                  onClick={() => applyStatusToSelected('PRESENT')}
                >
                  <i className="bi bi-check-circle me-1" />Present
                </Button>
                <Button
                  size="sm" variant="light"
                  style={{ fontSize: '0.75rem', padding: '2px 10px' }}
                  onClick={() => applyStatusToSelected('LATE')}
                >
                  <i className="bi bi-clock me-1" />Late
                </Button>
                <Button
                  size="sm" variant="light"
                  style={{ fontSize: '0.75rem', padding: '2px 10px' }}
                  onClick={() => applyStatusToSelected('ABSENT')}
                >
                  <i className="bi bi-x-circle me-1" />Absent
                </Button>
                <Button
                  size="sm" variant="light"
                  style={{ fontSize: '0.75rem', padding: '2px 10px' }}
                  onClick={() => applyStatusToSelected('AWOL')}
                >
                  <i className="bi bi-exclamation-triangle me-1" />AWOL
                </Button>
                <Button
                  size="sm" variant="outline-light"
                  style={{ fontSize: '0.75rem', padding: '2px 10px' }}
                  onClick={() => setSelectedKeys(new Set())}
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {sheet.zones.map((zone, zoneIdx) => {
            // Live search narrows each site's rows; sites and zones left with
            // no match drop out entirely. Site header counts stay at full-site
            // truth so the filter never rewrites the staffing picture.
            const siteRows = zone.sites
              .map((siteGroup) => ({
                siteGroup,
                visibleDeps: searchActive
                  ? siteGroup.deployments.filter((d) => deploymentMatches(d, searchQuery))
                  : siteGroup.deployments,
              }))
              .filter((r) => r.visibleDeps.length > 0);
            if (siteRows.length === 0) return null;
            return (
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
                  <i className="bi bi-geo-alt me-1" />{zone.zoneName ?? 'No Zone'}
                </div>
              )}

              {siteRows.map(({ siteGroup, visibleDeps }) => {
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
                          <i className="bi bi-geo-alt me-1" />{siteGroup.site.location}
                        </span>
                        {(() => {
                          const copied = siteGroup.deployments.find((d: any) => d.copiedFromDate);
                          return copied ? (
                            <span style={{ marginLeft: 8, fontSize: '0.72rem', color: '#6c757d', fontStyle: 'italic' }}>
                              <i className="bi bi-clipboard-check me-1" />Copied from {new Date((copied as any).copiedFromDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span style={{
                          fontSize: '0.8rem',
                          color: underStaffed ? '#dc3545' : '#1e8449',
                          fontWeight: 500,
                        }}>
                          <i className="bi bi-person-badge me-1" />{deployed}
                          {required > 0 && ` / ${required} required`}
                        </span>
                        {siteGroup.presentCount > 0 && (
                          <Badge bg="success" style={{ fontSize: '0.7rem' }}>
                            <i className="bi bi-check-circle me-1" />{siteGroup.presentCount} present
                          </Badge>
                        )}
                        {siteGroup.absentCount > 0 && (
                          <Badge bg="danger" style={{ fontSize: '0.7rem' }}>
                            <i className="bi bi-x-circle me-1" />{siteGroup.absentCount} absent
                          </Badge>
                        )}
                        {siteGroup.unmarkedCount > 0 && (
                          <Badge bg="warning" text="dark" style={{ fontSize: '0.7rem' }}>
                            <i className="bi bi-hourglass-split me-1" />{siteGroup.unmarkedCount} unmarked
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
                      {siteGroup.site.specialInstructions && (
                        <div className="site-instructions" style={{
                          marginTop: '6px', paddingTop: '6px',
                          borderTop: '1px solid #D0D5DD',
                          fontSize: '0.78rem', color: '#4A5568', lineHeight: 1.5,
                          display: 'flex', alignItems: 'flex-start', gap: '6px',
                          width: '100%',
                        }}>
                          <span style={{ flexShrink: 0 }}><i className="bi bi-clipboard" /></span>
                          <div>
                            <span style={{ fontWeight: 600, color: '#1B3A6B', marginRight: '4px' }}>
                              Site Instructions:
                            </span>
                            {isInstructionsExpanded[siteGroup.site.id]
                              ? siteGroup.site.specialInstructions
                              : siteGroup.site.specialInstructions.length > 120
                                ? `${siteGroup.site.specialInstructions.substring(0, 120)}...`
                                : siteGroup.site.specialInstructions}
                            {siteGroup.site.specialInstructions.length > 120 && (
                              <button
                                type="button"
                                className="d-print-none"
                                onClick={() => setIsInstructionsExpanded((prev) => ({
                                  ...prev,
                                  [siteGroup.site.id]: !prev[siteGroup.site.id],
                                }))}
                                style={{
                                  background: 'none', border: 'none',
                                  color: '#1B3A6B', cursor: 'pointer',
                                  padding: '0 4px', fontSize: '0.75rem', fontWeight: 600,
                                }}
                              >
                                {isInstructionsExpanded[siteGroup.site.id] ? 'Show less' : 'Show more'}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Guards table */}
                    <Table responsive hover size="sm" className="mb-0 align-middle small" style={{ borderTop: 'none' }}>
                      <thead className="table-light d-print-table-header-group">
                        <tr style={{ fontSize: '0.78rem', color: '#6c757d', fontWeight: 600 }}>
                          <th className="d-print-none" style={{ width: 32 }}>
                            {canMarkAttendance && visibleDeps.length > 0 && (() => {
                              const siteKeys = visibleDeps.map(
                                (d) => `${d.guard.id}:${siteGroup.site.id}:${d.id}`,
                              );
                              const allOn = siteKeys.every((k) => selectedKeys.has(k));
                              const someOn = !allOn && siteKeys.some((k) => selectedKeys.has(k));
                              return (
                                <Form.Check
                                  type="checkbox"
                                  checked={allOn}
                                  ref={(el) => { if (el) el.indeterminate = someOn; }}
                                  onChange={(e) => toggleSiteSelected(visibleDeps, siteGroup.site.id, e.target.checked)}
                                  aria-label={`Select all at ${siteGroup.site.siteName}`}
                                  style={{ margin: 0 }}
                                />
                              );
                            })()}
                          </th>
                          <th style={{ width: 36 }}>#</th>
                          <th>Guard</th>
                          <th style={{ width: 72 }}>Shift</th>
                          <th className="d-print-none" style={{ width: 160 }}>Status</th>
                          <th className="d-none d-print-table-cell" style={{ width: 80 }}>Status</th>
                          <th className="d-print-none">Notes</th>
                          <th className="d-none d-print-table-cell" style={{ minWidth: 120 }}>Signature</th>
                          <th className="d-print-none" style={{ width: 36 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleDeps.map((dep, idx) => (
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
            );
          })}
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
                <><i className="bi bi-save me-1" />Save Attendance ({pendingCount} change{pendingCount !== 1 ? 's' : ''})</>
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
        <Button
          variant="outline-primary"
          size="sm"
          onClick={() => navigate('/attendance/dashboard')}
        >
          <i className="bi bi-bar-chart-line me-1" />View Attendance Dashboard
        </Button>
      </div>

      <Tabs defaultActiveKey="sheet" className="mb-3 d-print-none">
        <Tab eventKey="sheet" title="Today's Deployment Sheet">
          {deploymentSheet}
        </Tab>
        <Tab eventKey="records" title="Attendance Records">
          <AttendanceRecordsTab />
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

      <CopyRosterModal
        show={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        onSuccess={(targetDate) => {
          setSelectedDate(targetDate.split('T')[0]);
          setShowCopyModal(false);
          showToast(`Roster copied. Viewing ${new Date(targetDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, 'success');
        }}
      />

      <ReplacementModal
        show={!!replacementTarget}
        absentDeployment={replacementTarget}
        onClose={() => setReplacementTarget(null)}
        onSuccess={(result) => {
          setReplacementTarget(null);
          refetch();
          showToast(`${result.replacementDeployment.guardName} assigned as replacement.`, 'success');
        }}
      />

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
          .site-instructions {
            display: flex !important;
            font-size: 9px !important;
            color: #333 !important;
            border-top: 1px solid #ccc !important;
            padding-top: 4px !important;
            margin-top: 4px !important;
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
