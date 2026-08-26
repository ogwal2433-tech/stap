import { useMemo, useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { permissionsApi, type Permission } from '../../lib/permissions.api';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

const NAVY  = '#1B3A6B';
const GREEN = '#1E8449';

/** Icons for the role list. Roles themselves come from the API. */
const ROLE_ICON: Record<string, string> = {
  DIRECTOR:              '👑',
  ASSISTANT_MANAGER:     '🏅',
  ADMINISTRATOR:         '⚙️',
  OPERATIONS_SUPERVISOR: '📋',
  FIELD_SUPERVISOR:      '🗺️',
  ACCOUNTS_OFFICER:      '💰',
  CONTROL_ROOM:          '📡',
  TRAINER:               '🎯',
  MARKETING:             '📈',
};

const pretty = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function RolesPermissionsPage() {
  const { showToast }  = useToast();
  const queryClient    = useQueryClient();
  const [selected, setSelected] = useState<string>('ASSISTANT_MANAGER');
  /** Keys mid-flight, so a toggle cannot be fired twice while the write lands. */
  const [pending, setPending] = useState<Set<string>>(new Set());

  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ['permission-roles'],
    queryFn:  permissionsApi.roles,
  });

  const { data: catalogue = [], isLoading: catLoading } = useQuery({
    queryKey: ['permission-catalogue'],
    queryFn:  permissionsApi.catalogue,
  });

  const { data: roleDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['role-permissions', selected],
    queryFn:  () => permissionsApi.forRole(selected),
    enabled:  Boolean(selected),
  });

  const held = useMemo(
    () => new Set((roleDetail?.permissions ?? []).map((p) => p.key)),
    [roleDetail],
  );
  const editable = roleDetail?.editable ?? false;

  /** Catalogue grouped by module, in the order the API returned it. */
  const grouped = useMemo(() => {
    const out = new Map<string, Permission[]>();
    for (const p of catalogue) {
      const list = out.get(p.module) ?? [];
      list.push(p);
      out.set(p.module, list);
    }
    return [...out.entries()];
  }, [catalogue]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['role-permissions', selected] });
    void queryClient.invalidateQueries({ queryKey: ['permission-roles'] });
  };

  async function toggle(key: string, granted: boolean) {
    if (!editable || pending.has(key)) return;
    setPending((s) => new Set(s).add(key));
    try {
      if (granted) await permissionsApi.revoke(selected, key);
      else         await permissionsApi.grant(selected, key);
      refresh();
      showToast(`${pretty(key)} ${granted ? 'removed' : 'granted'}`, 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err), 'danger');
    } finally {
      setPending((s) => { const n = new Set(s); n.delete(key); return n; });
    }
  }

  async function resetToDefaults() {
    if (!editable) return;
    try {
      const keys = await permissionsApi.defaultsFor(selected);
      await permissionsApi.replace(selected, keys);
      refresh();
      showToast(`${pretty(selected)} reset to ${keys.length} default permissions`, 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err), 'danger');
    }
  }

  if (rolesLoading || catLoading) {
    return <div className="text-center py-5"><Spinner animation="border" /></div>;
  }

  return (
    <div className="p-3">
      <div className="mb-3">
        <h5 className="fw-bold mb-0" style={{ color: NAVY }}>🔐 Roles &amp; Permissions</h5>
        <div className="text-muted small">
          What each role may do. Changes take effect on the role&apos;s next request.
        </div>
      </div>

      <div className="d-flex flex-column flex-lg-row gap-3 align-items-start">
        {/* ── Roles ─────────────────────────────────────────────────────────── */}
        <div style={{
          flex: '0 0 260px', width: '100%', maxWidth: 320,
          border: '1px solid #e9ecef', borderRadius: '0.5rem', overflow: 'hidden',
        }}>
          {roles.map((r) => {
            const active = r.role === selected;
            return (
              <div
                key={r.role}
                onClick={() => setSelected(r.role)}
                style={{
                  padding: '12px 16px', cursor: 'pointer',
                  background: active ? '#D6E0F0' : 'white',
                  borderLeft: `4px solid ${active ? NAVY : 'transparent'}`,
                  borderBottom: '1px solid #e9ecef',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>{ROLE_ICON[r.role] ?? '•'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: active ? 700 : 500, fontSize: '0.85rem' }}>
                    {pretty(r.role)}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>
                    {r.count} permission{r.count === 1 ? '' : 's'}
                    {!r.editable && ' · locked'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Matrix ────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          {!editable && (
            <div style={{
              background: '#FEF9E7', border: '1px solid #F2AA20', borderRadius: '0.5rem',
              padding: '10px 14px', marginBottom: 14, fontSize: '0.82rem',
            }}>
              🔒 <strong>{pretty(selected)}</strong> holds every permission and cannot be changed.
              It is what keeps permission management reachable if another role is misconfigured.
            </div>
          )}

          {detailLoading ? (
            <div className="text-center py-5"><Spinner animation="border" size="sm" /></div>
          ) : (
            <>
              {grouped.map(([module, perms]) => {
                const on = perms.filter((p) => held.has(p.key)).length;
                return (
                  <div key={module} style={{ marginBottom: 20 }}>
                    <div style={{
                      background: NAVY, color: 'white', padding: '8px 16px',
                      borderRadius: '0.375rem 0.375rem 0 0', fontWeight: 700,
                      fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.5px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span>{module.replace(/_/g, ' ')}</span>
                      <span style={{ opacity: 0.75, fontSize: '0.72rem' }}>{on} / {perms.length}</span>
                    </div>

                    <div style={{
                      border: '1px solid #e9ecef', borderTop: 'none',
                      borderRadius: '0 0 0.375rem 0.375rem', overflow: 'hidden',
                    }}>
                      {perms.map((perm, i) => {
                        const granted = held.has(perm.key);
                        const busy    = pending.has(perm.key);
                        return (
                          <div key={perm.key} style={{
                            display: 'flex', alignItems: 'center', padding: '10px 16px',
                            background: i % 2 === 0 ? 'white' : '#F8F9FA',
                            borderBottom: i < perms.length - 1 ? '1px solid #f0f0f0' : 'none',
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{perm.name}</div>
                              <div style={{ fontSize: '0.72rem', color: '#6c757d', fontFamily: 'monospace' }}>
                                {perm.key}
                              </div>
                            </div>

                            <button
                              type="button"
                              aria-label={`${granted ? 'Revoke' : 'Grant'} ${perm.key} for ${selected}`}
                              aria-pressed={granted}
                              disabled={!editable || busy}
                              onClick={() => void toggle(perm.key, granted)}
                              style={{
                                width: 44, height: 24, borderRadius: 12, border: 'none', padding: 0,
                                background: granted ? GREEN : '#ced4da',
                                cursor: editable ? 'pointer' : 'not-allowed',
                                position: 'relative', transition: 'background 0.2s',
                                flexShrink: 0, opacity: editable ? (busy ? 0.5 : 1) : 0.6,
                              }}
                            >
                              <span style={{
                                position: 'absolute', top: 2, left: granted ? 22 : 2,
                                width: 20, height: 20, borderRadius: '50%', background: 'white',
                                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                              }} />
                            </button>

                            <span style={{
                              marginLeft: 10, width: 34, fontSize: '0.72rem', fontWeight: 600,
                              color: granted ? GREEN : '#adb5bd',
                            }}>
                              {granted ? 'ON' : 'OFF'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {editable && (
                <div className="d-flex gap-2 mb-4">
                  <Button variant="outline-secondary" size="sm" onClick={() => void resetToDefaults()}>
                    ↺ Reset to defaults
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
