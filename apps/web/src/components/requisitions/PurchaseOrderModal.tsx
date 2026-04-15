import { Modal, Form, Button, Row, Col } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreatePurchaseOrder, useSuppliers } from '../../hooks/useRequisitions';
import { useToast } from '../../context/ToastContext';
import type { RequisitionResponse } from '@stap/shared';

const Schema = z.object({
  supplierId:       z.string().optional(),
  quantity:         z.number().int().min(1),
  unitCost:         z.number().int().positive(),
  expectedDelivery: z.string().optional(),
});

type FormValues = z.infer<typeof Schema>;

interface Props {
  requisition: RequisitionResponse;
  onClose: () => void;
}

export default function PurchaseOrderModal({ requisition, onClose }: Props) {
  const { showToast } = useToast();
  const createPO   = useCreatePurchaseOrder();
  const { data: suppliers = [] } = useSuppliers();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      quantity: requisition.quantity,
      unitCost: requisition.estimatedUnitCost,
    },
  });

  const qty  = watch('quantity') || 0;
  const cost = watch('unitCost') || 0;
  const total = qty * cost;

  const onSubmit = async (values: FormValues) => {
    try {
      await createPO.mutateAsync({
        requisitionId:   requisition.id,
        supplierId:      values.supplierId || undefined,
        quantity:        values.quantity,
        unitCost:        values.unitCost,
        expectedDelivery: values.expectedDelivery
          ? new Date(values.expectedDelivery).toISOString()
          : undefined,
      });
      showToast('Purchase order created', 'success');
      onClose();
    } catch {
      showToast('Failed to create purchase order', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Create Purchase Order</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <div className="mb-3 p-2 rounded bg-light small">
            Requisition: <strong>{requisition.category}</strong> — {requisition.description}
          </div>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group>
                <Form.Label>Supplier <span className="text-muted small">(optional)</span></Form.Label>
                <Form.Select {...register('supplierId')}>
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Form.Select>
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
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Unit Cost (UGX) <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="number" min={0}
                  {...register('unitCost', { valueAsNumber: true })}
                  isInvalid={!!errors.unitCost}
                />
              </Form.Group>
            </Col>
            <Col md={4} className="d-flex align-items-end">
              <div className="w-100 p-2 rounded bg-light text-center">
                <div className="small text-muted">Total</div>
                <div className="fw-bold small" style={{ color: '#1B3A6B' }}>UGX {total.toLocaleString()}</div>
              </div>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Expected Delivery <span className="text-muted small">(optional)</span></Form.Label>
                <Form.Control type="date" {...register('expectedDelivery')} />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" style={{ background: '#1B3A6B', borderColor: '#1B3A6B' }} disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create Purchase Order'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
