import { useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { REQUISITION_CATEGORY_LIST, type AccountabilityResponse } from '@security360/shared';
import { useSubmitAccountability } from '../../hooks/useRequisitions';
import { getApiErrorMessage } from '../../lib/api';

interface Row {
  key:             string;
  requisitionItem: string;
  category:        string;
  quantity:        number | '';
  rate:            number | '';
}

const newRow = (): Row => ({
  key: Math.random().toString(36).slice(2),
  requisitionItem: '', category: '', quantity: 1, rate: '',
});

const CELL: React.CSSProperties = {
  width: '100%', padding: '4px 7px', border: '1px solid #ced4da',
  borderRadius: '0.375rem', fontSize: '0.82rem',
};

interface Props {
  requisitionId:  string;
  requisitionAmount: number;
  /** Existing lines, when correcting a breakdown that has not yet been approved. */
  existing?:      AccountabilityResponse | null;
  onClose:   () => void;
  onSuccess: () => void;
}

export default function AccountabilityFormModal({
  requisitionId, requisitionAmount, existing, onClose, onSuccess,
}: Props) {
  const [rows, setRows] = useState<Row[]>(() =>
    existing?.items.length
      ? existing.items.map(i => ({
          key: i.id, requisitionItem: i.requisitionItem,
          category: i.category, quantity: i.quantity, rate: i.rate,
        }))
      : [newRow()],
  );
  const [error, setError] = useState('');

  const submit = useSubmitAccountability(requisitionId);

  const patch = (key: string, changes: Partial<Row>) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...changes } : r)));

  const lineTotal = (r: Row) => (Number(r.quantity) || 0) * (Number(r.rate) || 0);
  const grandTotal = rows.reduce((sum, r) => sum + lineTotal(r), 0);
  const variance = grandTotal - requisitionAmount;

  const save = () => {
    const incomplete = rows.some(
      r => !r.requisitionItem.trim() || !r.category.trim() || !r.quantity || r.rate === '',
    );
    if (incomplete) {
      setError('Every line needs an item, category, quantity and rate.');
      return;
    }
    setError('');
    submit.mutate(
      {
        items: rows.map(r => ({
          requisitionItem: r.requisitionItem.trim(),
          category:        r.category.trim(),
          quantity:        Number(r.quantity),
          rate:            Number(r.rate),
        })),
      },
      {
        onSuccess: () => { onSuccess(); onClose(); },
        onError:   (err) => setError(getApiErrorMessage(err, 'Could not submit the accountability.')),
      },
    );
  };

  return (
    <Modal show onHide={onClose} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem' }}>
          {existing ? 'Revise accountability' : 'Submit accountability'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}
        {existing && (
          <Alert variant="warning" className="py-2 small">
            Re-submitting replaces the lines below and clears any figures Admin, HR or the
            Director have already entered.
          </Alert>
        )}

        <div className="text-muted small mb-2">
          Record what the money was actually spent on. One line per item bought.
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ background: '#1B3A6B' }}>
                {['#', 'Requisition Item', 'Category', 'Qty', 'Rate (UGX)', 'Total', ''].map((h, i) => (
                  <th key={h + i} style={{
                    padding: '7px 8px', color: 'white', fontWeight: 700,
                    fontSize: '0.74rem', textAlign: i === 0 || i === 3 ? 'center' : 'left',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.key} style={{ borderBottom: '1px solid #e9ecef' }}>
                  <td style={{ padding: '4px 6px', textAlign: 'center', color: '#6c757d', fontSize: '0.75rem' }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: '4px 6px', minWidth: 180 }}>
                    <input
                      style={CELL}
                      value={r.requisitionItem}
                      placeholder="e.g. Printer paper"
                      onChange={e => { patch(r.key, { requisitionItem: e.target.value }); setError(''); }}
                    />
                  </td>
                  <td style={{ padding: '4px 6px', minWidth: 150 }}>
                    <input
                      style={CELL}
                      list="accountability-categories"
                      value={r.category}
                      placeholder="e.g. Stationery"
                      onChange={e => { patch(r.key, { category: e.target.value }); setError(''); }}
                    />
                  </td>
                  <td style={{ padding: '4px 6px', width: 80 }}>
                    <input
                      style={{ ...CELL, textAlign: 'center' }}
                      type="number" min={1}
                      value={r.quantity}
                      onChange={e => patch(r.key, { quantity: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </td>
                  <td style={{ padding: '4px 6px', width: 120 }}>
                    <input
                      style={{ ...CELL, textAlign: 'right' }}
                      type="number" min={0}
                      value={r.rate}
                      placeholder="0"
                      onChange={e => patch(r.key, { rate: e.target.value === '' ? '' : Number(e.target.value) })}
                    />
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: '#1B3A6B' }}>
                    {lineTotal(r).toLocaleString()}
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                    <button
                      type="button"
                      aria-label={`Remove line ${idx + 1}`}
                      onClick={() => setRows(prev => prev.filter(x => x.key !== r.key))}
                      disabled={rows.length === 1}
                      style={{
                        background: 'none', border: 'none', cursor: rows.length === 1 ? 'default' : 'pointer',
                        color: rows.length === 1 ? '#ced4da' : '#dc3545', fontSize: '1rem',
                      }}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <datalist id="accountability-categories">
          {REQUISITION_CATEGORY_LIST.map(c => <option key={c} value={c} />)}
        </datalist>

        <Button
          size="sm"
          variant="outline-primary"
          className="mt-2"
          onClick={() => setRows(prev => [...prev, newRow()])}
        >
          + Add line
        </Button>

        <div className="mt-3 p-3" style={{ background: '#F2F4F7', borderRadius: '0.5rem' }}>
          <div className="d-flex justify-content-between small">
            <span className="text-muted">Requisitioned</span>
            <strong>UGX {requisitionAmount.toLocaleString()}</strong>
          </div>
          <div className="d-flex justify-content-between small mt-1">
            <span className="text-muted">Accounted for</span>
            <strong>UGX {grandTotal.toLocaleString()}</strong>
          </div>
          <div
            className="d-flex justify-content-between mt-2 pt-2"
            style={{ borderTop: '1px solid #dee2e6', fontWeight: 700,
                     color: variance > 0 ? '#C0392B' : variance < 0 ? '#1E8449' : '#1B3A6B' }}
          >
            <span>{variance > 0 ? 'Overspend' : variance < 0 ? 'Surplus' : 'Balanced'}</span>
            <span>
              {variance !== 0 && (variance > 0 ? '+ ' : '− ')}UGX {Math.abs(variance).toLocaleString()}
            </span>
          </div>
          <div className="text-muted mt-2" style={{ fontSize: '0.72rem' }}>
            Indicative only — the figure that counts is the Director&apos;s, set during review.
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={submit.isPending}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={submit.isPending}>
          {submit.isPending
            ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Submitting…</>
            : 'Submit accountability'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
