import { useEffect, useState } from 'react';
import { Alert, Button, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';
import { useInvoice, useUpdateInvoice } from '../../hooks/useFinance';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';
import { formatUgx as fmtUGX, isTwoDpOrWhole, roundMoney } from '@security360/shared';
import type { InvoiceResponse } from '@security360/shared';

const NAVY = '#1B3A6B';

/** YYYY-MM-DD for a <input type="date">, read in UTC because the API stores UTC midnights. */
const toDateInput = (iso: string) => new Date(iso).toISOString().slice(0, 10);

/** datetime() in the shared schema, so send full ISO strings. */
const toIso = (day: string) => new Date(day).toISOString();

/**
 * `ratePerGuard` holds the text as typed, not a parsed number: a rate may carry
 * cents (a contract's monthly rate ÷ 30 rarely is whole), and a controlled number
 * input bound to a parsed value eats the decimal separator — "16666." snaps back to
 * "16666" while typing, so the next digits land as "1666667". Parse with Number()
 * where used, as InvoiceFormModal does.
 */
type Line = { description: string; guardsCount: number; ratePerGuard: string };

const rateOf = (l: Line) => Number(l.ratePerGuard) || 0;

const lineAmount = (l: Line) => roundMoney(l.guardsCount * rateOf(l));

/** An emptied number field parses to NaN; keep it at 0 so totals stay readable. */
const toNum = (v: string) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? 0 : n;
};

/**
 * Edits a still-PENDING invoice: billing period, due date and line items.
 * The server rejects anything past PENDING, so the list only offers this
 * action on that status; a later invoice is corrected with Add Fees or by
 * voiding and reissuing rather than by rewriting it here.
 */
export default function InvoiceEditModal({
  invoice,
  onClose,
}: {
  invoice: InvoiceResponse;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const updateMutation = useUpdateInvoice();
  // The list rows carry no line items, so seed the editor from the full record.
  const { data: full, isLoading } = useInvoice(invoice.id);

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd,   setPeriodEnd]   = useState('');
  const [dueDate,     setDueDate]     = useState('');
  const [lines,       setLines]       = useState<Line[]>([]);

  useEffect(() => {
    if (!full) return;
    setPeriodStart(toDateInput(full.periodStart));
    setPeriodEnd(toDateInput(full.periodEnd));
    setDueDate(toDateInput(full.dueDate));
    setLines(full.lineItems.map((li) => ({
      description:  li.description,
      guardsCount:  li.quantity,
      ratePerGuard: String(li.ratePerDay),
    })));
  }, [full?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const updateLine = (idx: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const addLine = () =>
    setLines((prev) => [...prev, { description: '', guardsCount: 1, ratePerGuard: '' }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const ratesWithinTwoDecimals = lines.every((l) => isTwoDpOrWhole(rateOf(l)));
  const linesValid = lines.length > 0
    && ratesWithinTwoDecimals
    && lines.every((l) => l.description.trim().length > 0
      && Number.isInteger(l.guardsCount) && l.guardsCount >= 1
      && Number.isFinite(rateOf(l)) && rateOf(l) >= 0);
  const datesValid = !!periodStart && !!periodEnd && !!dueDate && periodStart <= periodEnd;
  const canSave = !isLoading && linesValid && datesValid && !updateMutation.isPending;

  const subtotal = roundMoney(lines.reduce((sum, l) => sum + lineAmount(l), 0));
  // Tax is not editable here — it is set when the invoice is raised, and the
  // service adds it back to whatever lines are stored.
  const total = roundMoney(subtotal + (full?.taxAmount ?? invoice.taxAmount));

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await updateMutation.mutateAsync({
        id:   invoice.id,
        data: {
          periodStart: toIso(periodStart),
          periodEnd:   toIso(periodEnd),
          dueDate:     toIso(dueDate),
          lineItems:   lines.map((l) => ({
            description:  l.description.trim(),
            guardType:    l.description.trim(),
            guardsCount:  l.guardsCount,
            ratePerGuard: rateOf(l),
            days:         30,
          })),
        },
      });
      showToast(`Invoice ${invoice.invoiceNumber} updated.`, 'success');
      onClose();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not update the invoice.'), 'danger');
    }
  };

  return (
    <Modal show onHide={onClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title className="h6 fw-bold" style={{ color: NAVY }}>
          Edit Invoice {invoice.invoiceNumber}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isLoading ? (
          <div className="text-center py-4"><Spinner size="sm" className="me-2" />Loading invoice…</div>
        ) : (
          <>
            <Row className="g-2 mb-3">
              <Col md={4}>
                <Form.Label className="fw-semibold small">Period Start</Form.Label>
                <Form.Control type="date" size="sm" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
              </Col>
              <Col md={4}>
                <Form.Label className="fw-semibold small">Period End</Form.Label>
                <Form.Control type="date" size="sm" min={periodStart} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
              </Col>
              <Col md={4}>
                <Form.Label className="fw-semibold small">Due Date</Form.Label>
                <Form.Control type="date" size="sm" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </Col>
            </Row>

            {!datesValid && (
              <Alert variant="warning" className="small py-2">
                Billing period start must be on or before its end, and all three dates are required.
              </Alert>
            )}

            {!ratesWithinTwoDecimals && (
              <Alert variant="warning" className="small py-2">
                A rate / day can carry at most two decimal places — e.g. 16666.67.
              </Alert>
            )}

            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="fw-semibold small text-uppercase text-muted">Invoice lines</span>
              <Button size="sm" variant="outline-primary" onClick={addLine}>+ Add line</Button>
            </div>

            <Table size="sm" bordered className="mb-2">
              <thead style={{ background: '#F2F4F7' }}>
                <tr>
                  <th>Description</th>
                  <th style={{ width: 80 }} className="text-center">Qty</th>
                  <th style={{ width: 170 }} className="text-end">Rate / guard / month</th>
                  <th style={{ width: 130 }} className="text-end">Line total</th>
                  <th style={{ width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-muted small py-3">No lines — add at least one.</td></tr>
                ) : lines.map((l, idx) => (
                  <tr key={idx}>
                    <td>
                      <Form.Control
                        size="sm"
                        value={l.description}
                        placeholder="e.g. Security Guard — Ultra Market"
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                      />
                    </td>
                    <td>
                      <Form.Control
                        size="sm" type="number" min={1} className="text-center"
                        value={l.guardsCount}
                        onChange={(e) => updateLine(idx, { guardsCount: toNum(e.target.value) })}
                      />
                    </td>
                    <td>
                      <Form.Control
                        size="sm" type="number" min={0} step="0.01" className="text-end"
                        value={l.ratePerGuard}
                        onChange={(e) => updateLine(idx, { ratePerGuard: e.target.value })}
                      />
                    </td>
                    <td className="text-end small fw-semibold align-middle">{fmtUGX(lineAmount(l))}</td>
                    <td className="text-center align-middle">
                      <Button
                        size="sm" variant="link" className="text-danger p-0"
                        onClick={() => removeLine(idx)} title="Remove line"
                      >×</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8f9fa' }}>
                  <td colSpan={3} className="text-end fw-semibold small">Subtotal</td>
                  <td className="text-end fw-semibold small">{fmtUGX(subtotal)}</td>
                  <td />
                </tr>
                {(full?.taxAmount ?? invoice.taxAmount) > 0 && (
                  <tr style={{ background: '#f8f9fa' }}>
                    <td colSpan={3} className="text-end fw-semibold small">Tax</td>
                    <td className="text-end fw-semibold small">{fmtUGX(full?.taxAmount ?? invoice.taxAmount)}</td>
                    <td />
                  </tr>
                )}
                <tr style={{ background: '#D0EDE9' }}>
                  <td colSpan={4} className="text-end fw-bold small">Total</td>
                  <td className="text-end fw-bold" style={{ color: '#0F7B6C' }}>{fmtUGX(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </Table>

            <div className="small text-muted">
              Client {invoice.clientName} · Replacing these lines rewrites the invoice total; nothing has been paid against a PENDING invoice.
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <Button
          size="sm" style={{ background: NAVY, borderColor: NAVY }}
          disabled={!canSave} onClick={handleSave}
        >
          {updateMutation.isPending ? <><Spinner size="sm" className="me-1" />Saving…</> : 'Save changes'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
