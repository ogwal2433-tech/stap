import { useState } from 'react';
import { Badge, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { generatePassword } from '@security360/shared';
import type { GuardResponse } from '@security360/shared';
import PermissionGuard from '../PermissionGuard';
import TemporaryPasswordField from '../common/TemporaryPasswordField';
import { useGrantGuardAccess, useRevokeGuardAccess } from '../../hooks/useGuards';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

interface GuardSystemAccessProps {
  guard: GuardResponse;
}

/**
 * Whether this guard can sign in.
 *
 * Most never need to, so the panel stays quiet until someone grants access —
 * and the login is created from here rather than from the user-admin screen,
 * so the guard is never entered into the system twice.
 */
export default function GuardSystemAccess({ guard }: GuardSystemAccessProps) {
  const [showGrant,  setShowGrant]  = useState(false);
  const [showRevoke, setShowRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ email: '', password: generatePassword() });

  const { showToast } = useToast();
  const grant  = useGrantGuardAccess(guard.id);
  const revoke = useRevokeGuardAccess(guard.id);

  const access = guard.systemAccess ?? null;

  const openGrant = () => {
    setForm({ email: '', password: generatePassword() });
    setError(null);
    setShowGrant(true);
  };

  const submitGrant = () => {
    setError(null);
    const email = form.email.trim();
    if (!email) return setError('A login email is required.');
    if (form.password.trim().length < 8) {
      return setError('A temporary password must be at least 8 characters.');
    }

    grant.mutate(
      { email, password: form.password },
      {
        onSuccess: () => {
          showToast(`${guard.fullName} can now sign in as ${email}.`, 'success');
          setShowGrant(false);
        },
        onError: (err) => setError(getApiErrorMessage(err, 'Could not grant system access.')),
      },
    );
  };

  const submitRevoke = () => {
    revoke.mutate(undefined, {
      onSuccess: () => {
        showToast(`${guard.fullName} can no longer sign in.`, 'success');
        setShowRevoke(false);
      },
      onError: (err) => {
        showToast(getApiErrorMessage(err, 'Could not revoke system access.'), 'danger');
        setShowRevoke(false);
      },
    });
  };

  return (
    <div style={{ borderTop: '1px solid #e9ecef', paddingTop: '16px', marginTop: '16px' }}>
      <div
        style={{
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
          gap:            '12px',
          marginBottom:   access ? '12px' : '0',
        }}
      >
        <div>
          <div className="fw-bold small">🔐 System Access</div>
          <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>
            Allow this guard to log into the system
          </div>
        </div>

        {access ? (
          <div className="d-flex align-items-center gap-2">
            <Badge bg={access.status === 'ACTIVE' ? 'success' : 'secondary'} style={{ fontSize: '0.72rem' }}>
              {access.status === 'ACTIVE' ? '✅ Active Login' : access.status}
            </Badge>
            <PermissionGuard permission="guards.edit">
              <Button
                variant="outline-danger"
                size="sm"
                style={{ fontSize: '0.72rem' }}
                onClick={() => setShowRevoke(true)}
              >
                Revoke Access
              </Button>
            </PermissionGuard>
          </div>
        ) : (
          <PermissionGuard permission="guards.edit">
            <Button variant="outline-primary" size="sm" onClick={openGrant}>
              + Grant System Access
            </Button>
          </PermissionGuard>
        )}
      </div>

      {access && (
        <div
          style={{
            background:   '#F2F4F7',
            borderRadius: '0.375rem',
            padding:      '8px 12px',
            fontSize:     '0.75rem',
            color:        '#4A5568',
          }}
        >
          Login email: <strong>{access.email}</strong>
        </div>
      )}

      {/* ── Grant ─────────────────────────────────────────────────────────── */}
      <Modal show={showGrant} onHide={() => setShowGrant(false)} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>
            🔐 Grant System Access — {guard.fullName}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div
            style={{
              background:   '#FEF9E7',
              borderRadius: '0.375rem',
              padding:      '10px 14px',
              marginBottom: '16px',
              fontSize:     '0.78rem',
              color:        '#856404',
              borderLeft:   '3px solid #F2AA20',
            }}
          >
            ⚠️ This guard will be able to log into the system with the GUARD role. They will
            only see what the GUARD role permits.
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
            <Form.Label className="fw-bold small">Login Email *</Form.Label>
            <Form.Control
              size="sm"
              type="email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="guard@example.com"
            />
          </Form.Group>

          <TemporaryPasswordField
            value={form.password}
            onChange={next => setForm(p => ({ ...p, password: next }))}
            hint="Share this with the guard. They should change it after signing in."
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={() => setShowGrant(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!form.email.trim() || grant.isPending}
            onClick={submitGrant}
          >
            {grant.isPending ? <Spinner size="sm" animation="border" /> : '🔐 Grant Access'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* ── Revoke ────────────────────────────────────────────────────────── */}
      <Modal show={showRevoke} onHide={() => setShowRevoke(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>Revoke system access?</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ fontSize: '0.85rem' }}>
          <p className="mb-2">
            <strong>{guard.fullName}</strong> will no longer be able to sign in
            {access ? <> as <strong>{access.email}</strong></> : null}.
          </p>
          <p className="mb-0 text-muted" style={{ fontSize: '0.78rem' }}>
            The account is switched off rather than deleted, so anything it recorded stays in
            the history. Access can be granted again later.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={() => setShowRevoke(false)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" disabled={revoke.isPending} onClick={submitRevoke}>
            {revoke.isPending ? <Spinner size="sm" animation="border" /> : '🗑️ Revoke Access'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
