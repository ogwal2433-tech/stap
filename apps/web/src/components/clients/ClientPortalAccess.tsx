import { useState } from 'react';
import { Badge, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { generatePassword } from '@stap/shared';
import type { LinkedAccount } from '@stap/shared';
import PermissionGuard from '../PermissionGuard';
import TemporaryPasswordField from '../common/TemporaryPasswordField';
import {
  useClientPortalAccounts,
  useGrantClientPortal,
  useRevokeClientPortal,
  useResetClientPortalPassword,
} from '../../hooks/useClients';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

interface ClientPortalAccessProps {
  clientId:   string;
  clientName: string;
}

/**
 * The logins a client company holds for the portal.
 *
 * A company can have more than one — finance and operations usually want their
 * own — so this lists contacts rather than showing a single on/off flag, and
 * each can be reset or switched off on its own.
 */
export default function ClientPortalAccess({ clientId, clientName }: ClientPortalAccessProps) {
  const [showGrant, setShowGrant] = useState(false);
  const [revoking,  setRevoking]  = useState<LinkedAccount | null>(null);
  const [resetting, setResetting] = useState<LinkedAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Set on success so the modal confirms the email before it closes. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [form, setForm] = useState({ contactName: '', email: '', password: generatePassword() });
  const [newPassword, setNewPassword] = useState(generatePassword());

  const { showToast } = useToast();
  const { data: accounts = [], isLoading } = useClientPortalAccounts(clientId);
  const grant  = useGrantClientPortal(clientId);
  const revoke = useRevokeClientPortal(clientId);
  const reset  = useResetClientPortalPassword(clientId);

  const active = accounts.filter(a => a.status === 'ACTIVE');

  const openGrant = () => {
    setForm({ contactName: '', email: '', password: generatePassword() });
    setError(null);
    setSentTo(null);
    setShowGrant(true);
  };

  const submitGrant = () => {
    setError(null);
    if (form.contactName.trim().length < 2) return setError('Name the person who will use this login.');
    if (!form.email.trim())                 return setError('A login email is required.');
    if (form.password.trim().length < 8)    return setError('A temporary password must be at least 8 characters.');

    grant.mutate(
      { contactName: form.contactName.trim(), email: form.email.trim(), password: form.password },
      {
        onSuccess: () => {
          const address = form.email.trim();
          showToast(`Portal access enabled. Login details sent to ${address}.`, 'success', 6000);
          // Held open briefly so the person setting this up sees which address
          // the credentials went to — they usually have to pass it on.
          setSentTo(address);
          setTimeout(() => {
            setSentTo(null);
            setShowGrant(false);
          }, 2500);
        },
        onError: (err) => setError(getApiErrorMessage(err, 'Could not enable portal access.')),
      },
    );
  };

  const submitRevoke = () => {
    if (!revoking) return;
    revoke.mutate(revoking.userId, {
      onSuccess: () => {
        showToast(`${revoking.name} can no longer sign into the portal.`, 'success');
        setRevoking(null);
      },
      onError: (err) => {
        showToast(getApiErrorMessage(err, 'Could not disable portal access.'), 'danger');
        setRevoking(null);
      },
    });
  };

  const submitReset = () => {
    if (!resetting) return;
    reset.mutate(
      { userId: resetting.userId, newPassword },
      {
        onSuccess: () => {
          showToast(`Password reset. The new details were emailed to ${resetting.email}.`, 'success', 6000);
          setResetting(null);
        },
        onError: (err) => {
          showToast(getApiErrorMessage(err, 'Could not reset the password.'), 'danger');
        },
      },
    );
  };

  return (
    <div
      style={{
        background:   'white',
        borderRadius: '0.75rem',
        border:       '1px solid #e9ecef',
        padding:      '16px 20px',
        marginBottom: '16px',
      }}
    >
      <div
        style={{
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
          gap:            '12px',
          marginBottom:   accounts.length ? '12px' : '0',
        }}
      >
        <div>
          <div className="fw-bold" style={{ color: '#1B3A6B' }}>🌐 Client Portal Access</div>
          <div style={{ fontSize: '0.72rem', color: '#6c757d', marginTop: '2px' }}>
            Allow this client to log in and view their invoices, complaints, and service requests
          </div>
        </div>

        <div className="d-flex align-items-center gap-2">
          {active.length > 0 && (
            <Badge bg="success" style={{ fontSize: '0.72rem' }}>
              ✅ Portal Active
            </Badge>
          )}
          <PermissionGuard permission="clients.edit">
            <Button variant="outline-primary" size="sm" onClick={openGrant}>
              {accounts.length ? '+ Add Portal Login' : '+ Enable Portal Access'}
            </Button>
          </PermissionGuard>
        </div>
      </div>

      {isLoading && <div className="text-muted small">Loading portal access…</div>}

      {!isLoading && accounts.length === 0 && (
        <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
          No portal access. This client cannot sign in.
        </div>
      )}

      {accounts.map(account => (
        <div
          key={account.userId}
          style={{
            background:   '#F2F4F7',
            borderRadius: '0.375rem',
            padding:      '10px 14px',
            fontSize:     '0.78rem',
            marginBottom: '8px',
          }}
        >
          <Row className="g-2 align-items-center">
            <Col xs={12} md={5}>
              <div className="text-muted small">Portal Login</div>
              <div className="fw-bold">{account.email}</div>
              <div className="text-muted" style={{ fontSize: '0.72rem' }}>{account.name}</div>
            </Col>
            <Col xs={6} md={3}>
              <div className="text-muted small">Account Status</div>
              <Badge
                bg={account.status === 'ACTIVE' ? 'success' : 'warning'}
                style={{ fontSize: '0.72rem' }}
              >
                {account.status}
              </Badge>
            </Col>
            <Col xs={6} md={4} className="d-flex gap-2 justify-content-md-end">
              <PermissionGuard permission="clients.edit">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  style={{ fontSize: '0.72rem' }}
                  onClick={() => { setNewPassword(generatePassword()); setResetting(account); }}
                >
                  🔑 Reset Password
                </Button>
              </PermissionGuard>
              {account.status === 'ACTIVE' && (
                <PermissionGuard permission="clients.edit">
                  <Button
                    variant="outline-danger"
                    size="sm"
                    style={{ fontSize: '0.72rem' }}
                    onClick={() => setRevoking(account)}
                  >
                    Disable
                  </Button>
                </PermissionGuard>
              )}
            </Col>
          </Row>
        </div>
      ))}

      {/* ── Enable ────────────────────────────────────────────────────────── */}
      <Modal show={showGrant} onHide={() => setShowGrant(false)} centered backdrop="static">
        <Modal.Header closeButton style={{ background: '#1B3A6B', color: 'white' }}>
          <Modal.Title style={{ fontSize: '1rem' }}>
            🌐 Enable Client Portal — {clientName}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {sentTo ? (
            <div style={{ textAlign: 'center', padding: '30px 20px' }}>
              <div style={{ fontSize: '3rem', lineHeight: 1 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginTop: '12px', color: '#1E8449' }}>
                Portal Access Enabled
              </div>
              <div style={{ fontSize: '0.82rem', color: '#6c757d', marginTop: '8px' }}>
                Login details sent to<br />
                <strong>{sentTo}</strong>
              </div>
            </div>
          ) : (
          <>
          <div
            style={{
              background:   '#EBF5FB',
              borderRadius: '0.375rem',
              padding:      '10px 14px',
              marginBottom: '16px',
              fontSize:     '0.78rem',
              color:        '#1B3A6B',
              borderLeft:   '3px solid #1B3A6B',
            }}
          >
            ℹ️ The client will be able to log in and view their invoices, raise complaints, and
            submit service requests. They cannot see financial rates or contract terms.
          </div>

          {error && (
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
              {error}
            </div>
          )}

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold small">Contact Name *</Form.Label>
            <Form.Control
              size="sm"
              type="text"
              value={form.contactName}
              onChange={e => setForm(p => ({ ...p, contactName: e.target.value }))}
              placeholder="e.g. John Mugisha"
            />
            <Form.Text className="text-muted">The person who will use this login</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold small">Login Email *</Form.Label>
            <Form.Control
              size="sm"
              type="email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="contact@company.com"
            />
          </Form.Group>

          <TemporaryPasswordField
            value={form.password}
            onChange={next => setForm(p => ({ ...p, password: next }))}
            hint="Emailed to the contact, and safe to read out directly."
          />
          </>
          )}
        </Modal.Body>
        <Modal.Footer hidden={!!sentTo}>
          <Button variant="outline-secondary" size="sm" onClick={() => setShowGrant(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!form.email.trim() || !form.contactName.trim() || grant.isPending}
            onClick={submitGrant}
          >
            {grant.isPending ? <Spinner size="sm" animation="border" /> : '🌐 Enable Portal Access'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Disable ───────────────────────────────────────────────────────── */}
      <Modal show={!!revoking} onHide={() => setRevoking(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>Disable portal access?</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ fontSize: '0.85rem' }}>
          <p className="mb-2">
            <strong>{revoking?.name}</strong> ({revoking?.email}) will no longer be able to sign
            into the portal.
          </p>
          <p className="mb-0 text-muted" style={{ fontSize: '0.78rem' }}>
            The account is switched off rather than deleted, so their past requests and
            complaints stay on record.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={() => setRevoking(null)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" disabled={revoke.isPending} onClick={submitRevoke}>
            {revoke.isPending ? <Spinner size="sm" animation="border" /> : 'Disable Portal'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Reset password ────────────────────────────────────────────────── */}
      <Modal show={!!resetting} onHide={() => setResetting(null)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>🔑 Reset portal password</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p style={{ fontSize: '0.82rem' }} className="mb-3">
            A new temporary password for <strong>{resetting?.email}</strong>. It is emailed to
            them as well.
          </p>
          <TemporaryPasswordField
            value={newPassword}
            onChange={setNewPassword}
            label="New Temporary Password"
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={() => setResetting(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={newPassword.trim().length < 8 || reset.isPending}
            onClick={submitReset}
          >
            {reset.isPending ? <Spinner size="sm" animation="border" /> : 'Reset Password'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
