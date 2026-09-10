import { useEffect, useState } from 'react';
import { Badge, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { ROLE_CONFIG, ROLES, type StaffRole , JOB_TITLES, JOB_TITLE_CATEGORIES, getJobTitleLabel, isLegacyJobTitle } from '@stap/shared';
import {
  useStaffMember,
  useUpdateStaff,
  useDeactivateStaff,
  useReactivateStaff,
  useResetStaffPassword,
} from '../../hooks/useStaff';
import { useRoles } from '../../hooks/useRoles';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';
import { formatRelativeDate, formatDateTime } from '../../lib/dateUtils';
import InitialsAvatar from '../ui/InitialsAvatar';

interface StaffProfileModalProps {
  staffId:   string;
  show:      boolean;
  onClose:   () => void;
  onUpdate?: () => void;
}

/** Only these two may turn an account off, reset its password, or restore it. */
const ACCOUNT_CONTROL_ROLES: string[] = [ROLES.DIRECTOR, ROLES.ADMINISTRATOR];

const SECTION_TITLE: React.CSSProperties = {
  fontSize:      '0.72rem',
  fontWeight:    700,
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
  color:         '#6c757d',
  marginBottom:  '8px',
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '0.7rem', color: '#6c757d', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '0.85rem', color: value ? '#1A1A1A' : '#adb5bd' }}>{value || '—'}</div>
    </div>
  );
}

export default function StaffProfileModal({ staffId, show, onClose, onUpdate }: StaffProfileModalProps) {
  const { data: staff, isLoading, error } = useStaffMember(show ? staffId : null);
  // From the Role table, so custom roles are offered and disabled ones are not.
  const { data: assignableRoles = [] } = useRoles(true);
  const { user }      = useAuth();
  const { showToast } = useToast();

  const update      = useUpdateStaff();
  const deactivate  = useDeactivateStaff();
  const reactivate  = useReactivateStaff();
  const resetPass   = useResetStaffPassword();

  const [editing, setEditing]               = useState(false);
  const [formError, setFormError]           = useState<string | null>(null);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [reason, setReason]                 = useState('');
  const [form, setForm] = useState({
    name: '', phone: '', department: '', jobTitle: '',
    role: '' as StaffRole | '', emergencyContact: '', emergencyPhone: '',
  });

  // Refill the edit form whenever the fetched record changes, so an inline edit
  // always starts from what the server last confirmed rather than stale input.
  useEffect(() => {
    if (!staff) return;
    setForm({
      name:             staff.name,
      phone:            staff.phone ?? '',
      department:       staff.department ?? '',
      jobTitle:         staff.jobTitle ?? '',
      role:             staff.role,
      emergencyContact: staff.emergencyContact ?? '',
      emergencyPhone:   staff.emergencyPhone ?? '',
    });
  }, [staff]);

  const canControlAccount = ACCOUNT_CONTROL_ROLES.includes(user?.role ?? '');
  const isSelf            = user?.id === staffId;
  const busy = update.isPending || deactivate.isPending || reactivate.isPending || resetPass.isPending;

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const handleClose = () => {
    setEditing(false);
    setShowDeactivate(false);
    setReason('');
    setFormError(null);
    onClose();
  };

  const handleSave = () => {
    setFormError(null);
    if (form.name.trim().length < 2) {
      setFormError('A name of at least two characters is required.');
      return;
    }
    update.mutate(
      {
        id: staffId,
        data: {
          name:             form.name.trim(),
          phone:            form.phone.trim()            || null,
          department:       form.department.trim()       || null,
          jobTitle:         (form.jobTitle.trim() || null) as never,
          emergencyContact: form.emergencyContact.trim() || null,
          emergencyPhone:   form.emergencyPhone.trim()   || null,
          // The server refuses a self role change; don't even send one.
          ...(form.role && form.role !== staff?.role && !isSelf ? { role: form.role } : {}),
        },
      },
      {
        onSuccess: () => {
          showToast('Staff details updated.', 'success');
          setEditing(false);
          onUpdate?.();
        },
        onError: (err) => setFormError(getApiErrorMessage(err, 'Failed to save the changes.')),
      },
    );
  };

  const handleDeactivate = () => {
    setFormError(null);
    if (reason.trim().length < 5) {
      setFormError('Give a reason of at least five characters — it is kept on the audit trail.');
      return;
    }
    deactivate.mutate(
      { id: staffId, reason: reason.trim() },
      {
        onSuccess: () => {
          showToast(`${staff?.name}’s account has been deactivated.`, 'success');
          setShowDeactivate(false);
          setReason('');
          onUpdate?.();
        },
        onError: (err) => setFormError(getApiErrorMessage(err, 'Failed to deactivate the account.')),
      },
    );
  };

  const handleReactivate = () => {
    reactivate.mutate(staffId, {
      onSuccess: () => {
        showToast(`${staff?.name}’s account is active again.`, 'success');
        onUpdate?.();
      },
      onError: (err) => showToast(getApiErrorMessage(err, 'Failed to reactivate the account.'), 'danger'),
    });
  };

  const handleResetPassword = () => {
    if (!window.confirm(
      `Reset ${staff?.name}'s password?\n\nA new password will be emailed to them and they will be signed out everywhere.`,
    )) return;

    resetPass.mutate(staffId, {
      onSuccess: () => showToast('A new password has been emailed to them.', 'success'),
      onError:   (err) => showToast(getApiErrorMessage(err, 'Failed to reset the password.'), 'danger'),
    });
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1B3A6B' }}>
          Staff Profile
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {isLoading ? (
          <div className="d-flex justify-content-center py-5">
            <Spinner animation="border" variant="primary" />
          </div>
        ) : error || !staff ? (
          <div className="text-center text-muted py-4" style={{ fontSize: '0.85rem' }}>
            {getApiErrorMessage(error, 'This staff member could not be loaded.')}
          </div>
        ) : (
          <>
            {/* ── Profile header ─────────────────────────────────────────── */}
            <div
              style={{
                display:      'flex',
                gap:          '16px',
                alignItems:   'center',
                background:   staff.isActive ? '#F2F4F7' : '#FEF9E7',
                borderRadius: '0.5rem',
                padding:      '16px',
                marginBottom: '20px',
              }}
            >
              <InitialsAvatar name={staff.name} size={64} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1B3A6B' }}>{staff.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#4A5568', marginBottom: '6px' }}>{staff.email}</div>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <span
                    style={{
                      display:      'inline-flex',
                      alignItems:   'center',
                      gap:          '4px',
                      background:   staff.roleConfig?.colour ?? '#6c757d',
                      color:        'white',
                      borderRadius: '0.375rem',
                      padding:      '2px 8px',
                      fontSize:     '0.72rem',
                      fontWeight:   600,
                    }}
                  >
                    {staff.roleConfig?.icon} {staff.roleConfig?.label ?? staff.role.replace(/_/g, ' ')}
                  </span>
                  <Badge bg={staff.isActive ? 'success' : 'secondary'} style={{ fontSize: '0.68rem' }}>
                    {staff.isActive ? '● Active' : '● Inactive'}
                  </Badge>
                  {staff.systemId && (
                    <span style={{ fontSize: '0.7rem', color: '#6c757d' }}>{staff.systemId}</span>
                  )}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#6c757d', marginTop: '6px' }}>
                  Last login: {formatRelativeDate(staff.lastLoginAt)} · Joined{' '}
                  {new Date(staff.createdAt).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </div>
              </div>
            </div>

            {!staff.isActive && staff.deactivationReason && (
              <div
                style={{
                  background:   '#FEF9E7',
                  border:       '1px solid #F5D76E',
                  borderRadius: '0.375rem',
                  padding:      '10px 12px',
                  marginBottom: '20px',
                  fontSize:     '0.8rem',
                  color:        '#7D6608',
                }}
              >
                <strong>Deactivated {formatRelativeDate(staff.deactivatedAt)}</strong>
                <div>{staff.deactivationReason}</div>
              </div>
            )}

            {formError && (
              <div
                style={{
                  background:   '#FDECEA',
                  border:       '1px solid #F5C6CB',
                  borderRadius: '0.375rem',
                  padding:      '8px 12px',
                  marginBottom: '14px',
                  fontSize:     '0.82rem',
                  color:        '#C0392B',
                }}
              >
                {formError}
              </div>
            )}

            {/* ── Details ────────────────────────────────────────────────── */}
            <div className="d-flex justify-content-between align-items-center" style={{ marginBottom: '8px' }}>
              <div style={{ ...SECTION_TITLE, marginBottom: 0 }}>Details</div>
              {!editing ? (
                <Button
                  size="sm"
                  variant="outline-primary"
                  style={{ fontSize: '0.72rem', padding: '2px 10px' }}
                  onClick={() => { setEditing(true); setFormError(null); }}
                >
                  ✏️ Edit
                </Button>
              ) : (
                <div className="d-flex gap-1">
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    style={{ fontSize: '0.72rem', padding: '2px 10px' }}
                    onClick={() => { setEditing(false); setFormError(null); }}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    style={{ fontSize: '0.72rem', padding: '2px 10px' }}
                    onClick={handleSave}
                    disabled={busy}
                  >
                    {update.isPending ? <Spinner size="sm" animation="border" /> : 'Save'}
                  </Button>
                </div>
              )}
            </div>

            {editing ? (
              <Row>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small">Full Name</Form.Label>
                    <Form.Control size="sm" value={form.name} onChange={e => set('name', e.target.value)} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small">Email</Form.Label>
                    <Form.Control size="sm" value={staff.email} disabled readOnly />
                    <Form.Text className="text-muted">The login address cannot be changed here.</Form.Text>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small">Role</Form.Label>
                    <Form.Select
                      size="sm"
                      value={form.role}
                      onChange={e => set('role', e.target.value as StaffRole)}
                      disabled={isSelf}
                    >
                      {/* The role they hold now, even once it has been disabled —
                          otherwise the select would silently show another one. */}
                      {staff && !assignableRoles.some(r => r.name === staff.role) && (
                        <option value={staff.role}>
                          {ROLE_CONFIG[staff.role]?.label ?? staff.role} (not assignable)
                        </option>
                      )}
                      {assignableRoles.map(r => (
                        <option key={r.name} value={r.name}>
                          {ROLE_CONFIG[r.name]?.icon ?? '•'} {r.label}
                        </option>
                      ))}
                    </Form.Select>
                    {isSelf ? (
                      <Form.Text className="text-muted">You cannot change your own role.</Form.Text>
                    ) : form.role && form.role !== staff.role ? (
                      <Form.Text style={{ color: '#E8701A' }}>
                        {assignableRoles.find(r => r.name === form.role)?.description ?? ROLE_CONFIG[form.role]?.description}{' '}
                        They will be signed out and must log in again.
                      </Form.Text>
                    ) : null}
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small">Phone</Form.Label>
                    <Form.Control size="sm" value={form.phone} onChange={e => set('phone', e.target.value)} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small">Department</Form.Label>
                    <Form.Control size="sm" value={form.department} onChange={e => set('department', e.target.value)} />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small">Position</Form.Label>
                    <Form.Select size="sm" value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)}>
                      <option value="">— Select position —</option>
                      {/* A title recorded before this list existed is offered as
                          itself, so editing someone's phone number does not
                          quietly clear the position they already hold. */}
                      {isLegacyJobTitle(form.jobTitle) && (
                        <option value={form.jobTitle}>{form.jobTitle} (not on the current list)</option>
                      )}
                      {JOB_TITLE_CATEGORIES.map(cat => (
                        <optgroup key={cat} label={cat}>
                          {JOB_TITLES.filter(j => j.category === cat).map(j => (
                            <option key={j.value} value={j.value}>{j.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </Form.Select>
                    <Form.Text className="text-muted">
                      A label only — the system role is what grants access.
                    </Form.Text>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small">Emergency Contact</Form.Label>
                    <Form.Control
                      size="sm"
                      value={form.emergencyContact}
                      onChange={e => set('emergencyContact', e.target.value)}
                      placeholder="Name of next of kin"
                    />
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-bold small">Emergency Phone</Form.Label>
                    <Form.Control
                      size="sm"
                      value={form.emergencyPhone}
                      onChange={e => set('emergencyPhone', e.target.value)}
                    />
                  </Form.Group>
                </Col>
              </Row>
            ) : (
              <Row style={{ marginBottom: '12px' }}>
                <Col md={6}><Field label="Email"             value={staff.email} /></Col>
                <Col md={6}><Field label="Phone"             value={staff.phone} /></Col>
                <Col md={6}><Field label="Department"        value={staff.department} /></Col>
                <Col md={6}><Field label="Position"          value={getJobTitleLabel(staff.jobTitle)} /></Col>
                <Col md={6}><Field label="Emergency Contact" value={staff.emergencyContact} /></Col>
                <Col md={6}><Field label="Emergency Phone"   value={staff.emergencyPhone} /></Col>
              </Row>
            )}

            {/* ── Recent activity ────────────────────────────────────────── */}
            <div style={SECTION_TITLE}>Recent Activity</div>
            {!staff.recentActivity?.length ? (
              <div
                style={{
                  border:       '1px dashed #ced4da',
                  borderRadius: '0.375rem',
                  padding:      '16px',
                  textAlign:    'center',
                  color:        '#6c757d',
                  fontSize:     '0.8rem',
                  marginBottom: '20px',
                }}
              >
                No recorded activity yet.
              </div>
            ) : (
              <div
                style={{
                  border:       '1px solid #e9ecef',
                  borderRadius: '0.375rem',
                  marginBottom: '20px',
                  overflow:     'hidden',
                }}
              >
                {staff.recentActivity.map((entry, i) => (
                  <div
                    key={entry.id}
                    style={{
                      display:        'flex',
                      justifyContent: 'space-between',
                      gap:            '10px',
                      padding:        '7px 12px',
                      fontSize:       '0.78rem',
                      background:     i % 2 === 0 ? '#fff' : '#F8F9FA',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: '#1B3A6B' }}>
                      {entry.action.replace(/_/g, ' ')}
                    </span>
                    <span style={{ color: '#6c757d', flex: 1 }}>{entry.entity}</span>
                    <span style={{ color: '#6c757d', whiteSpace: 'nowrap' }}>
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Account actions ────────────────────────────────────────── */}
            {canControlAccount && (
              <>
                <div style={SECTION_TITLE}>Account Actions</div>

                {showDeactivate ? (
                  <div
                    style={{
                      border:       '2px solid #E8701A',
                      borderRadius: '0.5rem',
                      padding:      '14px',
                      background:   '#FEF9E7',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#7D6608', marginBottom: '4px' }}>
                      🔒 Deactivate {staff.name}?
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#7D6608', marginBottom: '10px' }}>
                      This signs them out immediately and prevents them from logging in again.
                      Their records stay intact and the account can be restored later.
                    </div>
                    <Form.Group className="mb-2">
                      <Form.Label className="fw-bold small">Reason <span className="text-danger">*</span></Form.Label>
                      <Form.Control
                        size="sm"
                        as="textarea"
                        rows={2}
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="e.g. Contract ended, 20 August 2026"
                      />
                      <Form.Text className="text-muted">Kept on the audit trail.</Form.Text>
                    </Form.Group>
                    <div className="d-flex gap-2">
                      <Button
                        size="sm"
                        variant="warning"
                        onClick={handleDeactivate}
                        disabled={deactivate.isPending}
                      >
                        {deactivate.isPending ? <Spinner size="sm" animation="border" /> : 'Confirm Deactivation'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-secondary"
                        onClick={() => { setShowDeactivate(false); setReason(''); setFormError(null); }}
                        disabled={deactivate.isPending}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="d-flex flex-wrap gap-2">
                    {staff.isActive ? (
                      <Button
                        size="sm"
                        variant="warning"
                        onClick={() => { setShowDeactivate(true); setFormError(null); }}
                        disabled={busy || isSelf}
                        title={isSelf ? 'You cannot deactivate your own account.' : undefined}
                      >
                        🔒 Deactivate Account
                      </Button>
                    ) : (
                      <Button size="sm" variant="success" onClick={handleReactivate} disabled={busy}>
                        {reactivate.isPending ? <Spinner size="sm" animation="border" /> : '✅ Reactivate Account'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline-secondary"
                      onClick={handleResetPassword}
                      disabled={busy}
                    >
                      {resetPass.isPending ? <Spinner size="sm" animation="border" /> : '🔑 Reset Password'}
                    </Button>
                  </div>
                )}

                {isSelf && staff.isActive && (
                  <div style={{ fontSize: '0.72rem', color: '#6c757d', marginTop: '8px' }}>
                    This is your own account — it cannot be deactivated from here.
                  </div>
                )}
              </>
            )}
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" onClick={handleClose}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}
