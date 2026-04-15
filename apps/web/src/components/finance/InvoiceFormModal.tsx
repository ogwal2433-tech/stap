import { useEffect } from 'react';
import { Modal, Form, Button, Row, Col } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateInvoice } from '../../hooks/useFinance';
import { useToast } from '../../context/ToastContext';
import { useClientList } from '../../hooks/useClients';
import type { ClientResponse } from '@stap/shared';

const Schema = z.object({
  clientId:       z.string().min(1, 'Client is required'),
  contractId:     z.string().optional(),
  periodStart:    z.string().min(1, 'Period start required'),
  periodEnd:      z.string().min(1, 'Period end required'),
  guardsDeployed: z.number().int().min(1, 'Must be at least 1'),
  ratePerGuard:   z.number().int().positive('Must be positive'),
  taxAmount:      z.number().int().min(0).default(0),
  dueDate:        z.string().min(1, 'Due date required'),
});

type FormValues = z.infer<typeof Schema>;

interface Props {
  onClose: () => void;
}

const NAVY = '#1B3A6B';

export default function InvoiceFormModal({ onClose }: Props) {
  const { showToast } = useToast();
  const createInvoice = useCreateInvoice();
  const { data: clientsRes } = useClientList();
  const clients = clientsRes?.data ?? [];

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { taxAmount: 0, guardsDeployed: 1, ratePerGuard: 0 },
  });

  const guards  = watch('guardsDeployed') || 0;
  const rate    = watch('ratePerGuard')   || 0;
  const tax     = watch('taxAmount')      || 0;
  const subtotal = guards * rate;
  const total    = subtotal + tax;

  const onSubmit = async (values: FormValues) => {
    try {
      await createInvoice.mutateAsync({
        ...values,
        periodStart: new Date(values.periodStart).toISOString(),
        periodEnd:   new Date(values.periodEnd).toISOString(),
        dueDate:     new Date(values.dueDate).toISOString(),
      });
      showToast('Invoice created', 'success');
      onClose();
    } catch {
      showToast('Failed to create invoice', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Generate Invoice</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group>
                <Form.Label>Client <span className="text-danger">*</span></Form.Label>
                <Form.Select {...register('clientId')} isInvalid={!!errors.clientId}>
                  <option value="">Select client…</option>
                  {clients.map((c: ClientResponse) => (
                    <option key={c.id} value={c.id}>{c.clientName}</option>
                  ))}
                </Form.Select>
                <Form.Control.Feedback type="invalid">{errors.clientId?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Period Start <span className="text-danger">*</span></Form.Label>
                <Form.Control type="date" {...register('periodStart')} isInvalid={!!errors.periodStart} />
                <Form.Control.Feedback type="invalid">{errors.periodStart?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Period End <span className="text-danger">*</span></Form.Label>
                <Form.Control type="date" {...register('periodEnd')} isInvalid={!!errors.periodEnd} />
                <Form.Control.Feedback type="invalid">{errors.periodEnd?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Guards Deployed <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="number" min={1}
                  {...register('guardsDeployed', { valueAsNumber: true })}
                  isInvalid={!!errors.guardsDeployed}
                />
                <Form.Control.Feedback type="invalid">{errors.guardsDeployed?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Rate per Guard (UGX) <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="number" min={0}
                  {...register('ratePerGuard', { valueAsNumber: true })}
                  isInvalid={!!errors.ratePerGuard}
                />
                <Form.Control.Feedback type="invalid">{errors.ratePerGuard?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Tax Amount (UGX)</Form.Label>
                <Form.Control
                  type="number" min={0}
                  {...register('taxAmount', { valueAsNumber: true })}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Due Date <span className="text-danger">*</span></Form.Label>
                <Form.Control type="date" {...register('dueDate')} isInvalid={!!errors.dueDate} />
                <Form.Control.Feedback type="invalid">{errors.dueDate?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={6} className="d-flex align-items-end">
              <div className="w-100 p-3 rounded" style={{ background: '#EBF5FB', border: '1px solid #AED6F1' }}>
                <div className="small text-muted mb-1">Invoice Total Preview</div>
                <div className="fw-bold" style={{ fontSize: '1.2rem', color: NAVY }}>
                  UGX {total.toLocaleString()}
                </div>
                <div className="text-muted small">Subtotal: UGX {subtotal.toLocaleString()} + Tax: UGX {tax.toLocaleString()}</div>
              </div>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" style={{ background: NAVY, borderColor: NAVY }} disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create Invoice'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
