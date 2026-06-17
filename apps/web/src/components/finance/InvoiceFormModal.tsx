import { useState, useEffect } from 'react';
import { Modal, Form, Button, Row, Col, Table, Spinner, Alert } from 'react-bootstrap';
import { useToast } from '../../context/ToastContext';
import { useClientList } from '../../hooks/useClients';
import { useClientContracts } from '../../hooks/useContracts';
import { useGenerateInvoice } from '../../hooks/useFinance';
import { invoicesApi } from '../../lib/finance.api';
import type { ClientResponse, ContractResponse, InvoiceLineItemResponse } from '@stap/shared';

const NAVY = '#1B3A6B';

interface Props {
  onClose: () => void;
}

type SourceMode = 'ACTUAL_GUARDS' | 'CONTRACT_RATES';

interface EditableLineItem {
  guardId:     string | null;
  description: string;
  quantity:    number;
  ratePerDay:  number;
  days:        number;
}

export default function InvoiceFormModal({ onClose }: Props) {
  const { showToast } = useToast();
  const generateMutation = useGenerateInvoice();

  const { data: clientsRes } = useClientList();
  const clients = clientsRes?.data ?? [];

  const [clientId,      setClientId]      = useState('');
  const [contractId,    setContractId]    = useState('');
  const [sourceMode,    setSourceMode]    = useState<SourceMode>('ACTUAL_GUARDS');
  const [billingDays,   setBillingDays]   = useState(30);
  const [periodStart,   setPeriodStart]   = useState('');
  const [periodEnd,     setPeriodEnd]     = useState('');

  const [preview,       setPreview]       = useState<{ clientName: string; totalAmount: number } | null>(null);
  const [lineItems,     setLineItems]     = useState<EditableLineItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError,   setPreviewError]   = useState('');

  const { data: contracts = [] } = useClientContracts(clientId);

  // Reset downstream state when selection changes
  useEffect(() => {
    setContractId('');
    setPreview(null);
    setLineItems([]);
    setPreviewError('');
  }, [clientId]);

  useEffect(() => {
    setPreview(null);
    setLineItems([]);
    setPreviewError('');
  }, [contractId, sourceMode]);

  const handleLoadPreview = async () => {
    if (!contractId) return;
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const result = await invoicesApi.getInvoicePreview({ contractId, sourceMode, billingDays });
      setPreview({ clientName: result.clientName, totalAmount: result.totalAmount });
      setLineItems(
        result.lineItems.map((li: InvoiceLineItemResponse) => ({
          guardId:     li.guardId,
          description: li.description,
          quantity:    li.quantity,
          ratePerDay:  li.ratePerDay,
          days:        li.days,
        })),
      );
    } catch (err: any) {
      setPreviewError(err?.response?.data?.error ?? err.message ?? 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  const updateLineItem = (idx: number, field: keyof EditableLineItem, value: number | string) => {
    setLineItems((prev) =>
      prev.map((li, i) => (i === idx ? { ...li, [field]: value } : li)),
    );
  };

  const computedTotal = lineItems.reduce(
    (sum, li) => sum + li.quantity * li.ratePerDay * li.days,
    0,
  );

  const handleGenerate = async () => {
    if (!contractId || lineItems.length === 0) return;
    if (!periodStart || !periodEnd) {
      showToast('Please set a billing period before generating', 'warning');
      return;
    }
    try {
      await generateMutation.mutateAsync({
        contractId,
        billingPeriodStart: new Date(periodStart).toISOString(),
        billingPeriodEnd:   new Date(periodEnd).toISOString(),
        sourceMode,
        lineItemOverrides: lineItems.map((li) => ({ ...li, guardId: li.guardId ?? undefined })),
      });
      showToast('Invoice generated successfully', 'success');
      onClose();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to generate invoice', 'danger');
    }
  };

  const selectedContract = contracts.find((c: ContractResponse) => c.id === contractId);

  return (
    <Modal show onHide={onClose} size="xl">
      <Modal.Header closeButton>
        <Modal.Title>Generate Invoice</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Row className="g-3">
          {/* ── Step 1: Client + Contract ── */}
          <Col md={6}>
            <Form.Group>
              <Form.Label className="fw-semibold small">Client <span className="text-danger">*</span></Form.Label>
              <Form.Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Select client…</option>
                {clients.map((c: ClientResponse) => (
                  <option key={c.id} value={c.id}>{c.clientName}</option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label className="fw-semibold small">Contract <span className="text-danger">*</span></Form.Label>
              <Form.Select value={contractId} onChange={(e) => setContractId(e.target.value)} disabled={!clientId}>
                <option value="">{clientId ? 'Select contract…' : 'Select client first'}</option>
                {contracts.map((c: ContractResponse) => (
                  <option key={c.id} value={c.id}>
                    {c.id.slice(-8).toUpperCase()} — {c.status} — UGX {c.billingPerGuard.toLocaleString()}/guard
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Col>

          {/* ── Step 2: Source Mode ── */}
          {contractId && (
            <Col md={12}>
              <Form.Label className="fw-semibold small">Rate Source</Form.Label>
              <div className="d-flex gap-2">
                {(['ACTUAL_GUARDS', 'CONTRACT_RATES'] as SourceMode[]).map((mode) => {
                  const active = sourceMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setSourceMode(mode)}
                      style={{
                        flex: 1, padding: '10px',
                        border: `2px solid ${active ? NAVY : '#ced4da'}`,
                        borderRadius: '0.5rem',
                        background: active ? '#D6E0F0' : '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                        {mode === 'ACTUAL_GUARDS' ? 'Actual Deployed Guards' : 'Contract Rate Table'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                        {mode === 'ACTUAL_GUARDS'
                          ? "Uses each guard's real billing rate — one line per guard"
                          : "Uses guard-type rates set on the contract"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Col>
          )}

          {/* ── Step 3: Billing Days + Load Preview ── */}
          {contractId && (
            <Col md={12} className="d-flex align-items-end gap-3">
              <Form.Group style={{ width: 160 }}>
                <Form.Label className="fw-semibold small">Billing Days</Form.Label>
                <Form.Control
                  type="number" min={1} max={31}
                  value={billingDays}
                  onChange={(e) => setBillingDays(parseInt(e.target.value) || 30)}
                />
              </Form.Group>
              <Button
                variant="outline-primary"
                onClick={handleLoadPreview}
                disabled={previewLoading}
                style={{ marginBottom: 1 }}
              >
                {previewLoading ? <><Spinner size="sm" className="me-1" />Loading rates…</> : 'Load Rate Breakdown'}
              </Button>
              {preview && (
                <div className="ms-auto text-muted small">
                  Client: <strong>{preview.clientName}</strong>
                </div>
              )}
            </Col>
          )}

          {/* ── Preview error ── */}
          {previewError && (
            <Col md={12}>
              <Alert variant="warning" className="small py-2">{previewError}</Alert>
            </Col>
          )}

          {/* ── Step 4: Editable line items ── */}
          {lineItems.length > 0 && (
            <Col md={12}>
              <div className="fw-semibold small mb-2">Guard Rate Breakdown <span className="text-muted fw-normal">(edit rates before generating)</span></div>
              <Table size="sm" bordered className="mb-0">
                <thead style={{ background: '#f8f9fa' }}>
                  <tr>
                    <th>Guard / Type</th>
                    <th style={{ width: 70 }}>Qty</th>
                    <th style={{ width: 120 }}>Rate/Day (UGX)</th>
                    <th style={{ width: 70 }}>Days</th>
                    <th style={{ width: 120 }} className="text-end">Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, idx) => (
                    <tr key={idx}>
                      <td className="align-middle small">{li.description}</td>
                      <td>
                        <Form.Control
                          size="sm" type="number" min={1}
                          value={li.quantity}
                          onChange={(e) => updateLineItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                        />
                      </td>
                      <td>
                        <Form.Control
                          size="sm" type="number" min={0}
                          value={li.ratePerDay}
                          onChange={(e) => updateLineItem(idx, 'ratePerDay', parseInt(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <Form.Control
                          size="sm" type="number" min={1}
                          value={li.days}
                          onChange={(e) => updateLineItem(idx, 'days', parseInt(e.target.value) || 30)}
                        />
                      </td>
                      <td className="text-end fw-bold align-middle small">
                        UGX {(li.quantity * li.ratePerDay * li.days).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f8f9fa' }}>
                    <td colSpan={4} className="text-end fw-bold">TOTAL:</td>
                    <td className="text-end fw-bold" style={{ color: NAVY }}>
                      UGX {computedTotal.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </Table>
            </Col>
          )}

          {/* ── Step 5: Billing Period ── */}
          {lineItems.length > 0 && (
            <>
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="fw-semibold small">Billing Period Start <span className="text-danger">*</span></Form.Label>
                  <Form.Control type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="fw-semibold small">Billing Period End <span className="text-danger">*</span></Form.Label>
                  <Form.Control type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
                </Form.Group>
              </Col>
            </>
          )}

          {/* ── Contract info hint ── */}
          {selectedContract && (
            <Col md={12}>
              <div className="small text-muted p-2 rounded" style={{ background: '#f8f9fa' }}>
                Contract flat rate: UGX {selectedContract.billingPerGuard.toLocaleString()}/guard · {selectedContract.guardsRequired} guard(s) required
                {selectedContract.guardRates.length > 0 && ` · ${selectedContract.guardRates.length} rate category(s) configured`}
              </div>
            </Col>
          )}
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={generateMutation.isPending}>Cancel</Button>
        <Button
          style={{ background: NAVY, borderColor: NAVY }}
          disabled={lineItems.length === 0 || generateMutation.isPending || !periodStart || !periodEnd}
          onClick={handleGenerate}
        >
          {generateMutation.isPending ? <><Spinner size="sm" className="me-1" />Generating…</> : 'Generate Invoice'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
