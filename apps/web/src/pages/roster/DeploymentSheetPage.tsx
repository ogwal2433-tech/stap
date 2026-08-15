import { useState } from 'react';
import { Alert, Button, Spinner } from 'react-bootstrap';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ATTENDANCE_STATUS_CONFIG, ATTENDANCE_STATUS_VALUES, ROLES,
  type AttendanceStatusValue, type DeploymentSheetResult,
  type GuardResponse, type SiteShiftResponse,
} from '@stap/shared';
import { clientsApi } from '../../lib/clients.api';
import { guardsApi } from '../../lib/guards.api';
import { zonesApi } from '../../lib/zones.api';
import { deploymentSheetApi } from '../../lib/deploymentSheet.api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';
import GuardSelectCell from './GuardSelectCell';

/** A site as the Site dropdown needs it, whichever endpoint supplied it. */
interface SheetSite {
  id:         string;
  siteName:   string;
  clientName: string;
}

interface SheetRow {
  key:      string;
  siteId:   string;
  guardId:  string;
  date:     string;   // yyyy-mm-dd
  status:   AttendanceStatusValue;
  shift:    string;
  /** Shifts this row may choose between. One or none means the shift is fixed. */
  shiftOptions: string[];
  /** True while the site's shift is still being looked up. */
  shiftLoading: boolean;
  dirty:    boolean;
  error:    string;
}

const TH: React.CSSProperties = {
  padding: '8px 10px', color: 'white', fontWeight: 700,
  fontSize: '0.78rem', textAlign: 'left', whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = { padding: '4px 6px', verticalAlign: 'top' };
const CELL: React.CSSProperties = {
  width: '100%', padding: '5px 8px', border: '1px solid #ced4da',
  borderRadius: '0.375rem', fontSize: '0.82rem', background: 'white',
};
const READONLY_CELL: React.CSSProperties = {
  ...CELL, background: '#EBF5FB', color: '#1B3A6B', fontWeight: 600,
};

const today  = () => new Date().toISOString().slice(0, 10);
const newKey = () => Math.random().toString(36).slice(2);
const shiftLabel = (code: string) => code.replace(/_/g, ' ');

export default function DeploymentSheetPage() {
  const { showToast } = useToast();
  const { user }      = useAuth();
  const queryClient   = useQueryClient();

  // A Field Supervisor works one zone, so the sheet reads it from their account
  // rather than making them pick. Every other deployment role covers all sites.
  const isFieldSupervisor = user?.role === ROLES.FIELD_SUPERVISOR;

  const [rows, setRows]           = useState<SheetRow[]>([]);
  const [sheetDate, setSheetDate] = useState(today());
  const [saving, setSaving]       = useState(false);
  const [result, setResult]       = useState<DeploymentSheetResult | null>(null);

  const { data: myZone, isLoading: zoneLoading } = useQuery({
    queryKey:  ['zones', 'my-zone'],
    queryFn:   () => zonesApi.myZone(),
    enabled:   isFieldSupervisor,
    staleTime: 5 * 60_000,
  });

  const { data: sites = [], isLoading: sitesLoading } = useQuery<SheetSite[]>({
    queryKey: ['deployment-sheet-sites', isFieldSupervisor, myZone?.id ?? null],
    queryFn:  async () => {
      if (isFieldSupervisor) {
        if (!myZone?.id) return [];
        const zoneSites = await zonesApi.listSites(myZone.id);
        return zoneSites.map(s => ({ id: s.id, siteName: s.siteName, clientName: s.clientName }));
      }
      const page = await clientsApi.getAllSites({ limit: 500 });
      return page.data.map(s => ({ id: s.id, siteName: s.siteName, clientName: s.clientName }));
    },
    // Waiting for the zone first keeps a supervisor from briefly seeing an empty
    // dropdown that then fills in.
    enabled:   !isFieldSupervisor || !zoneLoading,
    staleTime: 5 * 60_000,
  });

  const { data: guardsPage, isLoading: guardsLoading } = useQuery({
    queryKey:  ['guards-deployable-sheet'],
    queryFn:   () => guardsApi.list({ status: 'ACTIVE', limit: 500 }),
    staleTime: 5 * 60_000,
  });
  const guards: GuardResponse[] = guardsPage?.data ?? [];

  const dirtyCount = rows.filter(r => r.dirty).length;

  // ── Row operations ───────────────────────────────────────────────────────────

  const patch = (key: string, changes: Partial<SheetRow>) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...changes, dirty: true, error: '' } : r)));

  const blankRow = (): SheetRow => ({
    key: newKey(), siteId: '', guardId: '', date: sheetDate,
    status: 'PRESENT', shift: '', shiftOptions: [], shiftLoading: false,
    dirty: true, error: '',
  });

  const addRow = () => setRows(prev => [...prev, blankRow()]);

  const duplicateLast = () => {
    if (rows.length === 0) return addRow();
    const last = rows[rows.length - 1];
    setRows(prev => [...prev, { ...last, key: newKey(), guardId: '', dirty: true, error: '' }]);
  };

  const removeRow = (key: string) => setRows(prev => prev.filter(r => r.key !== key));

  /**
   * Picking a site fills the Shift column from that site's active contract.
   *
   * The lookup is cached per site, so re-picking the same site on later rows is
   * instant and does not re-hit the API.
   */
  const chooseSite = async (key: string, siteId: string) => {
    patch(key, { siteId, shift: '', shiftOptions: [], shiftLoading: !!siteId });
    if (!siteId) return;

    try {
      const resolved = await queryClient.fetchQuery<SiteShiftResponse>({
        queryKey:  ['site-shift', siteId],
        queryFn:   () => clientsApi.getSiteShift(siteId),
        staleTime: 5 * 60_000,
      });
      setRows(prev => prev.map(r =>
        r.key === key && r.siteId === siteId
          ? { ...r, shift: resolved.shift ?? '', shiftOptions: resolved.shiftOptions, shiftLoading: false }
          : r));
    } catch {
      // The sheet still saves without a shift — the server resolves one itself,
      // so a failed lookup costs the preview, not the entry.
      setRows(prev => prev.map(r => (r.key === key ? { ...r, shiftLoading: false } : r)));
    }
  };

  /** The header date drives every row — individual rows can still be overridden. */
  const applySheetDate = (date: string) => {
    setSheetDate(date);
    setRows(prev => prev.map(r => ({ ...r, date, dirty: true })));
  };

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    const withErrors = rows.map(r => ({
      ...r,
      error: !r.siteId ? 'Select a site' : !r.guardId ? 'Select a guard' : !r.date ? 'Date required' : '',
    }));
    if (withErrors.some(r => r.error)) {
      setRows(withErrors);
      showToast(`${withErrors.filter(r => r.error).length} row(s) are incomplete.`, 'danger');
      return;
    }

    setSaving(true);
    setResult(null);
    try {
      const res = await deploymentSheetApi.save(
        rows.map(r => ({
          siteId:  r.siteId,
          guardId: r.guardId,
          date:    `${r.date}T00:00:00.000Z`,
          status:  r.status,
          ...(r.shift ? { shift: r.shift } : {}),
        })),
      );
      setResult(res);

      // Errors come back keyed by 1-based sheet position.
      setRows(prev => prev.map((r, i) => {
        const err = res.errors.find(e => e.row === i + 1);
        return err ? { ...r, error: err.reason } : { ...r, dirty: false, error: '' };
      }));

      if (res.errors.length) {
        showToast(`Saved ${res.created + res.updated} row(s); ${res.skipped} skipped — see the rows in red.`, 'danger');
      } else {
        showToast(`Saved — ${res.created} added, ${res.updated} updated.`, 'success');
      }
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not save the sheet. Please try again.'), 'danger');
    } finally {
      setSaving(false);
    }
  };

  const loading      = sitesLoading || guardsLoading || (isFieldSupervisor && zoneLoading);
  const zoneMissing  = isFieldSupervisor && !zoneLoading && !myZone;
  const canAddRows   = !loading && sites.length > 0;

  return (
    <div className="p-3">
      {/* A Field Supervisor's sheet is scoped to their zone — say so plainly, and
          say it loudly when no zone has been assigned yet, because an empty
          Site dropdown otherwise looks like a broken page. */}
      {isFieldSupervisor && !zoneLoading && (
        <div
          style={{
            background:   myZone ? '#D6E0F0' : '#FEF9E7',
            borderLeft:   `3px solid ${myZone ? '#1B3A6B' : '#E8701A'}`,
            borderRadius: '0.5rem',
            padding:      '8px 14px',
            marginBottom: '12px',
            fontSize:     '0.82rem',
          }}
        >
          {myZone ? (
            <>
              <strong>Your zone:</strong> {myZone.name}
              {' · '}{sites.length} site{sites.length === 1 ? '' : 's'}
            </>
          ) : (
            <span style={{ color: '#856404' }}>
              You have not been assigned to a zone yet, so there are no sites to deploy to.
              Ask an Administrator to add you to a zone.
            </span>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
          background: '#F2F4F7', padding: '10px 14px', borderRadius: '0.5rem', marginBottom: '12px',
        }}
      >
        <div className="fw-bold" style={{ color: '#1B3A6B' }}>Deployment Sheet</div>

        <div className="d-flex align-items-center gap-2">
          <label className="small fw-semibold mb-0" style={{ color: '#4A5568' }}>Date</label>
          <input
            type="date"
            value={sheetDate}
            onChange={e => applySheetDate(e.target.value)}
            style={{ ...CELL, width: 'auto' }}
          />
        </div>

        <div className="d-flex gap-2 ms-auto">
          <Button size="sm" variant="outline-primary" onClick={addRow} disabled={!canAddRows}>+ Add row</Button>
          <Button size="sm" variant="outline-secondary" onClick={duplicateLast} disabled={!canAddRows || rows.length === 0}>
            Duplicate last
          </Button>
          <Button size="sm" variant="success" onClick={handleSave} disabled={saving || dirtyCount === 0}>
            {saving
              ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Saving…</>
              : `Save all (${dirtyCount})`}
          </Button>
        </div>
      </div>

      {result && (
        <Alert
          variant={result.errors.length ? 'warning' : 'success'}
          dismissible
          onClose={() => setResult(null)}
          className="py-2 small"
        >
          {result.created} created · {result.updated} updated
          {result.skipped > 0 && <> · <strong>{result.skipped} skipped</strong></>}
        </Alert>
      )}

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
      ) : rows.length === 0 ? (
        <div style={{ border: '2px dashed #ced4da', borderRadius: '0.5rem', padding: '48px', textAlign: 'center', color: '#6c757d' }}>
          <div className="fw-bold mb-1">
            {zoneMissing ? 'No zone assigned' : 'Nothing on the sheet yet'}
          </div>
          <div style={{ fontSize: '0.82rem', marginBottom: '16px' }}>
            {zoneMissing
              ? 'Once you are assigned a zone, its sites appear here.'
              : `Add a row for each guard being posted on ${new Date(sheetDate).toLocaleDateString('en-GB')}.`}
          </div>
          {canAddRows && <Button variant="primary" onClick={addRow}>+ Add first row</Button>}
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#1B3A6B' }}>
                  <th style={{ ...TH, width: '38px' }}>#</th>
                  <th style={{ ...TH, minWidth: '190px' }}>Site *</th>
                  <th style={{ ...TH, minWidth: '200px' }}>Guard name *</th>
                  <th style={{ ...TH, minWidth: '140px' }}>
                    Shift
                    <div style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 400 }}>from contract</div>
                  </th>
                  <th style={{ ...TH, minWidth: '150px' }}>Status *</th>
                  <th style={{ ...TH, minWidth: '150px' }}>Date of deployment *</th>
                  <th style={{ ...TH, width: '40px' }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr
                    key={row.key}
                    style={{
                      background: row.error ? '#fdecea' : idx % 2 === 0 ? '#fff' : '#F8F9FA',
                      borderBottom: '1px solid #e9ecef',
                    }}
                  >
                    <td style={{ ...TD, color: '#6c757d', fontSize: '0.75rem', paddingTop: '11px' }}>{idx + 1}</td>

                    <td style={TD}>
                      <select
                        value={row.siteId}
                        onChange={e => void chooseSite(row.key, e.target.value)}
                        style={{ ...CELL, borderColor: row.error && !row.siteId ? '#dc3545' : '#ced4da' }}
                      >
                        <option value="">— Select site —</option>
                        {sites.map(s => (
                          <option key={s.id} value={s.id}>{s.siteName} — {s.clientName}</option>
                        ))}
                      </select>
                    </td>

                    <td style={TD}>
                      <GuardSelectCell
                        value={row.guardId}
                        guards={guards}
                        invalid={!!row.error && !row.guardId}
                        onChange={guardId => patch(row.key, { guardId })}
                      />
                    </td>

                    {/* Shift is the site's to decide, not the person filling the
                        sheet. It only becomes a choice where the site genuinely
                        runs several shifts — otherwise a two-shift site's night
                        rows could never be entered. */}
                    <td style={TD}>
                      {row.shiftLoading ? (
                        <div style={{ ...READONLY_CELL, color: '#6c757d', fontWeight: 400 }}>Loading…</div>
                      ) : row.shiftOptions.length > 1 ? (
                        <select
                          value={row.shift}
                          onChange={e => patch(row.key, { shift: e.target.value })}
                          style={CELL}
                          title="This site runs more than one shift — pick the one being posted."
                        >
                          {row.shiftOptions.map(code => (
                            <option key={code} value={code}>{shiftLabel(code)}</option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <div
                            style={{ ...READONLY_CELL, color: row.shift ? '#1B3A6B' : '#adb5bd', fontWeight: row.shift ? 600 : 400 }}
                            title="Taken from the site's active contract."
                          >
                            {row.shift ? shiftLabel(row.shift) : '—'}
                          </div>
                          {!row.shift && row.siteId && (
                            <div style={{ fontSize: '0.68rem', color: '#adb5bd', marginTop: '2px' }}>
                              No shift on contract
                            </div>
                          )}
                        </>
                      )}
                    </td>

                    <td style={TD}>
                      <select
                        value={row.status}
                        onChange={e => patch(row.key, { status: e.target.value as AttendanceStatusValue })}
                        style={{ ...CELL, background: ATTENDANCE_STATUS_CONFIG[row.status].bg }}
                      >
                        {ATTENDANCE_STATUS_VALUES.map(s => (
                          <option key={s} value={s}>
                            {ATTENDANCE_STATUS_CONFIG[s].icon} {ATTENDANCE_STATUS_CONFIG[s].label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td style={TD}>
                      <input
                        type="date"
                        value={row.date}
                        onChange={e => patch(row.key, { date: e.target.value })}
                        style={CELL}
                      />
                    </td>

                    <td style={{ ...TD, textAlign: 'center', paddingTop: '8px' }}>
                      <button
                        type="button"
                        onClick={() => removeRow(row.key)}
                        aria-label={`Remove row ${idx + 1}`}
                        style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '1rem' }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-row problems, listed once so long sheets don't hide them */}
          {rows.some(r => r.error) && (
            <Alert variant="danger" className="mt-3 py-2 small mb-0">
              {rows.map((r, i) => r.error && <div key={r.key}>Row {i + 1}: {r.error}</div>)}
            </Alert>
          )}

          <div className="d-flex gap-2 align-items-center mt-3 pt-3" style={{ borderTop: '1px solid #e9ecef' }}>
            <Button size="sm" variant="outline-primary" onClick={addRow} disabled={!canAddRows}>+ Add row</Button>
            <Button size="sm" variant="outline-secondary" onClick={duplicateLast} disabled={!canAddRows}>Duplicate last</Button>
            <div className="ms-auto small text-muted">
              {rows.length} row{rows.length === 1 ? '' : 's'} · {dirtyCount} unsaved
            </div>
            <Button size="sm" variant="success" onClick={handleSave} disabled={saving || dirtyCount === 0}>
              {saving ? 'Saving…' : 'Save all'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
