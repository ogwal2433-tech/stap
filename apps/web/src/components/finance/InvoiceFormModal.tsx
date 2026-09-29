import { useState, useEffect } from 'react';
import { Modal, Form, Button, Row, Col, Table, Spinner, Alert, Badge } from 'react-bootstrap';
import { useToast } from '../../context/ToastContext';
import { useClientList } from '../../hooks/useClients';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useClientContracts } from '../../hooks/useContracts';
import { SearchableSelect } from '../ui/SearchableSelect';
import { useGenerateInvoice } from '../../hooks/useFinance';
import { invoicesApi } from '../../lib/finance.api';
import { formatUgx, roundMoney } from '@stap/shared';
import type { ClientResponse, ContractResponse } from '@stap/shared';

const NAVY = '#1B3A6B';

/** Clients shown per search. Narrowing is by typing, not paging. */
const CLIENT_RESULTS = 20;
const SEARCH_DEBOUNCE_MS = 250;

interface Props {
  onClose: () => void;
}

interface EditableLineItem {
  guardType:    string;
  count:        number;
  /**
   * The text as typed, not a parsed number: a rate may carry cents (a contract's
   * monthly rate ÷ 30 rarely is whole), and a controlled number input bound to a
   * parsed value eats the decimal separator — "16666." snaps back to "16666" while
   * typing, so the next digits land as "1666667". Parse with Number() where used.
   */
  ratePerGuard: string;
  billingDays:  number;
}

function computeDays(start: string, end: string): number {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
}

export default function InvoiceFormModal({ onClose }: Props) {
  const { showToast } = useToast();
  const generateMutation = useGenerateInvoice();

  // Clients are searched on the server as the user types. This used to load one
  // unfiltered page — the first 20 by name — so every client after those could
  // not be invoiced from here at all.
  const [clientSearch, setClientSearch] = useState('');
  const searchTerm = useDebouncedValue(clientSearch.trim(), SEARCH_DEBOUNCE_MS);
  const { data: clientsRes, isLoading: clientsLoading } = useClientList({
    search:    searchTerm || undefined,
    limit:     CLIENT_RESULTS,
    sortBy:    'clientName',
    sortOrder: 'asc',
  });
  const clients     = clientsRes?.data ?? [];
  const moreClients = clientsRes?.pagination?.hasNext ?? false;

  // Held separately from clientId: once the search moves on, the chosen client
  // is no longer in `clients`, and its name must stay in the field.
  const [selectedClient, setSelectedClient] = useState<ClientResponse | null>(null);

  const [clientId,     setClientId]     = useState('');
  const [contractId,   setContractId]   = useState('');
  const [billingStart, setBillingStart] = useState('');
  const [billingEnd,   setBillingEnd]   = useState('');
  const [billingDays,  setBillingDays]  = useState(30);

  // Clients without a contract are billable too: lines are then captured by
  // hand instead of loaded from a contract preview.
  const [manualMode, setManualMode] = useState(false);

  const [lineItems,      setLineItems]      = useState<EditableLineItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError,   setPreviewError]   = useState('');

  const { data: contracts = [] } = useClientContracts(clientId);

  // Reset downstream state when client changes
  useEffect(() => {
    setContractId('');
    setManualMode(false);
    setLineItems([]);
    setPreviewError('');
  }, [clientId]);

  // Auto-load the contract's rate lines as soon as a contract is picked — no
  // button click required. billingDays is intentionally NOT a dependency:
  // once loaded, the user controls days per line (or via the Days field) themselves.
  useEffect(() => {
    if (!contractId) {
      setLineItems([]);
      setPreviewError('');
      return;
    }
    setPreviewLoading(true);
    setPreviewError('');
    invoicesApi.getInvoicePreview({ contractId, billingDays })
      .then((preview) => {
        setLineItems(preview.lineItems.map((li) => ({
          guardType:    li.guardType,
          count:        li.count,
          ratePerGuard: String(li.ratePerGuard),
          billingDays:  li.billingDays,
        })));
      })
      .catch((err: any) => {
        setPreviewError(err?.response?.data?.error ?? err.message ?? 'Failed to load rate breakdown');
        setLineItems([]);
      })
      .finally(() => setPreviewLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  const applyBillingDaysToAllLines = (days: number) => {
    setBillingDays(days);
    setLineItems((prev) => prev.map((li) => ({ ...li, billingDays: days })));
  };

  const updateLine = (idx: number, field: keyof EditableLineItem, value: number | string) => {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, [field]: value } : li)));
  };

  // Manual mode starts from nothing; each row is typed in by the user.
  const addManualLine = () => {
    setLineItems((prev) => [...prev, { guardType: '', count: 1, ratePerGuard: '', billingDays }]);
  };

  const removeLine = (idx: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const lineTotal = (li: EditableLineItem) =>
    roundMoney(li.count * (Number(li.ratePerGuard) || 0) * li.billingDays);
  const computedTotal = roundMoney(lineItems.reduce((sum, li) => sum + lineTotal(li), 0));
  const totalGuards   = lineItems.reduce((sum, li) => sum + li.count, 0);

  const selectedContract = contracts.find((c: ContractResponse) => c.id === contractId);

  // Manual lines need a name on every row before the invoice makes sense.
  const manualLinesComplete =
    lineItems.length > 0 && lineItems.every((li) => li.guardType.trim().length > 0);
  const canGenerate =
    (!!clientId || !!contractId) &&
    (!!contractId || manualMode) &&
    (!!contractId ? lineItems.length > 0 : manualLinesComplete) &&
    !!billingStart &&
    !!billingEnd &&
    !generateMutation.isPending;

  const handleGenerate = async () => {
    if (!manualMode && !contractId) {
      showToast('Select a contract, or switch on "No contract yet" to capture lines manually.', 'warning');
      return;
    }
    if (manualMode && !clientId) {
      showToast('Select the client to bill.', 'warning');
      return;
    }
    if (manualMode && !manualLinesComplete) {
      showToast('Every manual line needs a description before generating.', 'warning');
      return;
    }
    if (!contractId && lineItems.length === 0) {
      showToast('Add at least one invoice line.', 'warning');
      return;
    }
    if (!billingStart || !billingEnd) {
      showToast('Please set a billing period before generating', 'warning');
      return;
    }
    try {
      const lineItemOverrides = lineItems.map((li) => ({
        guardType:    manualMode ? li.guardType.trim() : li.guardType,
        count:        li.count,
        ratePerGuard: Number(li.ratePerGuard) || 0,
        billingDays:  li.billingDays,
      }));
      await generateMutation.mutateAsync(
        contractId
          ? {
              contractId,
              billingPeriodStart: new Date(billingStart).toISOString(),
              billingPeriodEnd:   new Date(billingEnd).toISOString(),
              billingDays,
              lineItemOverrides,
            }
          : {
              clientId,
              billingPeriodStart: new Date(billingStart).toISOString(),
              billingPeriodEnd:   new Date(billingEnd).toISOString(),
              billingDays,
              lineItemOverrides,
            },
      );
      showToast('Invoice generated successfully', 'success');
      onClose();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to generate invoice', 'danger');
    }
  };

  return (
    <Modal show onHide={onClose} size="xl">
      <Modal.Header closeButton>
        <Modal.Title>Generate Invoice</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Row className="g-3">
          {/* ── Client + Contract ── */}
          <Col md={6}>
            <Form.Group>
              <Form.Label className="fw-semibold small">Client <span className="text-danger">*</span></Form.Label>
              <SearchableSelect
                options={clients.map((c: ClientResponse) => ({
                  value:    c.id,
                  label:    c.clientName,
                  sublabel: c.systemId ?? undefined,
                }))}
                value={clientId}
                selectedLabel={selectedClient?.clientName}
                onChange={(id) => {
                  // The contract, rate lines and preview reset through the
                  // clientId effect above, for a new pick and a clear alike.
                  setClientId(id);
                  setSelectedClient(id ? clients.find((c) => c.id === id) ?? null : null);
                }}
                onSearchChange={setClientSearch}
                isLoading={clientsLoading}
                clearable
                ariaLabel="Client"
                placeholder="Search and select a client…"
                searchPlaceholder="Type a client name, contact or ID…"
                emptyText={clientSearch.trim() ? `No clients match "${clientSearch.trim()}"` : 'No clients yet'}
                footer={moreClients && (
                  <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>
                    Showing the first {CLIENT_RESULTS} — keep typing to narrow the list
                  </div>
                )}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group>
              <Form.Label className="fw-semibold small">
                Contract {!manualMode && <span className="text-danger">*</span>}
              </Form.Label>
              <Form.Select
                value={contractId}
                onChange={(e) => setContractId(e.target.value)}
                disabled={!clientId || manualMode}
              >
                <option value="">{clientId ? 'Select contract…' : 'Select client first'}</option>
                {contracts.map((c: ContractResponse) => (
                  <option key={c.id} value={c.id}>
                    {c.id.slice(-8).toUpperCase()} — {c.status} — UGX {c.totalMonthlyValue.toLocaleString()}/mo ({c.guardsRequired} guards)
                  </option>
                ))}
              </Form.Select>
              <Form.Check
                type="switch"
                id="manual-lines-switch"
                label="No contract yet — capture invoice lines manually"
                checked={manualMode}
                disabled={!clientId}
                onChange={(e) => {
                  setManualMode(e.target.checked);
                  // The two sources are mutually exclusive: switching clears
                  // the other one's lines so nothing stale is sent.
                  if (e.target.checked) setContractId('');
                  else setLineItems([]);
                }}
                className="mt-2"
              />
            </Form.Group>
          </Col>

          {/* ── Contract summary ── */}
          {selectedContract && (
            <Col md={12}>
              <div style={{ background: '#D6E0F0', borderRadius: '0.5rem', padding: '10px 14px', fontSize: '0.82rem' }}>
                <div className="fw-bold" style={{ color: NAVY }}>
                  {selectedContract.id.slice(-8).toUpperCase()}{' · '}
                  <Badge bg="success" style={{ fontSize: '0.7rem' }}>{selectedContract.status}</Badge>
                </div>
                <div className="text-muted small mt-1">
                  {selectedContract.guardsRequired} guard(s) · {selectedContract.guardRates.length} rate line(s) configured
                  {' · '}UGX {selectedContract.totalMonthlyValue.toLocaleString()}/mo
                </div>
              </div>
            </Col>
          )}

          {/* ── Billing Period + Days ── */}
          {(contractId || manualMode) && (
            <>
              <Col md={5}>
                <Form.Label className="fw-semibold small">Billing Period Start <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="date"
                  value={billingStart}
                  onChange={(e) => {
                    setBillingStart(e.target.value);
                    if (billingEnd) applyBillingDaysToAllLines(computeDays(e.target.value, billingEnd));
                  }}
                />
              </Col>
              <Col md={5}>
                <Form.Label className="fw-semibold small">Billing Period End <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="date"
                  value={billingEnd}
                  min={billingStart}
                  onChange={(e) => {
                    setBillingEnd(e.target.value);
                    if (billingStart) applyBillingDaysToAllLines(computeDays(billingStart, e.target.value));
                  }}
                />
              </Col>
              <Col md={2}>
                <Form.Label className="fw-semibold small">Days</Form.Label>
                <Form.Control
                  type="number"
                  min={1}
                  value={billingDays}
                  onChange={(e) => applyBillingDaysToAllLines(parseInt(e.target.value, 10) || 30)}
                />
              </Col>
            </>
          )}

          {/* ── Preview error ── */}
          {previewError && (
            <Col md={12}>
              <Alert variant="warning" className="small py-2">{previewError}</Alert>
            </Col>
          )}

          {/* ── Rate lines (from contract preview, or captured manually) ── */}
          <Col md={12}>
            {manualMode ? (
              <div>
                <div className="fw-bold small text-muted mb-2">
                  Invoice Line Items
                  <span className="text-muted fw-normal ms-1">(captured manually — no contract)</span>
                </div>
                {lineItems.length === 0 ? (
                  <Alert variant="info" className="small py-2">
                    No lines yet — add each charge the client owes for this period.
                  </Alert>
                ) : (
                  <Table size="sm" bordered className="mb-2">
                    <thead style={{ background: '#F2F4F7' }}>
                      <tr>
                        <th>Description / Guard Type</th>
                        <th style={{ width: 70 }}>Count</th>
                        <th style={{ width: 130 }}>Rate / Guard (UGX)</th>
                        <th style={{ width: 70 }}>Days</th>
                        <th style={{ width: 130 }}>Line Total</th>
                        <th style={{ width: 40 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((li, idx) => (
                        <tr key={idx}>
                          <td>
                            <Form.Control
                              size="sm"
                              placeholder="e.g. Night guard, 12th–30th Sept"
                              value={li.guardType}
                              onChange={(e) => updateLine(idx, 'guardType', e.target.value)}
                            />
                          </td>
                          <td>
                            <Form.Control
                              size="sm" type="number" min={1}
                              value={li.count}
                              onChange={(e) => updateLine(idx, 'count', parseInt(e.target.value, 10) || 1)}
                              style={{ textAlign: 'center' }}
                            />
                          </td>
                          <td>
                            <Form.Control
                              size="sm" type="number" min={0} step="0.01" placeholder="e.g. 16666.67"
                              value={li.ratePerGuard}
                              onChange={(e) => updateLine(idx, 'ratePerGuard', e.target.value)}
                            />
                          </td>
                          <td>
                            <Form.Control
                              size="sm" type="number" min={1}
                              value={li.billingDays}
                              onChange={(e) => updateLine(idx, 'billingDays', parseInt(e.target.value, 10) || 30)}
                              style={{ textAlign: 'center' }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, verticalAlign: 'middle', color: NAVY, fontSize: '0.85rem' }}>
                            {formatUgx(lineTotal(li))}
                          </td>
                          <td className="text-center align-middle" style={{ width: 40 }}>
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                              title="Remove this line"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#D0EDE9' }}>
                        <td colSpan={2} style={{ fontWeight: 600, color: '#0F7B6C', fontSize: '0.82rem' }}>
                          Total Guards: {totalGuards}
                        </td>
                        <td colSpan={2} style={{ fontWeight: 600, color: '#0F7B6C', fontSize: '0.82rem' }}>
                          Total:
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', color: '#0F7B6C' }}>
                          {formatUgx(computedTotal)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </Table>
                )}
                <Button size="sm" variant="outline-primary" onClick={addManualLine}>
                  <i className="bi bi-plus-lg me-1" />Add line
                </Button>
              </div>
            ) : !contractId ? (
              <div style={{
                border: '2px dashed #ced4da', borderRadius: '0.375rem', padding: '24px',
                textAlign: 'center', color: '#6c757d', fontSize: '0.82rem',
              }}>
                Select a client and contract above to load the rate breakdown
                {clientId ? ', or flip the switch below the contract field to capture lines manually' : ''}
              </div>
            ) : previewLoading ? (
              <div className="text-center py-3 text-muted">
                <Spinner size="sm" className="me-2" />Loading rate breakdown...
              </div>
            ) : lineItems.length === 0 ? (
              !previewError && (
                <Alert variant="warning" className="small py-2">
                  This contract has no guard rate lines. Edit the contract to add rate lines before generating an invoice.
                </Alert>
              )
            ) : (
              <div>
                <div className="fw-bold small text-muted mb-2">
                  Invoice Line Items
                  <span className="text-muted fw-normal ms-1">(editable before generating)</span>
                </div>
                <Table size="sm" bordered className="mb-2">
                  <thead style={{ background: '#F2F4F7' }}>
                    <tr>
                      <th>Guard Type</th>
                      <th style={{ width: 70 }}>Count</th>
                      <th style={{ width: 130 }}>Rate / Guard (UGX)</th>
                      <th style={{ width: 70 }}>Days</th>
                      <th style={{ width: 130 }}>Line Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((li, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 500, verticalAlign: 'middle', fontSize: '0.85rem' }}>
                          {li.guardType}
                        </td>
                        <td>
                          <Form.Control
                            size="sm" type="number" min={1}
                            value={li.count}
                            onChange={(e) => updateLine(idx, 'count', parseInt(e.target.value, 10) || 1)}
                            style={{ textAlign: 'center' }}
                          />
                        </td>
                        <td>
                          <Form.Control
                            size="sm" type="number" min={0} step="0.01" placeholder="e.g. 16666.67"
                            value={li.ratePerGuard}
                            onChange={(e) => updateLine(idx, 'ratePerGuard', e.target.value)}
                          />
                        </td>
                        <td>
                          <Form.Control
                            size="sm" type="number" min={1}
                            value={li.billingDays}
                            onChange={(e) => updateLine(idx, 'billingDays', parseInt(e.target.value, 10) || 30)}
                            style={{ textAlign: 'center' }}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, verticalAlign: 'middle', color: NAVY, fontSize: '0.85rem' }}>
                          {formatUgx(lineTotal(li))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#D0EDE9' }}>
                      <td colSpan={2} style={{ fontWeight: 600, color: '#0F7B6C', fontSize: '0.82rem' }}>
                        Total Guards: {totalGuards}
                      </td>
                      <td colSpan={2} style={{ fontWeight: 600, color: '#0F7B6C', fontSize: '0.82rem' }}>
                        Total:
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', color: '#0F7B6C' }}>
                        {formatUgx(computedTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </Table>
              </div>
            )}
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <div className="d-flex align-items-center justify-content-between w-100">
          <div style={{ fontSize: '0.82rem', color: '#6c757d' }}>
            {lineItems.length > 0 && (
              <>{totalGuards} guard(s) · <strong>{formatUgx(computedTotal)}</strong> total</>
            )}
          </div>
          <div className="d-flex gap-2">
            <Button variant="outline-secondary" onClick={onClose} disabled={generateMutation.isPending}>
              Cancel
            </Button>
            <Button
              style={{ background: NAVY, borderColor: NAVY }}
              disabled={!canGenerate}
              onClick={handleGenerate}
            >
              {generateMutation.isPending ? <><Spinner size="sm" className="me-1" />Generating…</> : 'Generate Invoice'}
            </Button>
          </div>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
