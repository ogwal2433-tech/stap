import { Modal, Form, Button, Row, Col } from 'react-bootstrap';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRecordPayment } from '../../hooks/useFinance';
import { useToast } from '../../context/ToastContext';
import type { InvoiceResponse } from '@security360/shared';
import { formatUgx, isTwoDpOrWhole, roundMoney } from '@security360/shared';
import { getApiErrorMessage } from '../../lib/api';

/**
 * Built per invoice so the cap is the balance actually owed. The API rejects an
 * overpayment too — this only saves the round trip and names the limit while
 * the number is being typed.
 *
 * An amount is not forced to a whole shilling: an invoice whose lines carry cents
 * (a monthly rate ÷ 30 rarely is whole) can only be settled by paying to the cent,
 * so the same two-decimal rule as the shared RecordPaymentSchema applies here.
 */
const makeSchema = (outstanding: number) =>
  z.object({
    amountPaid: z.coerce
      .number()
      .positive('Amount must be positive')
      .max(outstanding, `Cannot exceed the outstanding balance of ${formatUgx(outstanding)}`)
      // refine last: in zod 3 it returns a wrapper that no longer exposes .max/.int
      .refine(isTwoDpOrWhole, 'Use at most two decimal places'),
    mode:            z.enum(['MOBILE_MONEY', 'BANK', 'CASH']),
    referenceNumber: z.string().optional(),
  });

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

const ugx = formatUgx;

interface Props {
  invoice: InvoiceResponse;
  onClose: () => void;
}

export default function RecordPaymentModal({ invoice, onClose }: Props) {
  const { showToast } = useToast();
  const recordPayment = useRecordPayment();

  // The balance owed, from the invoice record — not the invoice total, which is
  // what this panel used to show under an "Outstanding" label.
  const outstanding = invoice.outstandingBalance ?? invoice.totalAmount;
  const alreadyPaid = invoice.paidAmount ?? 0;

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(makeSchema(outstanding)),
    defaultValues: { mode: 'MOBILE_MONEY' },
  });

  // What the invoice will owe once this payment lands, updated as it is typed.
  const entered = Number(useWatch({ control, name: 'amountPaid' })) || 0;
  const remaining = roundMoney(Math.max(0, outstanding - entered));

  const onSubmit = async (values: FormValues) => {
    try {
      await recordPayment.mutateAsync({ invoiceId: invoice.id, ...values });
      showToast('Payment recorded', 'success');
      onClose();
    } catch (err) {
      // The API is the authority on the balance — show what it said rather than
      // a generic failure, so an overpayment explains itself.
      showToast(getApiErrorMessage(err), 'danger');
    }
  };

  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Record Payment — {invoice.invoiceNumber}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Body>
          <div className="mb-3 p-2 rounded bg-light small">
            <div className="d-flex justify-content-between text-muted">
              <span>Invoice total</span>
              <span className="text-dark">{ugx(invoice.totalAmount)}</span>
            </div>
            <div className="d-flex justify-content-between text-muted">
              <span>Already paid</span>
              <span style={{ color: '#1E8449' }}>{ugx(alreadyPaid)}</span>
            </div>
            <div className="d-flex justify-content-between fw-bold mt-1 pt-1 border-top">
              <span>Outstanding</span>
              <span style={{ color: outstanding > 0 ? '#C0392B' : '#1E8449' }}>{ugx(outstanding)}</span>
            </div>
            {entered > 0 && entered <= outstanding && (
              <div className="d-flex justify-content-between mt-1 pt-1 border-top">
                <span>Remaining after this payment</span>
                <span className="fw-bold" style={{ color: remaining === 0 ? '#1E8449' : '#E8701A' }}>
                  {remaining === 0 ? 'Settled in full' : ugx(remaining)}
                </span>
              </div>
            )}
          </div>
          <Row className="g-3">
            <Col md={12}>
              <Form.Group>
                <Form.Label>Amount Paid (UGX) <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  // No `max` attribute: it makes the browser block submission
                  // with its own tooltip, which suppresses the message below
                  // naming the actual balance. Zod enforces the same limit.
                  // step 0.01 because an invoice with cents in its lines can only be
                  // settled to the cent; the default step of 1 rejects such a payment.
                  type="number" min={1} step="0.01"
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
