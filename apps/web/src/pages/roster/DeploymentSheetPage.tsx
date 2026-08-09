import { useState } from 'react';
import { Alert, Button, Spinner } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import {
  ATTENDANCE_STATUS_CONFIG, ATTENDANCE_STATUS_VALUES,
  type AttendanceStatusValue, type DeploymentSheetResult,
  type GuardResponse, type SiteResponse,
} from '@stap/shared';
import { clientsApi } from '../../lib/clients.api';
import { guardsApi } from '../../lib/guards.api';
import { deploymentSheetApi } from '../../lib/deploymentSheet.api';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';
import GuardSelectCell from './GuardSelectCell';

interface SheetRow {
  key:      string;
  siteId:   string;
  guardId:  string;
  date:     string;   // yyyy-mm-dd
  status:   AttendanceStatusValue;
  shift:    string;
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

const today = () => new Date().toISOString().slice(0, 10);
const newKey = () => Math.random().toString(36).slice(2);

export default function DeploymentSheetPage() {
  const { showToast } = useToast();

  const [rows, setRows]           = useState<SheetRow[]>([]);
  const [sheetDate, setSheetDate] = useState(today());
  const [saving, setSaving]       = useState(false);
  const [result, setResult]       = useState<DeploymentSheetResult | null>(null);

  const { data: sitesPage, isLoading: sitesLoading } = useQuery({
    queryKey:  ['sites-all-sheet'],
    queryFn:   () => clientsApi.getAllSites({ limit: 500 }),
    staleTime: 5 * 60_000,
  });
  const sites: SiteResponse[] = sitesPage?.data ?? [];

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

  const addRow = () =>
    setRows(prev => [...prev, {
      key: newKey(), siteId: '', guardId: '', date: sheetDate,
      status: 'PRESENT', shift: '', dirty: true, error: '',
    }]);

  const duplicateLast = () => {
    if (rows.length === 0) return addRow();
    const last = rows[rows.length - 1];
    setRows(prev => [...prev, { ...last, key: newKey(), guardId: '', dirty: true, error: '' }]);
  };

  const removeRow = (key: string) => setRows(prev => prev.filter(r => r.key !== key));

  /** Picking a site pre-fills the shift the site is configured for. */
  const chooseSite = (key: string, siteId: string) => {
    const site = sites.find(s => s.id === siteId);
    const shift = site?.defaultShiftType ?? site?.allowedShiftTypes?.[0] ?? '';
    patch(key, { siteId, shift });
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

  const loading = sitesLoading || guardsLoading;

  return (
    <div className="p-3">
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
          <Button size="sm" variant="outline-primary" onClick={addRow} disabled={loading}>+ Add row</Button>
          <Button size="sm" variant="outline-secondary" onClick={duplicateLast} disabled={loading || rows.length === 0}>
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
          <div className="fw-bold mb-1">Nothing on the sheet yet</div>
          <div style={{ fontSize: '0.82rem', marginBottom: '16px' }}>
            Add a row for each guard being posted on {new Date(sheetDate).toLocaleDateString('en-GB')}.
          </div>
          <Button variant="primary" onClick={addRow}>+ Add first row</Button>
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
                  <th style={{ ...TH, minWidth: '130px' }}>Shift</th>
                  <th style={{ ...TH, minWidth: '150px' }}>Status *</th>
                  <th style={{ ...TH, minWidth: '150px' }}>Date of deployment *</th>
                  <th style={{ ...TH, width: '40px' }} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const site = sites.find(s => s.id === row.siteId);
                  const shiftOptions = site?.allowedShiftTypes?.length ? site.allowedShiftTypes : [];
                  return (
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
                          onChange={e => chooseSite(row.key, e.target.value)}
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

                      <td style={TD}>
                        {shiftOptions.length > 0 ? (
                          <select value={row.shift} onChange={e => patch(row.key, { shift: e.target.value })} style={CELL}>
                            {shiftOptions.map(code => <option key={code} value={code}>{code.replace(/_/g, ' ')}</option>)}
                          </select>
                        ) : (
                          <input
                            readOnly
                            value={row.shift ? row.shift.replace(/_/g, ' ') : ''}
                            placeholder={row.siteId ? 'Site default' : '—'}
                            title="Taken from the site's configured shift. Set one on the site to change it."
                            style={{ ...CELL, background: '#EBF5FB', color: '#1B3A6B', fontWeight: 600 }}
                          />
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
                  );
                })}
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
            <Button size="sm" variant="outline-primary" onClick={addRow}>+ Add row</Button>
            <Button size="sm" variant="outline-secondary" onClick={duplicateLast}>Duplicate last</Button>
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
