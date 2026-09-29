import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { permissionsApi, type Permission, type RolePreset, type RoleSummary } from '../../lib/permissions.api';
import { rolesApi } from '../../lib/roles.api';
import { ROLE_NAME_PATTERN, normaliseRoleName } from '@security360/shared';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { getApiErrorMessage } from '../../lib/api';
import {
  ROLES_MANAGE_KEY, applicablePresetKeys, diffSets, locksOutViewer, withModule,
} from '../../lib/permissionSets';

const NAVY  = '#1B3A6B';
const GREEN = '#1E8449';
const RED   = '#C0392B';

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
  MARKETING_HEAD:        '📈',
  SALES:                 '🤝',
  HR:                    '🗂️',
};

const pretty = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ── Confirm ───────────────────────────────────────────────────────────────────

interface PendingConfirm {
  title:        string;
  body:         ReactNode;
  confirmLabel: string;
  danger:       boolean;
  onConfirm:    () => Promise<void>;
}

function ConfirmDialog({ confirm, onClose }: { confirm: PendingConfirm | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!confirm) return null;

  const run = async () => {
    setBusy(true);
    try {
      await confirm.onConfirm();
    } finally {
      setBusy(false);
      onClose();
    }
  };

  return (
    <Modal show onHide={() => { if (!busy) onClose(); }} centered>
      <Modal.Header closeButton={!busy}>
        <Modal.Title style={{ fontSize: '1rem' }}>{confirm.title}</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: '0.85rem' }}>{confirm.body}</Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button variant={confirm.danger ? 'danger' : 'primary'} size="sm" disabled={busy} onClick={() => void run()}>
          {busy ? <Spinner size="sm" animation="border" /> : confirm.confirmLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Save as preset ────────────────────────────────────────────────────────────

function SavePresetModal({
  show, roleLabel, keys, onHide, onSaved,
}: {
  show:      boolean;
  roleLabel: string;
  keys:      string[];
  onHide:    () => void;
  onSaved:   (preset: RolePreset) => void;
}) {
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [error, setError]             = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);

  const close = () => {
    if (saving) return;
    setName(''); setDescription(''); setError(null);
    onHide();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the preset a name.');
    setSaving(true);
    setError(null);
    try {
      const preset = await permissionsApi.createPreset({
        name:           name.trim(),
        description:    description.trim() || undefined,
        permissionKeys: keys,
      });
      setName(''); setDescription('');
      onSaved(preset);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save the preset.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={close} centered>
      <Form onSubmit={submit}>
        <Modal.Header closeButton={!saving}>
          <Modal.Title style={{ fontSize: '1rem' }}>💾 Save as preset</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted">
            Saves the {plural(keys.length, 'permission')} <strong>{roleLabel}</strong> holds right
            now, under a name you can apply to any role later. Saving changes no role.
          </p>
          {error && (
            <div
              style={{
                background: '#FDECEA', border: '1px solid #F5C6CB', borderRadius: '0.375rem',
                padding: '8px 12px', marginBottom: 12, fontSize: '0.82rem', color: RED,
              }}
            >
              {error}
            </div>
          )}
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold small">Name *</Form.Label>
            <Form.Control
              size="sm"
              value={name}
              maxLength={80}
              autoFocus
              placeholder="e.g. Read-only finance"
              onChange={(e) => setName(e.target.value)}
            />
          </Form.Group>
          <Form.Group>
            <Form.Label className="fw-bold small">
              Description <span className="text-muted fw-normal">(optional)</span>
            </Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              size="sm"
              value={description}
              maxLength={300}
              placeholder="Who this is for"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" disabled={saving} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving || !name.trim()}>
            {saving ? <Spinner size="sm" animation="border" /> : 'Save preset'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

// ── Create / edit a role ──────────────────────────────────────────────────────

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

function RoleFormModal({
  mode, show, initial, viewerRole, onHide, onSaved,
}: {
  mode:        'create' | 'edit';
  show:        boolean;
  initial?:    RoleSummary;
  viewerRole?: string;
  onHide:      () => void;
  onSaved:     (name: string, label: string) => void;
}) {
  const [label, setLabel]             = useState('');
  const [name, setName]               = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [colour, setColour]           = useState('#1B3A6B');
  const [active, setActive]           = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);

  // Start from the role being edited — or blank — each time the modal opens.
  // Keyed on `show` alone: re-running on `initial` would wipe what someone is
  // typing whenever the role list refetches in the background.
  useEffect(() => {
    if (!show) return;
    setLabel(initial?.label ?? '');
    setName(initial?.role ?? '');
    setNameTouched(false);
    setDescription(initial?.description ?? '');
    setColour(initial?.colour ?? '#1B3A6B');
    setActive(initial?.isActive ?? true);
    setError(null);
  }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  // Until someone edits it, the system name follows the label.
  const systemName = mode === 'edit'
    ? (initial?.role ?? '')
    : normaliseRoleName(nameTouched ? name : label);
  const nameValid    = mode === 'edit' || ROLE_NAME_PATTERN.test(systemName);
  const activeLocked = mode === 'edit' && (initial?.role === 'DIRECTOR' || initial?.role === viewerRole);
  const disabling    = mode === 'edit' && !!initial?.isActive && !active;

  const close = () => { if (!saving) onHide(); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (label.trim().length < 2) return setError('Give the role a name of at least 2 characters.');
    if (!nameValid) {
      return setError('The system name must start with a letter and use only letters, numbers and underscores.');
    }
    setSaving(true);
    setError(null);
    try {
      if (mode === 'create') {
        const role = await rolesApi.create({
          label: label.trim(), name: systemName, description: description.trim() || null, colour,
        });
        onSaved(role.name, role.label);
      } else if (initial) {
        const role = await rolesApi.update(initial.role, {
          label:       label.trim(),
          description: description.trim() || null,
          colour,
          ...(active !== initial.isActive ? { isActive: active } : {}),
        });
        onSaved(role.name, role.label);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save the role.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={close} centered>
      <Form onSubmit={submit}>
        <Modal.Header closeButton={!saving} closeVariant="white" style={{ background: NAVY, color: 'white' }}>
          <Modal.Title style={{ fontSize: '1rem' }}>
            {mode === 'create' ? 'Create a role' : `Edit ${initial?.label ?? 'role'}`}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && (
            <div
              style={{
                background: '#FDECEA', border: '1px solid #F5C6CB', borderRadius: '0.375rem',
                padding: '8px 12px', marginBottom: 12, fontSize: '0.82rem', color: RED,
              }}
            >
              {error}
            </div>
          )}

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold small">Name *</Form.Label>
            <Form.Control
              size="sm" value={label} maxLength={60} autoFocus placeholder="e.g. Zone Manager"
              onChange={(e) => setLabel(e.target.value)}
            />
            <Form.Text className="text-muted">What people see — in the staff directory and on badges.</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold small">System name</Form.Label>
            <Form.Control
              size="sm" value={systemName} disabled={mode === 'edit'} isInvalid={!nameValid}
              style={{ fontFamily: 'monospace' }}
              onChange={(e) => { setNameTouched(true); setName(e.target.value); }}
            />
            <Form.Text className="text-muted">
              {mode === 'edit'
                ? 'Fixed once a role is created — code and sign-in tokens refer to it.'
                : 'Follows the name until you change it. Fixed once the role is created.'}
            </Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold small">
              Description <span className="text-muted fw-normal">(optional)</span>
            </Form.Label>
            <Form.Control
              as="textarea" rows={2} size="sm" value={description} maxLength={300}
              placeholder="What this role is for" onChange={(e) => setDescription(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold small">Badge colour</Form.Label>
            <div className="d-flex gap-2 align-items-center">
              <input
                type="color" value={colour} aria-label="Badge colour"
                onChange={(e) => setColour(e.target.value)}
                style={{ width: 40, height: 32, border: '1px solid #ced4da', borderRadius: '0.375rem', padding: 2, cursor: 'pointer' }}
              />
              <span style={{ background: colour, color: 'white', padding: '3px 12px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 700 }}>
                {label.trim() || 'Preview'}
              </span>
            </div>
          </Form.Group>

          {mode === 'edit' && (
            <Form.Group className="mb-1">
              <Form.Check
                type="switch" id="role-active" label="Enabled"
                checked={active} disabled={activeLocked}
                onChange={(e) => setActive(e.target.checked)}
              />
              <Form.Text className="text-muted">
                {initial?.role === 'DIRECTOR'
                  ? 'Director cannot be disabled — it keeps permission management reachable.'
                  : initial?.role === viewerRole
                    ? 'You cannot disable the role you are signed in with.'
                    : 'A disabled role holds no permissions and its users cannot sign in. Its grants are kept.'}
              </Form.Text>
              {disabling && initial && initial.userCount > 0 && (
                <div
                  style={{
                    background: '#FDEDEC', borderLeft: `3px solid ${RED}`, borderRadius: 4,
                    padding: '8px 12px', marginTop: 8, fontSize: '0.8rem', color: '#922B21',
                  }}
                >
                  {people(initial.userCount)} with this role will be signed out within 15 minutes and
                  unable to sign back in.
                </div>
              )}
            </Form.Group>
          )}

          {mode === 'create' && (
            <div
              style={{
                background: '#FEF9E7', borderLeft: '3px solid #F2AA20', borderRadius: 4,
                padding: '8px 12px', fontSize: '0.78rem', color: '#856404',
              }}
            >
              New roles start with no permissions — grant what it needs in the matrix, or apply a
              preset. Some older areas still check for specific built-in roles and will refuse a
              custom one even with the right permission.
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" disabled={saving} onClick={close}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving || !label.trim() || !nameValid}>
            {saving ? <Spinner size="sm" animation="border" /> : mode === 'create' ? 'Create role' : 'Save'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const headerLink = (colour: string, disabled: boolean): React.CSSProperties => ({
  background: 'none', border: 'none', padding: 0, color: colour,
  fontSize: '0.7rem', fontWeight: 600, textTransform: 'none', letterSpacing: 0,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
});

export default function RolesPermissionsPage() {
  const { showToast } = useToast();
  const { user }      = useAuth();
  const queryClient   = useQueryClient();

  const [selected, setSelected]     = useState<string>('ASSISTANT_MANAGER');
  const [roleSearch, setRoleSearch] = useState('');
  /** Keys mid-flight, so a toggle cannot be fired twice while the write lands. */
  const [pending, setPending]       = useState<Set<string>>(new Set());
  /** A whole-set replacement is in flight; the matrix holds still until it lands. */
  const [bulkBusy, setBulkBusy]     = useState(false);
  const [confirm, setConfirm]       = useState<PendingConfirm | null>(null);
  const [showSave, setShowSave]     = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit]     = useState(false);

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

  const { data: presets = [], isLoading: presetsLoading } = useQuery({
    queryKey: ['permission-presets'],
    queryFn:  permissionsApi.presets,
  });

  const selectedRole  = roles.find((r) => r.role === selected);
  const selectedLabel = selectedRole?.label ?? pretty(selected);

  const held = useMemo(
    () => new Set((roleDetail?.permissions ?? []).map((p) => p.key)),
    [roleDetail],
  );
  const editable      = roleDetail?.editable ?? false;
  const catalogueKeys = useMemo(() => catalogue.map((p) => p.key), [catalogue]);
  const pct = catalogue.length ? Math.round((held.size / catalogue.length) * 100) : 0;

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

  const visibleRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return q
      ? roles.filter((r) => r.role.toLowerCase().includes(q) || r.label.toLowerCase().includes(q))
      : roles;
  }, [roles, roleSearch]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['role-permissions', selected] });
    void queryClient.invalidateQueries({ queryKey: ['permission-roles'] });
  };

  const lockoutWarning = (
    <div
      style={{
        background: '#FDEDEC', borderLeft: `3px solid ${RED}`, borderRadius: 4,
        padding: '8px 12px', margin: '10px 0', fontSize: '0.8rem', color: '#922B21',
      }}
    >
      <strong>{selectedLabel} is your own role.</strong> Without <code>{ROLES_MANAGE_KEY}</code>{' '}
      you will lose this page the moment the change lands, and only a Director will be able to
      restore it.
    </div>
  );

  // ── Single toggle ───────────────────────────────────────────────────────────

  async function toggle(key: string, granted: boolean) {
    if (!editable || pending.has(key) || bulkBusy) return;

    const run = async () => {
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
    };

    // The one single toggle worth stopping for: taking away your own way back.
    if (granted && key === ROLES_MANAGE_KEY && user?.role === selected) {
      setConfirm({
        title:        'Remove your own access?',
        body:         lockoutWarning,
        confirmLabel: 'Remove access',
        danger:       true,
        onConfirm:    run,
      });
      return;
    }
    await run();
  }

  // ── Whole-set replacement ───────────────────────────────────────────────────

  /**
   * Every bulk change — a module at once, a reset, a preset — becomes one call
   * to the replace endpoint: one transaction, one audit entry, all or nothing.
   * Firing a grant per key would leave a half-applied role if one failed, and
   * write a separate audit row for each.
   *
   * Anything that removes a permission is confirmed first, with the counts.
   */
  async function applySet(
    next: string[],
    reason: string,
    opts: { always?: boolean; title?: string; note?: ReactNode } = {},
  ) {
    const before = [...held];
    const { added, removed } = diffSets(before, next);
    if (!added.length && !removed.length) {
      showToast(`${selectedLabel} already has exactly that set.`, 'info');
      return;
    }

    const lockout = locksOutViewer(user?.role, selected, before, next);

    const run = async () => {
      setBulkBusy(true);
      try {
        await permissionsApi.replace(selected, next, reason);
        refresh();
        showToast(`${selectedLabel}: +${added.length} / −${removed.length}`, 'success');
      } catch (err) {
        showToast(getApiErrorMessage(err), 'danger');
      } finally {
        setBulkBusy(false);
      }
    };

    if (!removed.length && !lockout && !opts.always) {
      await run();
      return;
    }

    const phrase = [
      added.length   ? `gain ${added.length}`   : '',
      removed.length ? `lose ${removed.length}` : '',
    ].filter(Boolean).join(' and ');

    setConfirm({
      title: opts.title ?? `Change ${selectedLabel}?`,
      body: (
        <>
          <p className="mb-2">
            {selectedLabel} will {phrase} permission{added.length + removed.length === 1 ? '' : 's'}.
          </p>
          {removed.length > 0 && (
            <details className="mb-2">
              <summary className="small text-muted">Show what is removed</summary>
              <div className="small font-monospace mt-1" style={{ color: RED }}>{removed.join(', ')}</div>
            </details>
          )}
          {opts.note}
          {lockout && lockoutWarning}
          <p className="mb-0 small text-muted">Takes effect on that role&apos;s next request.</p>
        </>
      ),
      confirmLabel: removed.length ? 'Apply changes' : 'Apply',
      danger:       removed.length > 0 || lockout,
      onConfirm:    run,
    });
  }

  const grantModule = (module: string, perms: Permission[]) =>
    applySet(withModule(held, perms.map((p) => p.key), true), `Grant all: ${module}`);

  const revokeModule = (module: string, perms: Permission[]) =>
    applySet(withModule(held, perms.map((p) => p.key), false), `Revoke all: ${module}`, {
      title: `Revoke all ${module.replace(/_/g, ' ')} permissions?`,
    });

  async function resetToDefaults() {
    if (!editable) return;
    try {
      const keys = await permissionsApi.defaultsFor(selected);
      await applySet(keys, 'Reset to defaults', {
        always: true,
        title:  `Reset ${selectedLabel} to its defaults?`,
      });
    } catch (err) {
      showToast(getApiErrorMessage(err), 'danger');
    }
  }

  // ── Presets ─────────────────────────────────────────────────────────────────

  function applyPreset(preset: RolePreset) {
    const { keys, skipped } = applicablePresetKeys(preset.permissionKeys, catalogueKeys);
    void applySet(keys, `Applied preset: ${preset.name}`, {
      always: true,
      title:  `Apply “${preset.name}” to ${selectedLabel}?`,
      note: skipped.length > 0 ? (
        <div
          style={{
            background: '#FEF9E7', borderLeft: '3px solid #F2AA20', borderRadius: 4,
            padding: '8px 12px', marginBottom: 8, fontSize: '0.78rem', color: '#856404',
          }}
        >
          {plural(skipped.length, 'key')} in this preset no longer exist and will be skipped:{' '}
          <code>{skipped.join(', ')}</code>
        </div>
      ) : undefined,
    });
  }

  function deletePreset(preset: RolePreset) {
    setConfirm({
      title: `Delete preset “${preset.name}”?`,
      body: (
        <p className="mb-0">
          This removes the saved set only. No role changes — each keeps whatever it holds now.
        </p>
      ),
      confirmLabel: 'Delete preset',
      danger:       true,
      onConfirm: async () => {
        try {
          await permissionsApi.deletePreset(preset.id);
          void queryClient.invalidateQueries({ queryKey: ['permission-presets'] });
          showToast(`Preset “${preset.name}” deleted`, 'success');
        } catch (err) {
          showToast(getApiErrorMessage(err), 'danger');
        }
      },
    });
  }

  function deleteRole(role: RoleSummary) {
    setConfirm({
      title: `Delete the ${role.label} role?`,
      body: (
        <>
          <p className="mb-2">
            The role and its {plural(role.count, 'permission')} are removed. Nobody holds it, so no
            one loses access.
          </p>
          <p className="mb-0 small text-muted">This cannot be undone. Presets are unaffected.</p>
        </>
      ),
      confirmLabel: 'Delete role',
      danger:       true,
      onConfirm: async () => {
        try {
          await rolesApi.remove(role.role);
          void queryClient.invalidateQueries({ queryKey: ['permission-roles'] });
          void queryClient.invalidateQueries({ queryKey: ['roles'] });
          setSelected('ASSISTANT_MANAGER');
          showToast(`${role.label} deleted`, 'success');
        } catch (err) {
          showToast(getApiErrorMessage(err), 'danger');
        }
      },
    });
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
        {/* ── Roles and presets ─────────────────────────────────────────────── */}
        <div style={{ flex: '0 0 270px', width: '100%', maxWidth: 330 }}>
          <div style={{ border: '1px solid #e9ecef', borderRadius: '0.5rem', overflow: 'hidden' }}>
            <div style={{ padding: 10, borderBottom: '1px solid #e9ecef', background: '#F8F9FA' }}>
              <Button
                size="sm"
                className="w-100 mb-2"
                style={{ background: NAVY, borderColor: NAVY }}
                onClick={() => setShowCreate(true)}
              >
                + New role
              </Button>
              <Form.Control
                size="sm"
                placeholder="Search roles…"
                value={roleSearch}
                aria-label="Search roles"
                onChange={(e) => setRoleSearch(e.target.value)}
              />
            </div>
            {visibleRoles.length === 0 ? (
              <div className="text-muted small p-3">No role matches “{roleSearch}”.</div>
            ) : (
              visibleRoles.map((r) => {
                const active = r.role === selected;
                return (
                  <button
                    key={r.role}
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => setSelected(r.role)}
                    style={{
                      width: '100%', textAlign: 'left', border: 'none',
                      padding: '12px 16px', cursor: 'pointer',
                      background: active ? '#D6E0F0' : 'white',
                      borderLeft: `4px solid ${active ? NAVY : 'transparent'}`,
                      borderBottom: '1px solid #e9ecef',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <span style={{ fontSize: '1.2rem', width: 22, textAlign: 'center' }}>
                      {ROLE_ICON[r.role] ?? (
                        <span
                          aria-hidden
                          style={{
                            display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                            background: r.colour ?? '#adb5bd',
                          }}
                        />
                      )}
                    </span>
                    <div style={{ flex: 1, minWidth: 0, opacity: r.isActive ? 1 : 0.55 }}>
                      <div
                        className="d-flex align-items-center gap-1"
                        style={{ fontWeight: active ? 700 : 500, fontSize: '0.85rem' }}
                      >
                        <span className="text-truncate">{r.label}</span>
                        {!r.isSystem && <Badge bg="success" style={{ fontSize: '0.55rem' }}>Custom</Badge>}
                        {!r.isActive && <Badge bg="secondary" style={{ fontSize: '0.55rem' }}>Disabled</Badge>}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>
                        {plural(r.count, 'permission')} · {plural(r.userCount, 'user')}
                        {!r.editable && ' · locked'}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Presets sit under the roles they are applied to. */}
          <div style={{ marginTop: 12, border: '1px solid #e9ecef', borderRadius: '0.5rem', overflow: 'hidden' }}>
            <div
              style={{
                background: '#F2F4F7', padding: '8px 12px', fontWeight: 700,
                fontSize: '0.78rem', color: NAVY, display: 'flex', justifyContent: 'space-between',
              }}
            >
              <span>Presets</span>
              <span className="text-muted fw-normal">{presets.length}</span>
            </div>
            {presetsLoading ? (
              <div className="text-center py-3"><Spinner animation="border" size="sm" /></div>
            ) : presets.length === 0 ? (
              <div className="text-muted p-3" style={{ fontSize: '0.75rem' }}>
                No presets yet. Set up a role the way you want it, then save it as a preset to
                reuse on another.
              </div>
            ) : (
              presets.map((p) => (
                <div key={p.id} style={{ padding: '8px 12px', borderTop: '1px solid #f0f0f0' }}>
                  <div className="d-flex justify-content-between align-items-start gap-2">
                    <div style={{ minWidth: 0 }}>
                      <div className="text-truncate" title={p.name} style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#6c757d' }}>
                        {plural(p.permissionKeys.length, 'permission')}
                        {p.createdBy ? ` · ${p.createdBy.name}` : ''}
                      </div>
                      {p.description && (
                        <div className="text-truncate" title={p.description} style={{ fontSize: '0.68rem', color: '#6c757d' }}>
                          {p.description}
                        </div>
                      )}
                    </div>
                    <div className="d-flex gap-1 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline-primary"
                        style={{ fontSize: '0.68rem', padding: '1px 8px' }}
                        disabled={!editable || bulkBusy}
                        title={editable ? `Apply to ${selectedLabel}` : `${selectedLabel} cannot be changed`}
                        onClick={() => applyPreset(p)}
                      >
                        Apply
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        style={{ fontSize: '0.68rem', padding: '1px 7px' }}
                        aria-label={`Delete preset ${p.name}`}
                        title="Delete preset"
                        onClick={() => deletePreset(p)}
                      >
                        ×
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Matrix ────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
          <div style={{ border: '1px solid #e9ecef', borderRadius: '0.5rem', padding: '14px 16px', marginBottom: 14 }}>
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: NAVY }}>
                  {ROLE_ICON[selected] ?? '•'} {selectedLabel}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                  {held.size} of {catalogue.length} permissions granted
                </div>
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <Button variant="outline-primary" size="sm" disabled={!selectedRole} onClick={() => setShowEdit(true)}>
                  ✎ Edit role
                </Button>
                {selectedRole && !selectedRole.isSystem && (
                  <Button
                    variant="outline-danger"
                    size="sm"
                    disabled={selectedRole.userCount > 0}
                    title={
                      selectedRole.userCount > 0
                        ? `${plural(selectedRole.userCount, 'user')} still hold this role — move them first`
                        : 'Delete this role'
                    }
                    onClick={() => deleteRole(selectedRole)}
                  >
                    🗑 Delete role
                  </Button>
                )}
                <Button
                  variant="outline-secondary"
                  size="sm"
                  disabled={detailLoading || bulkBusy}
                  onClick={() => setShowSave(true)}
                  title="Save this role's current permissions under a name"
                >
                  💾 Save as preset
                </Button>
                {editable && (
                  <Button variant="outline-warning" size="sm" disabled={bulkBusy} onClick={() => void resetToDefaults()}>
                    ↺ Reset to defaults
                  </Button>
                )}
              </div>
            </div>
            <div
              role="progressbar"
              aria-label="Share of permissions granted"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ height: 4, background: '#e9ecef', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}
            >
              <div style={{ height: '100%', width: `${pct}%`, background: NAVY, transition: 'width 0.3s' }} />
            </div>
          </div>

          {selectedRole && !selectedRole.isActive && (
            <div
              style={{
                background: '#F2F4F7', border: '1px solid #ced4da', borderRadius: '0.5rem',
                padding: '10px 14px', marginBottom: 14, fontSize: '0.82rem',
              }}
            >
              ⏸ <strong>{selectedLabel}</strong> is disabled. Its {plural(selectedRole.userCount, 'user')}{' '}
              cannot sign in and it holds no permissions until it is enabled again. The grants below
              are kept, so enabling it restores exactly this.
            </div>
          )}

          {!editable && !detailLoading && (
            <div
              style={{
                background: '#FEF9E7', border: '1px solid #F2AA20', borderRadius: '0.5rem',
                padding: '10px 14px', marginBottom: 14, fontSize: '0.82rem',
              }}
            >
              🔒 <strong>{selectedLabel}</strong> holds every permission and cannot be changed.
              It is what keeps permission management reachable if another role is misconfigured.
            </div>
          )}

          {detailLoading ? (
            <div className="text-center py-5"><Spinner animation="border" size="sm" /></div>
          ) : (
            grouped.map(([module, perms]) => {
              const on = perms.filter((p) => held.has(p.key)).length;
              return (
                <div key={module} style={{ marginBottom: 20, opacity: bulkBusy ? 0.6 : 1 }}>
                  <div
                    style={{
                      background: NAVY, color: 'white', padding: '8px 16px',
                      borderRadius: '0.375rem 0.375rem 0 0', fontWeight: 700,
                      fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.5px',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                    }}
                  >
                    <span>{module.replace(/_/g, ' ')}</span>
                    <div className="d-flex align-items-center gap-3">
                      {editable && (
                        <>
                          <button
                            type="button"
                            disabled={bulkBusy || on === perms.length}
                            style={headerLink('#A9DFBF', bulkBusy || on === perms.length)}
                            onClick={() => void grantModule(module, perms)}
                          >
                            Grant all
                          </button>
                          <button
                            type="button"
                            disabled={bulkBusy || on === 0}
                            style={headerLink('#F5B7B1', bulkBusy || on === 0)}
                            onClick={() => void revokeModule(module, perms)}
                          >
                            Revoke all
                          </button>
                        </>
                      )}
                      <span style={{ opacity: 0.75, fontSize: '0.72rem' }}>{on} / {perms.length}</span>
                    </div>
                  </div>

                  <div
                    style={{
                      border: '1px solid #e9ecef', borderTop: 'none',
                      borderRadius: '0 0 0.375rem 0.375rem', overflow: 'hidden',
                    }}
                  >
                    {perms.map((perm, i) => {
                      const granted = held.has(perm.key);
                      const busy    = pending.has(perm.key);
                      const locked  = !editable || bulkBusy;
                      return (
                        <div
                          key={perm.key}
                          style={{
                            display: 'flex', alignItems: 'center', padding: '10px 16px',
                            background: i % 2 === 0 ? 'white' : '#F8F9FA',
                            borderBottom: i < perms.length - 1 ? '1px solid #f0f0f0' : 'none',
                          }}
                        >
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
                            disabled={locked || busy}
                            onClick={() => void toggle(perm.key, granted)}
                            style={{
                              width: 44, height: 24, borderRadius: 12, border: 'none', padding: 0,
                              background: granted ? GREEN : '#ced4da',
                              cursor: locked ? 'not-allowed' : 'pointer',
                              position: 'relative', transition: 'background 0.2s',
                              flexShrink: 0, opacity: locked ? 0.6 : busy ? 0.5 : 1,
                            }}
                          >
                            <span
                              style={{
                                position: 'absolute', top: 2, left: granted ? 22 : 2,
                                width: 20, height: 20, borderRadius: '50%', background: 'white',
                                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                              }}
                            />
                          </button>

                          <span
                            style={{
                              marginLeft: 10, width: 34, fontSize: '0.72rem', fontWeight: 600,
                              color: granted ? GREEN : '#adb5bd',
                            }}
                          >
                            {granted ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <ConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />

      <SavePresetModal
        show={showSave}
        roleLabel={selectedLabel}
        keys={[...held].sort()}
        onHide={() => setShowSave(false)}
        onSaved={(preset) => {
          setShowSave(false);
          void queryClient.invalidateQueries({ queryKey: ['permission-presets'] });
          showToast(`Preset “${preset.name}” saved`, 'success');
        }}
      />

      <RoleFormModal
        mode="create"
        show={showCreate}
        onHide={() => setShowCreate(false)}
        onSaved={(name, label) => {
          setShowCreate(false);
          void queryClient.invalidateQueries({ queryKey: ['permission-roles'] });
          void queryClient.invalidateQueries({ queryKey: ['roles'] });
          setSelected(name);
          showToast(`${label} created — it has no permissions yet`, 'success');
        }}
      />

      <RoleFormModal
        mode="edit"
        show={showEdit}
        initial={selectedRole}
        viewerRole={user?.role}
        onHide={() => setShowEdit(false)}
        onSaved={(_name, label) => {
          setShowEdit(false);
          void queryClient.invalidateQueries({ queryKey: ['permission-roles'] });
          void queryClient.invalidateQueries({ queryKey: ['role-permissions', selected] });
          void queryClient.invalidateQueries({ queryKey: ['roles'] });
          showToast(`${label} saved`, 'success');
        }}
      />
    </div>
  );
}
