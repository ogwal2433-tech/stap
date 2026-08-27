import React, { useState, useEffect } from 'react';
import {
  Alert, Badge, Button, Col, Form, Modal, Row, Spinner, Tab, Table, Tabs,
} from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../../context/ToastContext';
import {
  useSystemSettings, useUpdateSettings,
  useUsers, useCreateUser, useUpdateUser, useResetPassword, useDeactivateUser,
  useAllGuardRanks, useDeactivateRank, useActivateRank, useDeleteRank, useReorderRanks,
  useAllDeductionTypes, useDeactivateDeductionType, useActivateDeductionType,
  useDeleteDeductionType, useReorderDeductionTypes,
  useAllShiftTypes, useDeactivateShiftType, useActivateShiftType, useDeleteShiftType, useReorderShiftTypes,
} from '../../hooks/useSettings';
import { ROLES, SALARY_INCREMENT_RULES, type UserRole } from '@stap/shared';
import { useRunSalaryIncrements } from '../../hooks/useGuards';
import type { SystemSettingResponse, UserResponse, GuardRankResponse, DeductionTypeResponse, ShiftTypeResponse } from '@stap/shared';
import { clientsApi } from '../../lib/clients.api';
import { getApiErrorMessage } from '../../lib/api';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import AddRankModal from '../../components/settings/AddRankModal';
import EditRankModal from '../../components/settings/EditRankModal';
import AddDeductionTypeModal from '../../components/settings/AddDeductionTypeModal';
import EditDeductionTypeModal from '../../components/settings/EditDeductionTypeModal';
import AddShiftTypeModal from '../../components/settings/AddShiftTypeModal';
import EditShiftTypeModal from '../../components/settings/EditShiftTypeModal';

// ── Constants ──────────────────────────────────────────────────────────────────

const GROUP_ORDER = ['GENERAL', 'PAYROLL', 'BILLING', 'SECURITY', 'NOTIFICATIONS'];
const GROUP_ICONS: Record<string, string> = {
  GENERAL:       'bi-building',
  PAYROLL:       'bi-cash-coin',
  BILLING:       'bi-receipt',
  SECURITY:      'bi-shield-lock',
  NOTIFICATIONS: 'bi-bell',
};

/**
 * Mirrors StrongPasswordSchema in @stap/shared so the admin sees what's wrong
 * before submitting, instead of a round-trip "Validation failed" toast.
 * Returns null when the password is acceptable.
 */
const PASSWORD_HINT = 'At least 8 characters, with an uppercase letter, a number, and a special character.';

function validatePassword(password: string): string | null {
  const problems: string[] = [];
  if (password.length < 8)          problems.push('be at least 8 characters');
  if (!/[A-Z]/.test(password))      problems.push('contain an uppercase letter');
  if (!/[0-9]/.test(password))      problems.push('contain a number');
  if (!/[^A-Za-z0-9]/.test(password)) problems.push('contain a special character');
  return problems.length ? `Password must ${problems.join(', ')}.` : null;
}

const ROLE_OPTIONS: UserRole[] = [
  ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR,
  ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR, ROLES.TRAINER,
  ROLES.ACCOUNTS_OFFICER, ROLES.MARKETING_HEAD, ROLES.SALES, ROLES.GUARD, ROLES.CLIENT,
];

const STATUS_BADGES: Record<string, string> = {
  ACTIVE:    'success',
  INACTIVE:  'secondary',
  SUSPENDED: 'warning',
};

// ── Setting Field ──────────────────────────────────────────────────────────────

function SettingField({
  setting,
  value,
  onChange,
}: {
  setting: SystemSettingResponse;
  value: string;
  onChange: (key: string, val: string) => void;
}) {
  if (setting.dataType === 'boolean') {
    return (
      <Form.Check
        type="switch"
        id={`setting-${setting.key}`}
        checked={value === 'true'}
        onChange={e => onChange(setting.key, String(e.target.checked))}
        label={value === 'true' ? 'Enabled' : 'Disabled'}
      />
    );
  }
  if (setting.dataType === 'number') {
    return (
      <Form.Control
        size="sm"
        type="number"
        value={value}
        onChange={e => onChange(setting.key, e.target.value)}
        style={{ maxWidth: 160 }}
      />
    );
  }
  return (
    <Form.Control
      size="sm"
      value={value}
      onChange={e => onChange(setting.key, e.target.value)}
    />
  );
}

// ── Create / Edit User Modal ───────────────────────────────────────────────────

function UserModal({
  user,
  onHide,
}: {
  user: UserResponse | 'new' | null;
  onHide: () => void;
}) {
  const { showToast } = useToast();
  const create = useCreateUser();
  const update = useUpdateUser();
  const isNew  = user === 'new';

  const [form, setForm] = useState({
    name: '', email: '', password: '', role: ROLES.GUARD as UserRole,
    status: 'ACTIVE', clientId: '',
  });
  const [clientError, setClientError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ['clients-for-dropdown'],
    queryFn:  () => clientsApi.list({ limit: 200, sortBy: 'clientName', sortOrder: 'asc' }).then(r => r.data),
    enabled:  form.role === ROLES.CLIENT,
  });

  useEffect(() => {
    if (user && user !== 'new') {
      setForm(f => ({
        ...f,
        name:     user.name,
        email:    user.email,
        role:     user.role as UserRole,
        status:   user.status,
        clientId: user.clientId ?? '',
      }));
    } else {
      setForm({ name: '', email: '', password: '', role: ROLES.GUARD, status: 'ACTIVE', clientId: '' });
    }
    setClientError(null);
    setPasswordError(null);
  }, [user]);

  const handleRoleChange = (newRole: UserRole) => {
    setClientError(null);
    setForm(f => ({ ...f, role: newRole, clientId: newRole === ROLES.CLIENT ? f.clientId : '' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (form.role === ROLES.CLIENT && !form.clientId) {
      setClientError('A client company must be selected when creating a Client account.');
      return;
    }
    setClientError(null);

    // Only new users set a password here; catch weak ones before the round-trip
    const pwProblem = isNew ? validatePassword(form.password) : null;
    setPasswordError(pwProblem);
    if (pwProblem) return;

    const clientId = form.role === ROLES.CLIENT ? form.clientId : null;

    if (isNew) {
      create.mutate(
        { name: form.name, email: form.email, password: form.password, role: form.role, clientId },
        {
          onSuccess: () => { showToast('User created', 'success'); onHide(); },
          onError:   (err) => showToast(getApiErrorMessage(err, 'Failed to create user.'), 'danger'),
        },
      );
    } else {
      update.mutate(
        { id: (user as UserResponse).id, data: { name: form.name, role: form.role, status: form.status, clientId } },
        {
          onSuccess: () => { showToast('User updated', 'success'); onHide(); },
          onError:   (err) => showToast(getApiErrorMessage(err, 'Failed to update user.'), 'danger'),
        },
      );
    }
  };

  const isPending = create.isPending || update.isPending;
  const selectedClient = clients.find(c => c.id === form.clientId);

  return (
    <Modal show={!!user} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{isNew ? 'Create User' : 'Edit User'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Full Name *</Form.Label>
            <Form.Control size="sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </Form.Group>
          {isNew && (
            <>
              <Form.Group className="mb-2">
                <Form.Label className="small fw-medium">Email *</Form.Label>
                <Form.Control size="sm" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label className="small fw-medium">Password *</Form.Label>
                <Form.Control
                  size="sm"
                  type="password"
                  value={form.password}
                  onChange={e => { setForm(f => ({ ...f, password: e.target.value })); setPasswordError(null); }}
                  required
                  minLength={8}
                  isInvalid={!!passwordError}
                />
                {passwordError
                  ? <Form.Control.Feedback type="invalid">{passwordError}</Form.Control.Feedback>
                  : <Form.Text className="text-muted" style={{ fontSize: '0.75rem' }}>{PASSWORD_HINT}</Form.Text>}
              </Form.Group>
            </>
          )}
          <Row className="mb-3">
            <Col>
              <Form.Label className="small fw-medium">Role *</Form.Label>
              <Form.Select size="sm" value={form.role} onChange={e => handleRoleChange(e.target.value as UserRole)}>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r === ROLES.CLIENT ? 'Client (Portal Access)' : r.replace(/_/g, ' ')}</option>)}
              </Form.Select>
            </Col>
            {!isNew && (
              <Col>
                <Form.Label className="small fw-medium">Status</Form.Label>
                <Form.Select size="sm" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="INACTIVE">Inactive</option>
                </Form.Select>
              </Col>
            )}
          </Row>

          {form.role === ROLES.CLIENT && (
            <div
              className="mb-3"
              style={{
                padding:      '16px',
                background:   '#FEF9E7',
                borderRadius: '0.5rem',
                border:       '1px solid #F9E79F',
                borderLeft:   '4px solid #E8701A',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1B3A6B', marginBottom: '4px' }}>
                🏢 Link to Client Company
              </div>
              <div style={{ fontSize: '0.78rem', color: '#6c757d', marginBottom: '12px' }}>
                This user will only be able to see data belonging to the selected company.
              </div>

              <Form.Group>
                <Form.Label className="fw-bold small">
                  Client Company <span className="text-danger">*</span>
                </Form.Label>

                {clientsLoading ? (
                  <div className="text-muted small">
                    <Spinner size="sm" className="me-2" />
                    Loading clients...
                  </div>
                ) : (
                  <SearchableSelect
                    options={clients.map(c => ({ value: c.id, label: c.clientName, sublabel: c.systemId ?? '' }))}
                    value={form.clientId}
                    onChange={(id) => { setForm(f => ({ ...f, clientId: id })); setClientError(null); }}
                    placeholder="— Search and select client company —"
                    searchPlaceholder="Type company name..."
                    isInvalid={!!clientError}
                  />
                )}

                {clientError && (
                  <div style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: '4px' }}>
                    {clientError}
                  </div>
                )}

                {selectedClient && (
                  <div
                    style={{
                      background: '#D0EDE9', borderRadius: '0.375rem', padding: '8px 12px',
                      marginTop: '8px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px',
                    }}
                  >
                    <span>🏢</span>
                    <div>
                      <div style={{ fontWeight: 600, color: '#1B3A6B' }}>{selectedClient.clientName}</div>
                      {selectedClient.systemId && (
                        <div style={{ fontSize: '0.72rem', color: '#6c757d', fontFamily: 'monospace' }}>
                          {selectedClient.systemId}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <Form.Text className="text-muted">
                  The user will only be able to log in and view data for this company. They cannot see any other
                  client's information.
                </Form.Text>
              </Form.Group>
            </div>
          )}

          <div className="d-flex justify-content-end gap-2">
            <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? <Spinner size="sm" /> : isNew ? 'Create User' : 'Save Changes'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

// ── Reset Password Modal ───────────────────────────────────────────────────────

function ResetPasswordModal({ userId, onHide }: { userId: string | null; onHide: () => void }) {
  const { showToast } = useToast();
  const reset = useResetPassword();
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    const pwProblem = validatePassword(newPassword);
    setPasswordError(pwProblem);
    if (pwProblem) return;

    reset.mutate(
      { id: userId, newPassword },
      {
        onSuccess: () => { showToast('Password reset successfully', 'success'); onHide(); setNewPassword(''); },
        onError:   (err) => showToast(getApiErrorMessage(err, 'Failed to reset password.'), 'danger'),
      },
    );
  };

  return (
    <Modal show={!!userId} onHide={onHide} centered size="sm">
      <Modal.Header closeButton><Modal.Title>Reset Password</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">New Password *</Form.Label>
            <Form.Control
              size="sm"
              type="password"
              value={newPassword}
              onChange={e => { setNewPassword(e.target.value); setPasswordError(null); }}
              required
              minLength={8}
              isInvalid={!!passwordError}
            />
            {passwordError
              ? <Form.Control.Feedback type="invalid">{passwordError}</Form.Control.Feedback>
              : <Form.Text className="text-muted" style={{ fontSize: '0.75rem' }}>{PASSWORD_HINT}</Form.Text>}
          </Form.Group>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
            <Button type="submit" size="sm" disabled={reset.isPending}>
              {reset.isPending ? <Spinner size="sm" /> : 'Reset Password'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { showToast } = useToast();
  const { data: allSettings, isLoading: loadingSettings } = useSystemSettings();
  const updateSettings = useUpdateSettings();
  const { data: usersData, isLoading: loadingUsers } = useUsers({ page: 1, limit: 100 });
  const deactivate = useDeactivateUser();

  const { data: allRanks = [], isLoading: loadingRanks } = useAllGuardRanks();
  const deactivateRank = useDeactivateRank();
  const activateRank   = useActivateRank();
  const deleteRank     = useDeleteRank();
  const reorderRanks   = useReorderRanks();

  const { data: allDeductionTypes = [], isLoading: loadingDeductionTypes } = useAllDeductionTypes();
  const deactivateDeductionType = useDeactivateDeductionType();
  const activateDeductionType   = useActivateDeductionType();
  const deleteDeductionType     = useDeleteDeductionType();
  const reorderDeductionTypes   = useReorderDeductionTypes();

  const runSalaryIncrements = useRunSalaryIncrements();

  const { data: allShiftTypes = [], isLoading: loadingShiftTypes } = useAllShiftTypes();
  const deactivateShiftType = useDeactivateShiftType();
  const activateShiftType   = useActivateShiftType();
  const deleteShiftType     = useDeleteShiftType();
  const reorderShiftTypes   = useReorderShiftTypes();
  const [showAddShiftType, setShowAddShiftType] = useState(false);
  const [editShiftType, setEditShiftType] = useState<ShiftTypeResponse | null>(null);

  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<{ group: string; message: string } | null>(null);
  const [editUser, setEditUser]   = useState<UserResponse | 'new' | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [showAddRank, setShowAddRank] = useState(false);
  const [editRank, setEditRank] = useState<GuardRankResponse | null>(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState<GuardRankResponse | null>(null);
  const [showAddDeductionType, setShowAddDeductionType] = useState(false);
  const [editDeductionType, setEditDeductionType] = useState<DeductionTypeResponse | null>(null);
  const [deactivateDeductionConfirm, setDeactivateDeductionConfirm] = useState<DeductionTypeResponse | null>(null);

  // Initialize pending changes from loaded settings
  useEffect(() => {
    if (allSettings) {
      const init: Record<string, string> = {};
      allSettings.forEach(s => { init[s.key] = s.value; });
      setPendingChanges(init);
    }
  }, [allSettings]);

  const handleSettingChange = (key: string, value: string) => {
    setPendingChanges(p => ({ ...p, [key]: value }));
  };

  const handleSaveGroup = (group: string) => {
    const groupSettings = (allSettings ?? []).filter(s => s.group === group);
    if (groupSettings.length === 0) {
      showToast('No settings to save', 'info');
      return;
    }

    // Send ALL settings in the group (not just changed ones) to avoid silent no-op
    const settings = groupSettings.map(s => ({
      key:   s.key,
      value: pendingChanges[s.key] ?? s.value,
    }));

    setSaveError(null);
    updateSettings.mutate(settings, {
      onSuccess: () => {
        setSaveError(null);
        showToast(`${group} settings saved`, 'success');
      },
      onError: (err: any) => {
        const message = err?.response?.data?.error
          || err?.response?.data?.message
          || err?.message
          || 'Save failed. Please try again.';
        setSaveError({ group, message });
      },
    });
  };

  const handleDeactivate = (user: UserResponse) => {
    if (!confirm(`Deactivate ${user.name}? They will be logged out immediately.`)) return;
    deactivate.mutate(user.id, {
      onSuccess: () => showToast('User deactivated', 'success'),
      onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
    });
  };

  const settingsByGroup = GROUP_ORDER.reduce<Record<string, SystemSettingResponse[]>>((acc, group) => {
    acc[group] = (allSettings ?? []).filter(s => s.group === group);
    return acc;
  }, {});

  const users = usersData?.data ?? [];

  const handleDeactivateRank = (rank: GuardRankResponse) => {
    deactivateRank.mutate(rank.id, {
      onSuccess: (result) => {
        showToast(`"${rank.name}" deactivated`, 'success');
        setDeactivateConfirm(null);
      },
      onError: (err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'),
    });
  };

  const handleActivateRank = (id: string) => {
    activateRank.mutate(id, {
      onSuccess: () => showToast('Rank activated', 'success'),
      onError:   (err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'),
    });
  };

  const handleDeleteRank = (rank: GuardRankResponse) => {
    if (!confirm(`Permanently delete "${rank.name}"? This cannot be undone.`)) return;
    deleteRank.mutate(rank.id, {
      onSuccess: () => showToast(`"${rank.name}" deleted`, 'success'),
      onError:   (err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'),
    });
  };

  const handleMoveRank = (index: number, direction: 'up' | 'down') => {
    const sorted = [...allRanks].sort((a, b) => a.displayOrder - b.displayOrder);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= sorted.length) return;
    [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
    reorderRanks.mutate(
      sorted.map((r) => r.id),
      { onError: (err: any) => showToast(err?.response?.data?.error ?? 'Reorder failed', 'danger') },
    );
  };

  const handleDeactivateDeductionType = (type: DeductionTypeResponse) => {
    deactivateDeductionType.mutate(type.id, {
      onSuccess: () => {
        showToast(`"${type.name}" deactivated`, 'success');
        setDeactivateDeductionConfirm(null);
      },
      onError: (err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'),
    });
  };

  const handleActivateDeductionType = (id: string) => {
    activateDeductionType.mutate(id, {
      onSuccess: () => showToast('Deduction type activated', 'success'),
      onError:   (err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'),
    });
  };

  const handleDeleteDeductionType = (type: DeductionTypeResponse) => {
    if (!confirm(`Permanently delete "${type.name}"? This cannot be undone.`)) return;
    deleteDeductionType.mutate(type.id, {
      onSuccess: () => showToast(`"${type.name}" deleted`, 'success'),
      onError:   (err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'),
    });
  };

  const handleMoveDeductionType = (index: number, direction: 'up' | 'down') => {
    const sorted = [...allDeductionTypes].sort((a, b) => a.displayOrder - b.displayOrder);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= sorted.length) return;
    [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
    reorderDeductionTypes.mutate(
      sorted.map((t) => t.id),
      { onError: (err: any) => showToast(err?.response?.data?.error ?? 'Reorder failed', 'danger') },
    );
  };

  const handleMoveShiftType = (index: number, direction: 'up' | 'down') => {
    const sorted = [...allShiftTypes].sort((a, b) => a.displayOrder - b.displayOrder);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= sorted.length) return;
    [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
    reorderShiftTypes.mutate(
      sorted.map((t) => t.id),
      { onError: (err: any) => showToast(err?.response?.data?.error ?? 'Reorder failed', 'danger') },
    );
  };

  const handleDeleteShiftType = (shift: ShiftTypeResponse) => {
    if (!confirm(`Delete "${shift.name}"? This cannot be undone.`)) return;
    deleteShiftType.mutate(shift.id, {
      onSuccess: () => showToast('Shift type deleted', 'success'),
      onError: (err: any) => showToast(err?.response?.data?.error ?? 'Delete failed', 'danger'),
    });
  };

  return (
    <div className="container-fluid py-4">
      <div className="mb-4">
        <h4 className="fw-bold mb-0">Settings</h4>
        <p className="text-muted small mb-0">System configuration and user management</p>
      </div>

      <Tabs defaultActiveKey="general" className="mb-3">
        {/* ── System Settings Tabs ─────────────────────────────────────────────── */}
        {GROUP_ORDER.map(group => (
          <Tab
            key={group}
            eventKey={group.toLowerCase()}
            title={<><i className={`bi ${GROUP_ICONS[group]} me-1`} />{group.charAt(0) + group.slice(1).toLowerCase()}</>}
          >
            {loadingSettings ? (
              <div className="text-center py-5"><Spinner /></div>
            ) : (
              <div className="card border-0 shadow-sm">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h6 className="fw-semibold mb-0">{group.charAt(0) + group.slice(1).toLowerCase()} Settings</h6>
                    <Button
                      size="sm"
                      onClick={() => handleSaveGroup(group)}
                      disabled={updateSettings.isPending}
                    >
                      {updateSettings.isPending ? <Spinner size="sm" /> : 'Save Changes'}
                    </Button>
                  </div>
                  {saveError?.group === group && (
                    <Alert
                      variant="danger"
                      className="small py-2"
                      dismissible
                      onClose={() => setSaveError(null)}
                    >
                      <strong>Error:</strong> {saveError.message}
                    </Alert>
                  )}
                  {settingsByGroup[group]?.length === 0 ? (
                    <Alert variant="info" className="small">No settings in this group.</Alert>
                  ) : (
                    settingsByGroup[group]?.map(s => (
                      <Row key={s.key} className="mb-3 align-items-center">
                        <Col md={4}>
                          <Form.Label className="small fw-medium mb-0">{s.label}</Form.Label>
                          <div className="text-muted" style={{ fontSize: 11 }}>{s.key}</div>
                        </Col>
                        <Col md={8}>
                          <SettingField
                            setting={s}
                            value={pendingChanges[s.key] ?? s.value}
                            onChange={handleSettingChange}
                          />
                        </Col>
                      </Row>
                    ))
                  )}
                  {/* Site type definitions card — only in GENERAL tab */}
                  {group === 'GENERAL' && (
                    <div className="card mb-0 mt-4 border-0 bg-light">
                      <div className="card-header fw-bold border-0" style={{ color: '#1B3A6B', background: 'transparent' }}>
                        Site Type Definitions
                      </div>
                      <div className="card-body pt-0">
                        <dl className="mb-0 small">
                          <dt>Temporary</dt>
                          <dd className="text-muted mb-2">Short-term assignment. Guards deployed for a defined period only.</dd>
                          <dt>Special Duties</dt>
                          <dd className="text-muted mb-2">Events, VIP protection, or non-standard assignments requiring a briefing.</dd>
                          <dt>Permanent</dt>
                          <dd className="text-muted mb-0">Long-term contracted site with continuous guard deployment.</dd>
                        </dl>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Tab>
        ))}

        {/* ── Guard Ranks ──────────────────────────────────────────────────────── */}
        <Tab eventKey="ranks" title={<><i className="bi bi-award me-1" />Ranks</>}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-semibold mb-0">Guard Ranks</h6>
            <Button size="sm" onClick={() => setShowAddRank(true)}>
              <i className="bi bi-plus-lg me-1" />Add Rank
            </Button>
          </div>

          <Alert variant="info" className="small py-2 px-3 mb-3">
            Ranks appear in the guard profile form dropdown in the order shown below. Use ▲ ▼ to
            reorder. Deactivating a rank hides it from the form but keeps it on existing guard
            records.
          </Alert>

          {loadingRanks ? (
            <div className="text-center py-5"><Spinner /></div>
          ) : allRanks.length === 0 ? (
            <Alert variant="secondary">
              No ranks configured. Click <strong>Add Rank</strong> to create the first rank.
            </Alert>
          ) : (
            <div className="card border-0 shadow-sm">
              <ul className="list-group list-group-flush">
                {[...allRanks]
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((rank, idx, arr) => (
                    <li
                      key={rank.id}
                      className="list-group-item d-flex align-items-center gap-2 py-2"
                    >
                      {/* Order controls */}
                      <div className="d-flex flex-column" style={{ gap: 0 }}>
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 lh-1 text-muted"
                          disabled={idx === 0}
                          onClick={() => handleMoveRank(idx, 'up')}
                          title="Move up"
                        >
                          ▲
                        </Button>
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 lh-1 text-muted"
                          disabled={idx === arr.length - 1}
                          onClick={() => handleMoveRank(idx, 'down')}
                          title="Move down"
                        >
                          ▼
                        </Button>
                      </div>

                      {/* Order badge */}
                      <Badge bg="light" text="dark" className="small">#{rank.displayOrder}</Badge>

                      {/* Name */}
                      <span
                        className={`flex-grow-1 ${rank.isActive ? 'fw-medium' : 'text-muted text-decoration-line-through'}`}
                      >
                        {rank.name}
                        {!rank.isActive && (
                          <span className="ms-2 badge bg-secondary" style={{ fontSize: 10 }}>
                            inactive
                          </span>
                        )}
                      </span>

                      {/* Salary */}
                      <span className="small text-muted me-1" style={{ minWidth: 120, textAlign: 'right' }}>
                        {rank.defaultSalary != null
                          ? `UGX ${rank.defaultSalary.toLocaleString()}`
                          : <span className="fst-italic">No salary set</span>}
                      </span>

                      {/* Actions */}
                      <div className="d-flex gap-1">
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          style={{ fontSize: 11, padding: '1px 6px' }}
                          onClick={() => setEditRank(rank)}
                          title="Edit rank"
                        >
                          <i className="bi bi-pencil" />
                        </Button>
                        {rank.isActive ? (
                          <Button
                            size="sm"
                            variant="outline-warning"
                            style={{ fontSize: 11, padding: '1px 6px' }}
                            onClick={() => setDeactivateConfirm(rank)}
                            title="Deactivate rank"
                          >
                            <i className="bi bi-eye-slash" />
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline-success"
                            style={{ fontSize: 11, padding: '1px 6px' }}
                            onClick={() => handleActivateRank(rank.id)}
                            title="Activate rank"
                          >
                            <i className="bi bi-eye" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline-danger"
                          style={{ fontSize: 11, padding: '1px 6px' }}
                          onClick={() => handleDeleteRank(rank)}
                          title="Delete rank"
                        >
                          <i className="bi bi-trash" />
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Tab>

        {/* ── Deduction Types ───────────────────────────────────────────────────── */}
        <Tab eventKey="deduction-types" title={<><i className="bi bi-dash-circle me-1" />Deduction Types</>}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-semibold mb-0">Deduction Types</h6>
            <Button size="sm" onClick={() => setShowAddDeductionType(true)}>
              <i className="bi bi-plus-lg me-1" />Add Type
            </Button>
          </div>
          <Alert variant="info" className="small py-2">
            Deduction types appear in the deduction form dropdown when adding a charge to a guard's payroll.
            Types marked as <strong>SYSTEM</strong> are managed automatically and cannot be deleted.
            Setting a Default Amount pre-fills the form when that type is selected.
          </Alert>
          {loadingDeductionTypes ? (
            <Spinner size="sm" />
          ) : allDeductionTypes.length === 0 ? (
            <Alert variant="light" className="small">No deduction types configured.</Alert>
          ) : (
            <div className="border rounded">
              <ul className="list-unstyled mb-0">
                {[...allDeductionTypes]
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((dt, idx, arr) => (
                    <li
                      key={dt.id}
                      className="d-flex align-items-start gap-2 px-3 py-2 border-bottom"
                    >
                      <div className="d-flex flex-column" style={{ gap: 1 }}>
                        <Button
                          size="sm" variant="link" className="p-0 text-muted"
                          style={{ fontSize: 11, lineHeight: 1 }}
                          disabled={idx === 0}
                          onClick={() => handleMoveDeductionType(idx, 'up')}
                          title="Move up"
                        >▲</Button>
                        <Button
                          size="sm" variant="link" className="p-0 text-muted"
                          style={{ fontSize: 11, lineHeight: 1 }}
                          disabled={idx === arr.length - 1}
                          onClick={() => handleMoveDeductionType(idx, 'down')}
                          title="Move down"
                        >▼</Button>
                      </div>
                      <div className="flex-grow-1 small">
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className={`fw-medium ${!dt.isActive ? 'text-muted text-decoration-line-through' : ''}`}>
                            {dt.name}
                          </span>
                          <Badge bg="light" text="dark" className="font-monospace" style={{ fontSize: '0.6rem' }}>
                            {dt.code}
                          </Badge>
                          {dt.isAutomatic && (
                            <Badge bg="secondary" style={{ fontSize: '0.6rem' }}>SYSTEM</Badge>
                          )}
                          {!dt.isActive && (
                            <span className="text-danger" style={{ fontSize: '0.7rem' }}>(inactive)</span>
                          )}
                        </div>
                        <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                          {dt.defaultAmount != null ? (
                            <span className="text-teal me-2" style={{ color: '#198754' }}>
                              UGX {dt.defaultAmount.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-muted me-2">— (enter manually)</span>
                          )}
                          {dt.description && (
                            <span>
                              {dt.description.length > 60 ? dt.description.slice(0, 60) + '…' : dt.description}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="d-flex gap-1">
                        {!dt.isAutomatic && (
                          <Button
                            size="sm" variant="outline-secondary"
                            style={{ fontSize: 11, padding: '1px 6px' }}
                            onClick={() => setEditDeductionType(dt)}
                            title="Edit type"
                          >
                            <i className="bi bi-pencil" />
                          </Button>
                        )}
                        {!dt.isAutomatic && dt.isActive && (
                          <Button
                            size="sm" variant="outline-warning"
                            style={{ fontSize: 11, padding: '1px 6px' }}
                            onClick={() => setDeactivateDeductionConfirm(dt)}
                            title="Deactivate type"
                          >
                            <i className="bi bi-eye-slash" />
                          </Button>
                        )}
                        {!dt.isAutomatic && !dt.isActive && (
                          <Button
                            size="sm" variant="outline-success"
                            style={{ fontSize: 11, padding: '1px 6px' }}
                            onClick={() => handleActivateDeductionType(dt.id)}
                            title="Activate type"
                          >
                            <i className="bi bi-eye" />
                          </Button>
                        )}
                        {!dt.isAutomatic && (
                          <Button
                            size="sm" variant="outline-danger"
                            style={{ fontSize: 11, padding: '1px 6px' }}
                            onClick={() => handleDeleteDeductionType(dt)}
                            title="Delete type"
                          >
                            <i className="bi bi-trash" />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </Tab>

        {/* ── Shift Types ───────────────────────────────────────────────────────── */}
        <Tab eventKey="shift-types" title={<><i className="bi bi-clock me-1" />Shift Types</>}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-semibold mb-0">Shift Types</h6>
            <Button size="sm" onClick={() => setShowAddShiftType(true)}>
              <i className="bi bi-plus-lg me-1" />Add Shift Type
            </Button>
          </div>
          <Alert variant="info" className="small py-2">
            Shift types appear in the roster builder. Setting a start and end time will auto-fill
            the time fields when that shift is selected. Overtime shifts allow recording extra hours per guard.
          </Alert>
          {loadingShiftTypes ? (
            <Spinner size="sm" />
          ) : allShiftTypes.length === 0 ? (
            <Alert variant="light" className="small">No shift types configured.</Alert>
          ) : (
            <div className="border rounded">
              <ul className="list-unstyled mb-0">
                {[...allShiftTypes]
                  .sort((a, b) => a.displayOrder - b.displayOrder)
                  .map((shift, idx, arr) => (
                    <li
                      key={shift.id}
                      className="d-flex align-items-start gap-2 px-3 py-2 border-bottom"
                    >
                      <div className="d-flex flex-column" style={{ gap: 1 }}>
                        <Button
                          size="sm" variant="link" className="p-0 text-muted"
                          style={{ fontSize: 11, lineHeight: 1 }}
                          disabled={idx === 0}
                          onClick={() => handleMoveShiftType(idx, 'up')}
                          title="Move up"
                        >▲</Button>
                        <Button
                          size="sm" variant="link" className="p-0 text-muted"
                          style={{ fontSize: 11, lineHeight: 1 }}
                          disabled={idx === arr.length - 1}
                          onClick={() => handleMoveShiftType(idx, 'down')}
                          title="Move down"
                        >▼</Button>
                      </div>
                      <div className="flex-grow-1 small">
                        <div className="d-flex align-items-center gap-2 flex-wrap">
                          <span className={`fw-medium ${!shift.isActive ? 'text-muted text-decoration-line-through' : ''}`}>
                            {shift.name}
                          </span>
                          <Badge bg="light" text="dark" className="font-monospace" style={{ fontSize: '0.6rem' }}>
                            {shift.code}
                          </Badge>
                          {shift.isOvertime && (
                            <Badge bg="warning" text="dark" style={{ fontSize: '0.6rem' }}>OVERTIME</Badge>
                          )}
                          {!shift.isActive && (
                            <span className="text-danger" style={{ fontSize: '0.7rem' }}>(inactive)</span>
                          )}
                        </div>
                        <div className="text-muted mt-1" style={{ fontSize: '0.75rem' }}>
                          {shift.startTime && shift.endTime
                            ? <span className="me-2">{shift.startTime} → {shift.endTime}</span>
                            : <span className="me-2 text-muted">No default times</span>}
                          {shift.durationHours != null && (
                            <span className="me-2">{shift.durationHours} hrs</span>
                          )}
                        </div>
                      </div>
                      <div className="d-flex gap-1">
                        <Button
                          size="sm" variant="outline-secondary"
                          style={{ fontSize: 11, padding: '1px 6px' }}
                          onClick={() => setEditShiftType(shift)}
                          title="Edit shift type"
                        >
                          <i className="bi bi-pencil" />
                        </Button>
                        {shift.isActive ? (
                          <Button
                            size="sm" variant="outline-warning"
                            style={{ fontSize: 11, padding: '1px 6px' }}
                            onClick={() => deactivateShiftType.mutate(shift.id, {
                              onSuccess: () => showToast('Shift type deactivated', 'success'),
                              onError: (err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'),
                            })}
                            title="Deactivate shift type"
                          >
                            <i className="bi bi-eye-slash" />
                          </Button>
                        ) : (
                          <Button
                            size="sm" variant="outline-success"
                            style={{ fontSize: 11, padding: '1px 6px' }}
                            onClick={() => activateShiftType.mutate(shift.id, {
                              onSuccess: () => showToast('Shift type activated', 'success'),
                              onError: (err: any) => showToast(err?.response?.data?.error ?? 'Failed', 'danger'),
                            })}
                            title="Activate shift type"
                          >
                            <i className="bi bi-eye" />
                          </Button>
                        )}
                        <Button
                          size="sm" variant="outline-danger"
                          style={{ fontSize: 11, padding: '1px 6px' }}
                          onClick={() => handleDeleteShiftType(shift)}
                          title="Delete shift type"
                        >
                          <i className="bi bi-trash" />
                        </Button>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* Modals */}
          <AddShiftTypeModal
            show={showAddShiftType}
            nextOrder={(allShiftTypes.length || 0) + 1}
            onClose={() => setShowAddShiftType(false)}
          />
          <EditShiftTypeModal
            shift={editShiftType}
            onClose={() => setEditShiftType(null)}
          />
        </Tab>

        {/* ── Payroll ───────────────────────────────────────────────────────────── */}
        <Tab eventKey="payroll" title={<><i className="bi bi-cash-coin me-1" />Payroll</>}>
          <h6 className="fw-semibold mb-3">Salary Increments</h6>
          <Alert variant="info" className="small py-2 mb-3">
            Annual increments are applied automatically each morning at 07:00 EAT. Permanent guards
            receive <strong>UGX {SALARY_INCREMENT_RULES.firstYearIncrement.toLocaleString()}</strong> on their
            one-year anniversary, then <strong>UGX {SALARY_INCREMENT_RULES.subsequentYearIncrement.toLocaleString()}</strong> each
            subsequent year. Use the button below to trigger a manual check outside the schedule.
          </Alert>
          <div className="border rounded p-3 d-flex align-items-center justify-content-between">
            <div>
              <div className="fw-medium">Run Increment Check Now</div>
              <div className="text-muted small">
                Applies any pending increments for eligible permanent guards immediately.
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={runSalaryIncrements.isPending}
              onClick={() => runSalaryIncrements.mutate()}
            >
              {runSalaryIncrements.isPending ? (
                <><Spinner size="sm" className="me-1" />Running…</>
              ) : (
                <><i className="bi bi-play-fill me-1" />Run Now</>
              )}
            </Button>
          </div>
        </Tab>

        {/* ── User Management ──────────────────────────────────────────────────── */}
        <Tab eventKey="users" title={<><i className="bi bi-people me-1" />Users</>}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-semibold mb-0">User Management</h6>
            <Button size="sm" onClick={() => setEditUser('new')}>
              <i className="bi bi-plus-lg me-1" />Create User
            </Button>
          </div>

          {loadingUsers ? (
            <div className="text-center py-5"><Spinner /></div>
          ) : users.length === 0 ? (
            <Alert variant="info">No users found.</Alert>
          ) : (
            <Table hover size="sm" responsive>
              <thead className="table-light">
                <tr>
                  <th>Staff ID</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.82rem', color: '#1B3A6B', fontWeight: 600 }}>
                      {u.systemId ?? '—'}
                    </td>
                    <td className="fw-medium">{u.name}</td>
                    <td className="small text-muted">{u.email}</td>
                    <td>
                      <Badge bg="dark" style={{ fontSize: 10 }}>{u.role.replace(/_/g, ' ')}</Badge>
                      {u.role === 'CLIENT' && (
                        <div style={{ fontSize: '0.72rem', color: '#0F7B6C', marginTop: '2px', fontStyle: 'italic' }}>
                          🏢 {u.clientName ?? 'No company linked'}
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge bg={STATUS_BADGES[u.status] ?? 'secondary'} text={u.status === 'SUSPENDED' ? 'dark' : undefined} style={{ fontSize: 10 }}>
                        {u.status}
                      </Badge>
                    </td>
                    <td className="small text-muted">
                      {new Date(u.createdAt).toLocaleDateString('en-UG')}
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          style={{ fontSize: 11, padding: '1px 6px' }}
                          onClick={() => setEditUser(u)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-warning"
                          style={{ fontSize: 11, padding: '1px 6px' }}
                          onClick={() => setResetUserId(u.id)}
                        >
                          Reset PW
                        </Button>
                        {u.status === 'ACTIVE' && (
                          <Button
                            size="sm"
                            variant="outline-danger"
                            style={{ fontSize: 11, padding: '1px 6px' }}
                            onClick={() => handleDeactivate(u)}
                          >
                            Deactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Tab>
      </Tabs>

      {/* Modals */}
      <UserModal user={editUser} onHide={() => setEditUser(null)} />
      <ResetPasswordModal userId={resetUserId} onHide={() => setResetUserId(null)} />
      <AddRankModal show={showAddRank} onHide={() => setShowAddRank(false)} />
      <EditRankModal show={!!editRank} onHide={() => setEditRank(null)} rank={editRank} />
      <AddDeductionTypeModal show={showAddDeductionType} onHide={() => setShowAddDeductionType(false)} />
      <EditDeductionTypeModal show={!!editDeductionType} onHide={() => setEditDeductionType(null)} type={editDeductionType} />

      {/* Deactivate Rank confirmation */}
      <Modal show={!!deactivateConfirm} onHide={() => setDeactivateConfirm(null)} centered size="sm">
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Deactivate Rank</Modal.Title>
        </Modal.Header>
        <Modal.Body className="small">
          {deactivateConfirm && (
            <>
              This will hide <strong>"{deactivateConfirm.name}"</strong> from the guard form
              dropdown. Existing guard records will not be affected.
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setDeactivateConfirm(null)}>
            Cancel
          </Button>
          <Button
            variant="warning"
            size="sm"
            disabled={deactivateRank.isPending}
            onClick={() => deactivateConfirm && handleDeactivateRank(deactivateConfirm)}
          >
            {deactivateRank.isPending ? <Spinner size="sm" /> : 'Deactivate'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Deactivate Deduction Type confirmation */}
      <Modal show={!!deactivateDeductionConfirm} onHide={() => setDeactivateDeductionConfirm(null)} centered size="sm">
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Deactivate Deduction Type</Modal.Title>
        </Modal.Header>
        <Modal.Body className="small">
          {deactivateDeductionConfirm && (
            <>
              This will hide <strong>"{deactivateDeductionConfirm.name}"</strong> from the deduction
              form. It can be re-activated at any time.
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setDeactivateDeductionConfirm(null)}>
            Cancel
          </Button>
          <Button
            variant="warning"
            size="sm"
            disabled={deactivateDeductionType.isPending}
            onClick={() => deactivateDeductionConfirm && handleDeactivateDeductionType(deactivateDeductionConfirm)}
          >
            {deactivateDeductionType.isPending ? <Spinner size="sm" /> : 'Deactivate'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
