import React, { useState, useEffect } from 'react';
import {
  Alert, Badge, Button, Col, Form, Modal, Row, Spinner, Tab, Table, Tabs,
} from 'react-bootstrap';
import { useToast } from '../../context/ToastContext';
import {
  useSystemSettings, useUpdateSettings,
  useUsers, useCreateUser, useUpdateUser, useResetPassword, useDeactivateUser,
} from '../../hooks/useSettings';
import { ROLES, type UserRole } from '@stap/shared';
import type { SystemSettingResponse, UserResponse } from '@stap/shared';

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

  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>({});
  const [editUser, setEditUser]   = useState<UserResponse | 'new' | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);

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
    const changed = groupSettings
      .filter(s => pendingChanges[s.key] !== undefined && pendingChanges[s.key] !== s.value)
      .map(s => ({ key: s.key, value: pendingChanges[s.key] }));

    if (changed.length === 0) {
      showToast('No changes to save', 'info');
      return;
    }

    updateSettings.mutate(changed, {
      onSuccess: () => showToast(`${group} settings saved`, 'success'),
      onError:   (err: any) => showToast(err?.response?.data?.error || 'Save failed', 'danger'),
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
    </div>
  );
}
