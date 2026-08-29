import { useState, useEffect } from 'react';
import { Modal, Form, Button, Spinner, Alert, Badge } from 'react-bootstrap';
import { useToast } from '../../context/ToastContext';
import { useInitiatePayment, usePaymentStatus } from '../../hooks/usePayments';
import { useQueryClient } from '@tanstack/react-query';
import type { InvoiceResponse } from '@stap/shared';

const NAVY = '#1B3A6B';

const MTN_PREFIXES    = ['77', '78', '76', '39'];
const AIRTEL_PREFIXES = ['70', '75', '74'];

function detectNetwork(phone: string): 'MTN' | 'AIRTEL' | null {
  const digits = phone.replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('256')) local = local.slice(3);
  if (local.startsWith('0'))   local = local.slice(1);
  const prefix = local.slice(0, 2);
  if (MTN_PREFIXES.includes(prefix))    return 'MTN';
  if (AIRTEL_PREFIXES.includes(prefix)) return 'AIRTEL';
  return null;
}

function networkBadge(network: 'MTN' | 'AIRTEL' | null) {
  if (!network) return null;
  return (
    <Badge bg={network === 'MTN' ? 'warning' : 'danger'} text={network === 'MTN' ? 'dark' : 'white'} className="ms-2">
      {network === 'MTN' ? 'MTN Mobile Money' : 'Airtel Money'}
    </Badge>
  );
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING:   'warning',
    SUCCESS:   'success',
    FAILED:    'danger',
    CANCELLED: 'secondary',
  };
  return <Badge bg={map[status] ?? 'secondary'}>{status}</Badge>;
}

type Stage = 'form' | 'pending' | 'result';

interface Props {
  invoice: InvoiceResponse;
  onClose: () => void;
}

export default function PayInvoiceModal({ invoice, onClose }: Props) {
  const amountDue = invoice.outstandingBalance ?? invoice.totalAmount;
  const { showToast } = useToast();
  const qc            = useQueryClient();
  const initiateMut   = useInitiatePayment();

  const [stage,        setStage]        = useState<Stage>('form');
  const [phone,        setPhone]        = useState('');
  const [extReference, setExtReference] = useState('');
  const [finalStatus,  setFinalStatus]  = useState('');

  const network   = detectNetwork(phone);
  const isPending = stage === 'pending';

  const { data: statusData, refetch: refetchStatus } = usePaymentStatus(extReference, isPending);

  useEffect(() => {
    if (!statusData) return;
    if (statusData.status === 'SUCCESS') {
      setFinalStatus('SUCCESS');
      setStage('result');
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['invoice-payments', invoice.id] });
    } else if (statusData.status === 'FAILED' || statusData.status === 'CANCELLED') {
      setFinalStatus(statusData.status);
      setStage('result');
    }
  }, [statusData, invoice.id, qc]);

  const handleSubmit = async () => {
    if (!phone) {
      showToast('Please enter a phone number', 'warning');
      return;
    }
    try {
      const result = await initiateMut.mutateAsync({ invoiceId: invoice.id, phone });
      setExtReference(result.extReference);
      setStage('pending');
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to initiate payment', 'danger');
    }
  };

  const handleCheckStatus = () => refetchStatus();

  const handleClose = () => {
    if (stage === 'pending') {
      showToast('Payment is still pending — you can check status later from the invoice list', 'info');
    }
    onClose();
  };

  return (
    <Modal show onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Pay via Mobile Money</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {stage === 'form' && (
          <>
            <div className="mb-3 p-3 rounded" style={{ background: '#f8f9fa' }}>
              <div className="small text-muted">Invoice</div>
              <div className="fw-semibold">{invoice.invoiceNumber} — {invoice.clientName}</div>
              {/* The amount that will actually be collected: the balance owed,
                  not the invoice total. A part-paid invoice was quoting — and
                  charging — the whole original amount a second time. */}
              <div className="fw-bold mt-1" style={{ color: NAVY }}>UGX {amountDue.toLocaleString()}</div>
              {(invoice.paidAmount ?? 0) > 0 && (
                <div className="small text-muted">
                  of UGX {invoice.totalAmount.toLocaleString()} total ·{' '}
                  <span style={{ color: '#1E8449' }}>
                    UGX {(invoice.paidAmount ?? 0).toLocaleString()} already paid
                  </span>
                </div>
              )}
            </div>

            <Form.Group>
              <Form.Label className="fw-semibold small">
                Mobile Money Number
                {networkBadge(network)}
              </Form.Label>
              <Form.Control
                type="tel"
                placeholder="e.g. 0770000000 or 256770000000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
              <Form.Text className="text-muted">
                MTN: 077x, 078x, 076x, 039x &nbsp;|&nbsp; Airtel: 070x, 075x, 074x
              </Form.Text>
            </Form.Group>

            {network && (
              <Alert variant={network === 'MTN' ? 'warning' : 'danger'} className="mt-3 small py-2">
                A {network === 'MTN' ? 'MTN Mobile Money' : 'Airtel Money'} prompt will be sent to <strong>{phone}</strong>. Please approve it on your phone.
              </Alert>
            )}
          </>
        )}

        {stage === 'pending' && (
          <div className="text-center py-4">
            <Spinner animation="border" style={{ color: NAVY }} className="mb-3" />
            <h6 className="fw-semibold">Waiting for payment approval…</h6>
            <p className="small text-muted mb-1">
              A payment prompt has been sent to <strong>{phone}</strong>.
            </p>
            <p className="small text-muted">
              Please approve the payment on your phone. This page will update automatically.
            </p>
            <div className="mt-3 p-2 rounded bg-light small">
              Ref: <code>{extReference}</code>
            </div>
          </div>
        )}

        {stage === 'result' && (
          <div className="text-center py-4">
            {finalStatus === 'SUCCESS' ? (
              <>
                <div style={{ fontSize: '3rem' }}>✅</div>
                <h5 className="fw-bold mt-2" style={{ color: '#27ae60' }}>Payment Successful</h5>
                <p className="small text-muted">
                  UGX {amountDue.toLocaleString()} received. Invoice {invoice.invoiceNumber} is now marked as PAID.
                </p>
              </>
            ) : (
              <>
                <div style={{ fontSize: '3rem' }}>❌</div>
                <h5 className="fw-bold mt-2 text-danger">Payment {finalStatus === 'CANCELLED' ? 'Cancelled' : 'Failed'}</h5>
                {statusData?.failureReason && (
                  <p className="small text-muted">{statusData.failureReason}</p>
                )}
                <p className="small text-muted">You may try again with the same or a different number.</p>
              </>
            )}
            <div className="mt-2">{statusBadge(finalStatus)}</div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        {stage === 'form' && (
          <>
            <Button variant="secondary" onClick={handleClose}>Cancel</Button>
            <Button
              style={{ background: NAVY, borderColor: NAVY }}
              onClick={handleSubmit}
              disabled={!phone || initiateMut.isPending}
            >
              {initiateMut.isPending ? <><Spinner size="sm" className="me-1" />Initiating…</> : 'Send Payment Prompt'}
            </Button>
          </>
        )}
        {stage === 'pending' && (
          <>
            <Button variant="outline-secondary" onClick={handleClose}>Close (keep pending)</Button>
            <Button variant="outline-primary" onClick={handleCheckStatus}>Check Status</Button>
          </>
        )}
        {stage === 'result' && (
          <>
            {finalStatus !== 'SUCCESS' && (
              <Button variant="outline-primary" onClick={() => { setStage('form'); setExtReference(''); }}>
                Try Again
              </Button>
            )}
            <Button style={{ background: NAVY, borderColor: NAVY }} onClick={handleClose}>
              {finalStatus === 'SUCCESS' ? 'Done' : 'Close'}
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
