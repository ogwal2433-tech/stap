import React, { useState, useEffect } from 'react';
import {
  Alert, Badge, Button, Col, Form, Modal, Row, Spinner, Tab, Table, Tabs,
} from 'react-bootstrap';
import { useToast } from '../../context/ToastContext';
import {
  useSystemSettings, useUpdateSettings,
  useUsers, useCreateUser, useUpdateUser, useResetPassword, useDeactivateUser,
  useAllGuardRanks, useDeactivateRank, useActivateRank, useDeleteRank, useReorderRanks,
} from '../../hooks/useSettings';
import { ROLES, type UserRole } from '@stap/shared';
import type { SystemSettingResponse, UserResponse, GuardRankResponse } from '@stap/shared';
import AddRankModal from '../../components/settings/AddRankModal';
import EditRankModal from '../../components/settings/EditRankModal';

// ── Constants ──────────────────────────────────────────────────────────────────

const GROUP_ORDER = ['GENERAL', 'PAYROLL', 'BILLING', 'SECURITY', 'NOTIFICATIONS'];
const GROUP_ICONS: Record<string, string> = {
  GENERAL:       'bi-building',
  PAYROLL:       'bi-cash-coin',
  BILLING:       'bi-receipt',
  SECURITY:      'bi-shield-lock',
  NOTIFICATIONS: 'bi-bell',
};

const ROLE_OPTIONS: UserRole[] = [
  ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR,
  ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR, ROLES.TRAINER,
  ROLES.ACCOUNTS_OFFICER, ROLES.MARKETING, ROLES.GUARD, ROLES.CLIENT,
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
    status: 'ACTIVE',
  });

  useEffect(() => {
    if (user && user !== 'new') {
      setForm(f => ({
        ...f,
        name:   user.name,
        email:  user.email,
        role:   user.role as UserRole,
        status: user.status,
      }));
    } else {
      setForm({ name: '', email: '', password: '', role: ROLES.GUARD, status: 'ACTIVE' });
    }
  }, [user]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNew) {
      create.mutate(
        { name: form.name, email: form.email, password: form.password, role: form.role },
        {
          onSuccess: () => { showToast('User created', 'success'); onHide(); },
          onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
        },
      );
    } else {
      update.mutate(
        { id: (user as UserResponse).id, data: { name: form.name, role: form.role, status: form.status } },
        {
          onSuccess: () => { showToast('User updated', 'success'); onHide(); },
          onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
        },
      );
    }
  };

  const isPending = create.isPending || update.isPending;

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
                <Form.Control size="sm" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
              </Form.Group>
            </>
          )}
          <Row className="mb-3">
            <Col>
              <Form.Label className="small fw-medium">Role *</Form.Label>
              <Form.Select size="sm" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    reset.mutate(
      { id: userId, newPassword },
      {
        onSuccess: () => { showToast('Password reset successfully', 'success'); onHide(); setNewPassword(''); },
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
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
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
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

  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<{ group: string; message: string } | null>(null);
  const [editUser, setEditUser]   = useState<UserResponse | 'new' | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [showAddRank, setShowAddRank] = useState(false);
  const [editRank, setEditRank] = useState<GuardRankResponse | null>(null);
  const [deactivateConfirm, setDeactivateConfirm] = useState<GuardRankResponse | null>(null);

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
                    <td className="fw-medium">{u.name}</td>
                    <td className="small text-muted">{u.email}</td>
                    <td>
                      <Badge bg="dark" style={{ fontSize: 10 }}>{u.role.replace(/_/g, ' ')}</Badge>
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
    </div>
  );
}
