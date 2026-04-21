import { Modal, Form, Button, Row, Col } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRecordPayment } from '../../hooks/useFinance';
import { useToast } from '../../context/ToastContext';
import type { InvoiceResponse } from '@stap/shared';

const Schema = z.object({
  amountPaid:      z.coerce.number().int().positive('Amount must be positive'),
  mode:            z.enum(['MOBILE_MONEY', 'BANK', 'CASH']),
  referenceNumber: z.string().optional(),
});

type FormValues = z.infer<typeof Schema>;

interface Props {
  invoice: InvoiceResponse;
  onClose: () => void;
}

export default function RecordPaymentModal({ invoice, onClose }: Props) {
  const { showToast } = useToast();
  const recordPayment = useRecordPayment();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: { mode: 'MOBILE_MONEY' },
  });

  const onSubmit = async (values: FormValues) => {
    try {
      await recordPayment.mutateAsync({ invoiceId: invoice.id, ...values });
      showToast('Payment recorded', 'success');
      onClose();
    } catch {
      showToast('Failed to record payment', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Record Payment — {invoice.invoiceNumber}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <div className="mb-3 p-2 rounded bg-light small text-muted">
            Outstanding: <strong className="text-dark">UGX {invoice.totalAmount.toLocaleString()}</strong>
          </div>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group>
                <Form.Label>Amount Paid (UGX) <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="number" min={1}
                  {...register('amountPaid', { valueAsNumber: true })}
                  isInvalid={!!errors.amountPaid}
                />
                <Form.Control.Feedback type="invalid">{errors.amountPaid?.message}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Payment Mode <span className="text-danger">*</span></Form.Label>
                <Form.Select {...register('mode')}>
                  <option value="MOBILE_MONEY">MTN / Airtel Mobile Money</option>
                  <option value="BANK">Bank Transfer</option>
                  <option value="CASH">Cash</option>
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={12}>
              <Form.Group>
                <Form.Label>Reference Number <span className="text-muted small">(optional)</span></Form.Label>
                <Form.Control placeholder="Transaction / receipt number" {...register('referenceNumber')} />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button variant="success" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Recording…' : 'Record Payment'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
