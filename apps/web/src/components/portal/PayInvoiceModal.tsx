import { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useMutation } from '@tanstack/react-query';
import { portalApi, type PortalPaymentResult } from '../../lib/portal.api';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';
import type { InvoiceResponse } from '@security360/shared';

interface Props {
  invoice:    InvoiceResponse;
  show:       boolean;
  onClose:    () => void;
  onSuccess?: () => void;
}

/**
 * Only the two networks the XCEL collection API accepts. Africell is not one of
 * them — offering it would take the payment and fail at the gateway.
 */
const NETWORKS = [
  { code: 'AIRTEL' as const, label: 'Airtel Money' },
  { code: 'MTN'    as const, label: 'MTN MoMo' },
];

const ugx = (n: number) => `UGX ${n.toLocaleString('en-UG')}`;

/** Collects the payer's mobile money number and starts an XCEL collection. */
export default function PayInvoiceModal({ invoice, show, onClose, onSuccess }: Props) {
  const { showToast } = useToast();
  const [phone, setPhone]     = useState('');
  const [network, setNetwork] = useState<'MTN' | 'AIRTEL' | ''>('');
  const [result, setResult]   = useState<PortalPaymentResult | null>(null);

  // What is still owed, not the invoice total — a part-paid invoice would
  // otherwise ask the client for the whole original amount a second time.
  const amountDue = invoice.outstandingBalance > 0 ? invoice.outstandingBalance : invoice.totalAmount;

  const pay = useMutation({
    mutationFn: () => portalApi.payInvoice(invoice.id, {
      phone:   phone.trim(),
      network: network || undefined,
    }),
    onSuccess: (data) => {
      setResult(data);
      onSuccess?.();
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Could not start the payment.'), 'danger'),
  });

  const handleClose = () => {
    if (pay.isPending) return;
    setPhone('');
    setNetwork('');
    setResult(null);
    onClose();
  };

  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header closeButton={!pay.isPending}>
        <Modal.Title className="h6 mb-0">
          {result ? 'Check your phone' : `Pay invoice ${invoice.invoiceNumber}`}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {result ? (
          <>
            <Alert variant="success" className="small mb-3">{result.message}</Alert>
            <dl className="row small mb-0">
              <dt className="col-5 text-muted fw-normal">Amount</dt>
              <dd className="col-7 fw-semibold">{ugx(result.amount)}</dd>
              <dt className="col-5 text-muted fw-normal">Network</dt>
              <dd className="col-7">{result.network}</dd>
              <dt className="col-5 text-muted fw-normal">Reference</dt>
              <dd className="col-7"><code>{result.reference}</code></dd>
            </dl>
            <p className="small text-muted mt-3 mb-0">
              The invoice updates once the payment is confirmed — that can take a
              minute after you approve it. Keep the reference in case you need to
              ask us about this payment.
            </p>
          </>
        ) : (
          <>
            <dl className="row small">
              <dt className="col-6 text-muted fw-normal">Invoice total</dt>
              <dd className="col-6 text-end">{ugx(invoice.totalAmount)}</dd>
              {invoice.paidAmount > 0 && (
                <>
                  <dt className="col-6 text-muted fw-normal">Already paid</dt>
                  <dd className="col-6 text-end text-success">− {ugx(invoice.paidAmount)}</dd>
                </>
              )}
              <dt className="col-6 fw-semibold border-top pt-2">Amount to pay</dt>
              <dd className="col-6 text-end fw-semibold border-top pt-2">{ugx(amountDue)}</dd>
            </dl>

            <Form.Group className="mb-3">
              <Form.Label className="small fw-semibold mb-1">Mobile money number</Form.Label>
              <Form.Control
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XXXXXXXX"
                disabled={pay.isPending}
              />
              <Form.Text className="text-muted">
                The number that will approve the payment. It does not have to be
                the one we hold for your account.
              </Form.Text>
            </Form.Group>

            <Form.Group>
              <Form.Label className="small fw-semibold mb-1">Network</Form.Label>
              <Form.Select
                value={network}
                onChange={(e) => setNetwork(e.target.value as 'MTN' | 'AIRTEL' | '')}
                disabled={pay.isPending}
              >
                <option value="">Work it out from my number</option>
                {NETWORKS.map((n) => <option key={n.code} value={n.code}>{n.label}</option>)}
              </Form.Select>
              <Form.Text className="text-muted">
                Only needed if we cannot tell from the number.
              </Form.Text>
            </Form.Group>
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        {result ? (
          <Button variant="primary" onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline-secondary" onClick={handleClose} disabled={pay.isPending}>
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={() => pay.mutate()}
              disabled={pay.isPending || phone.trim().length < 9}
            >
              {pay.isPending
                ? <><Spinner size="sm" animation="border" className="me-2" />Starting…</>
                : `Pay ${ugx(amountDue)}`}
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
