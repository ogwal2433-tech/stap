import { Modal, Form, Button, Row, Col } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateRequisitionSchema } from '@stap/shared';
import type { CreateRequisitionInput } from '@stap/shared';
import { useCreateRequisition } from '../../hooks/useRequisitions';
import { useToast } from '../../context/ToastContext';

interface Props { onClose: () => void }

const CATEGORIES = [
  { value: 'UNIFORM',              label: '👕 Uniform',               icon: '👕' },
  { value: 'EQUIPMENT',            label: '🔧 Equipment',             icon: '🔧' },
  { value: 'STATIONERY',           label: '📄 Stationery',            icon: '📄' },
  { value: 'VEHICLE_MAINTENANCE',  label: '🚗 Vehicle Maintenance',   icon: '🚗' },
  { value: 'OTHER',                label: '📦 Other',                  icon: '📦' },
];

const URGENCY = [
  { value: 'LOW',    label: 'Low',    color: 'secondary' },
  { value: 'NORMAL', label: 'Normal', color: 'info' },
  { value: 'HIGH',   label: 'High',   color: 'warning' },
  { value: 'URGENT', label: 'Urgent', color: 'danger' },
];

export default function RequisitionFormModal({ onClose }: Props) {
  const { showToast } = useToast();
  const createReq = useCreateRequisition();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateRequisitionInput>({
    resolver: zodResolver(CreateRequisitionSchema),
    defaultValues: { urgency: 'NORMAL', quantity: 1 },
  });

  const qty  = watch('quantity')          || 0;
  const cost = watch('estimatedUnitCost') || 0;
  const total = qty * cost;

  const onSubmit = async (values: CreateRequisitionInput) => {
    try {
      await createReq.mutateAsync(values);
      showToast('Requisition submitted', 'success');
      onClose();
    } catch {
      showToast('Failed to submit requisition', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>New Requisition</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <Row className="g-3">
            <Col md={6}>
              <Form.Group>
                <Form.Label>Category <span className="text-danger">*</span></Form.Label>
                <Form.Select {...register('category')} isInvalid={!!errors.category}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Urgency</Form.Label>
                <Form.Select {...register('urgency')}>
                  {URGENCY.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Description <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  as="textarea" rows={2}
                  placeholder="Describe the item(s) needed…"
                  {...register('description')}
                  isInvalid={!!errors.description}
                />
                <Form.Control.Feedback type="invalid">{errors.description?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Quantity <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="number" min={1}
                  {...register('quantity', { valueAsNumber: true })}
                  isInvalid={!!errors.quantity}
                />
                <Form.Control.Feedback type="invalid">{errors.quantity?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Est. Unit Cost (UGX) <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="number" min={0}
                  {...register('estimatedUnitCost', { valueAsNumber: true })}
                  isInvalid={!!errors.estimatedUnitCost}
                />
                <Form.Control.Feedback type="invalid">{errors.estimatedUnitCost?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4} className="d-flex align-items-end">
              <div className="w-100 p-2 rounded bg-light text-center">
                <div className="small text-muted">Est. Total</div>
                <div className="fw-bold" style={{ color: '#1B3A6B' }}>UGX {total.toLocaleString()}</div>
              </div>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Justification <span className="text-muted small">(optional)</span></Form.Label>
                <Form.Control as="textarea" rows={2} {...register('justification')} />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" style={{ background: '#1B3A6B', borderColor: '#1B3A6B' }} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit Requisition'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
