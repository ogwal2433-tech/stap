import { useState } from 'react';
import { Modal, Form, Button, Row, Col, Alert, Badge } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateIncidentSchema } from '@security360/shared';
import { useCreateIncident } from '../../hooks/useClients';
import { useToast } from '../../context/ToastContext';
import type { GuardResponse } from '@security360/shared';
import { z } from 'zod';

const FormSchema = CreateIncidentSchema.omit({ siteId: true });
type FormValues = z.infer<typeof FormSchema>;

const INCIDENT_TYPE_LABELS: Record<string, string> = {
  GUARD_MISCONDUCT: 'Guard Misconduct',
  SECURITY_BREACH: 'Security Breach',
  THEFT: 'Theft',
  ASSAULT: 'Assault',
  PROPERTY_DAMAGE: 'Property Damage',
  UNAUTHORIZED_ACCESS: 'Unauthorized Access',
  ABSENTEEISM: 'Absenteeism',
  INSUBORDINATION: 'Insubordination',
  OTHER: 'Other',
};

const SEVERITY_CONFIG = {
  LOW: { dot: '🟢', label: 'Low' },
  MEDIUM: { dot: '🟡', label: 'Medium' },
  HIGH: { dot: '🟠', label: 'High' },
  CRITICAL: { dot: '🔴', label: 'Critical' },
};

interface Props {
  siteId: string;
  siteName: string;
  guards?: GuardResponse[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function IncidentFormModal({ siteId, siteName, guards = [], onClose, onSuccess }: Props) {
  const { showToast } = useToast();
  const createIncident = useCreateIncident();
  const [selectedGuardIds, setSelectedGuardIds] = useState<string[]>([]);
  const [description, setDescription] = useState('');

  const now = new Date();
  const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      occurredAt: new Date().toISOString(),
      severity: 'LOW',
    },
  });

  const severity = watch('severity');
  const isHighSeverity = severity === 'HIGH' || severity === 'CRITICAL';

  const toggleGuard = (id: string) => {
    setSelectedGuardIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  };

  const onSubmit = async (values: FormValues) => {
    try {
      await createIncident.mutateAsync({
        siteId,
        data: {
          ...values,
          guardIds: selectedGuardIds.length > 0 ? selectedGuardIds : undefined,
        },
      });
      showToast('Incident logged', 'success');
      onSuccess();
      onClose();
    } catch {
      showToast('Failed to log incident', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Log Incident — {siteName}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <Row className="g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label>Incident Type <span className="text-danger">*</span></Form.Label>
                <Form.Select {...register('incidentType')} isInvalid={!!errors.incidentType}>
                  <option value="">Select type…</option>
                  {Object.entries(INCIDENT_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">{errors.incidentType?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group>
                <Form.Label>Severity <span className="text-danger">*</span></Form.Label>
                <Form.Select {...register('severity')} isInvalid={!!errors.severity}>
                  {Object.entries(SEVERITY_CONFIG).map(([value, { dot, label }]) => (
                    <option key={value} value={value}>{dot} {label}</option>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">{errors.severity?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label>Date and Time of Incident <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="datetime-local"
                  defaultValue={localIso}
                  {...register('occurredAt', {
                    setValueAs: (v: string) => v ? new Date(v).toISOString() : '',
                  })}
                  isInvalid={!!errors.occurredAt}
                />
                <Form.Control.Feedback type="invalid">{errors.occurredAt?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            {guards.length > 0 && (
              <Col md={12}>
                <Form.Group>
                  <Form.Label>Guards Involved <span className="text-muted small">(optional)</span></Form.Label>
                  <div
                    style={{
                      maxHeight: 150,
                      overflowY: 'auto',
                      border: '1px solid #dee2e6',
                      borderRadius: 4,
                      padding: '8px 12px',
                    }}
                  >
                    {guards.map((g) => (
                      <Form.Check
                        key={g.id}
                        type="checkbox"
                        id={`guard-${g.id}`}
                        label={g.fullName}
                        checked={selectedGuardIds.includes(g.id)}
                        onChange={() => toggleGuard(g.id)}
                      />
                    ))}
                  </div>
                  {selectedGuardIds.length > 0 && (
                    <Form.Text className="text-muted">{selectedGuardIds.length} guard(s) selected</Form.Text>
                  )}
                </Form.Group>
              </Col>
            )}

            <Col md={12}>
              <Form.Group>
                <Form.Label>Description <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  as="textarea"
                  rows={4}
                  placeholder="Describe what happened in detail (minimum 10 characters)…"
                  {...register('description')}
                  onChange={(e) => setDescription(e.target.value)}
                  isInvalid={!!errors.description}
                />
                <div className="d-flex justify-content-between">
                  <Form.Control.Feedback type="invalid">{errors.description?.message}</Form.Control.Feedback>
                  <Form.Text className="text-muted ms-auto">{description.length}/2000</Form.Text>
                </div>
              </Form.Group>
            </Col>

            {isHighSeverity && (
              <Col md={12}>
                <Alert variant="warning" className="mb-0">
                  <i className="bi bi-exclamation-triangle-fill me-2" />
                  <strong>{severity}</strong> incidents are automatically reported to the Director
                  and Operations Supervisor via SMS and email.
                </Alert>
              </Col>
            )}
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={isSubmitting}>
            {isSubmitting ? 'Logging…' : 'Log Incident'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
