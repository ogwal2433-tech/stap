import { useState } from 'react';
import { Button, Form, Modal, Row, Col, Spinner } from 'react-bootstrap';
import { ROLE_CONFIG, STAFF_ROLE_VALUES, type StaffRole , JOB_TITLES, JOB_TITLE_CATEGORIES } from '@stap/shared';
import { useCreateStaff } from '../../hooks/useStaff';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

interface CreateStaffModalProps {
  show:      boolean;
  onClose:   () => void;
  onSuccess: () => void;
}

const EMPTY_FORM = {
  name:       '',
  email:      '',
  role:       '' as StaffRole | '',
  phone:      '',
  department: '',
  jobTitle:   '',
  password:   '',
};

export default function CreateStaffModal({ show, onClose, onSuccess }: CreateStaffModalProps) {
  const [form, setForm]   = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const create            = useCreateStaff();
  const { showToast }     = useToast();

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(f => ({ ...f, [key]: value }));

  const roleConfig = form.role ? ROLE_CONFIG[form.role] : null;

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setError(null);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.name.trim().length < 2)  return setError('Enter the staff member’s full name.');
    if (!form.email.trim())           return setError('An email address is required — it is their login.');
    if (!form.role)                   return setError('Select a role so the account knows what it may reach.');
    // Caught here rather than after the round-trip, where the server rejects it anyway.
    if (form.password && form.password.length < 8) {
      return setError('A password must be at least 8 characters. Leave it blank to generate one.');
    }

    create.mutate(
      {
        name:       form.name.trim(),
        email:      form.email.trim().toLowerCase(),
        role:       form.role,
        phone:      form.phone.trim()      || null,
        department: form.department.trim() || null,
        jobTitle:   (form.jobTitle.trim() || null) as never,
        ...(form.password ? { password: form.password } : {}),
      },
      {
        onSuccess: () => {
          showToast(
            form.password
              ? `${form.name.trim()}’s account is ready.`
              : `${form.name.trim()}’s account is ready — their password has been emailed to them.`,
            'success',
          );
          setForm(EMPTY_FORM);
          onSuccess();
        },
        onError: (err) => setError(getApiErrorMessage(err, 'Failed to create the account.')),
      },
    );
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg" backdrop="static">
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1B3A6B' }}>
            👥 Add Staff Member
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
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

          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold small">
                  Full Name <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  size="sm"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Alice Nakato"
                  autoFocus
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold small">
                  Email Address <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  size="sm"
                  type="email"
                  value={form.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="name@stapsecurity.co.ug"
                />
                <Form.Text className="text-muted">This is what they log in with.</Form.Text>
              </Form.Group>
            </Col>
          </Row>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold small">
              Role <span className="text-danger">*</span>
            </Form.Label>
            <Form.Select
              size="sm"
              value={form.role}
              onChange={e => set('role', e.target.value as StaffRole | '')}
            >
              <option value="">— Select role —</option>
              {STAFF_ROLE_VALUES.map(value => (
                <option key={value} value={value}>
                  {ROLE_CONFIG[value]?.icon} {ROLE_CONFIG[value]?.label ?? value}
                </option>
              ))}
            </Form.Select>
            {roleConfig && (
              <div
                style={{
                  background:   '#EBF5FB',
                  borderRadius: '0.375rem',
                  padding:      '8px 12px',
                  marginTop:    '6px',
                  fontSize:     '0.78rem',
                  color:        '#1B3A6B',
                }}
              >
                ℹ️ {roleConfig.description}
              </div>
            )}
          </Form.Group>

          <Row>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold small">
                  Phone <span className="text-muted fw-normal">(optional)</span>
                </Form.Label>
                <Form.Control
                  size="sm"
                  value={form.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="+256 772 000000"
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold small">
                  Department <span className="text-muted fw-normal">(optional)</span>
                </Form.Label>
                <Form.Control
                  size="sm"
                  value={form.department}
                  onChange={e => set('department', e.target.value)}
                  placeholder="e.g. Operations"
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-bold small">
                  Job Title <span className="text-muted fw-normal">(optional)</span>
                </Form.Label>
                <Form.Select
                  size="sm"
                  value={form.jobTitle}
                  onChange={e => set('jobTitle', e.target.value)}
                >
                  <option value="">— Select position —</option>
                  {JOB_TITLE_CATEGORIES.map(cat => (
                    <optgroup key={cat} label={cat}>
                      {JOB_TITLES.filter(j => j.category === cat).map(j => (
                        <option key={j.value} value={j.value}>{j.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </Form.Select>
                <Form.Text className="text-muted">
                  A label only — the system role below is what grants access.
                </Form.Text>
              </Form.Group>
            </Col>
          </Row>

          <Form.Group className="mb-1">
            <Form.Label className="fw-bold small">
              Password <span className="text-muted fw-normal">(optional)</span>
            </Form.Label>
            <Form.Control
              size="sm"
              type="text"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder="Leave blank to auto-generate and email to the staff member"
            />
            <Form.Text className="text-muted">
              If left blank, a secure password is generated and sent to{' '}
              {form.email.trim() || 'their email address'}. They should change it on first login.
            </Form.Text>
          </Form.Group>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={handleClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={create.isPending}>
            {create.isPending ? <Spinner size="sm" animation="border" /> : 'Create Account'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
