import React, { useState } from 'react';
import {
  Alert, Badge, Button, Col, Form, Modal, Row, Spinner, Tab, Table, Tabs,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import {
  useInventoryItems, useLowStockItems, useInventoryTransactions,
  useCreateInventoryItem, useUpdateInventoryItem,
  useIssueItem, useReturnItem, useAdjustStock,
} from '../../hooks/useInventory';
import { useGuardList } from '../../hooks/useGuards';
import type { InventoryItemResponse } from '@stap/shared';

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_BADGES: Record<string, string> = {
  UNIFORM:    'primary',
  EQUIPMENT:  'secondary',
  CONSUMABLE: 'info',
};

const ACTION_BADGES: Record<string, { bg: string; text?: string; style?: React.CSSProperties }> = {
  ISSUED:           { bg: 'primary' },
  RETURNED:         { bg: 'success' },
  LOST:             { bg: 'danger' },
  DAMAGED:          { bg: 'warning', text: 'dark' },
  STOCK_IN:         { bg: 'success', style: { background: '#0F7B6C', color: '#fff', border: 'none' } },
  STOCK_ADJUSTMENT: { bg: 'secondary' },
};

// ── Item Form Modal ────────────────────────────────────────────────────────────

function ItemFormModal({
  item,
  onHide,
}: {
  item: InventoryItemResponse | null | 'new';
  onHide: () => void;
}) {
  const { showToast } = useToast();
  const create = useCreateInventoryItem();
  const update = useUpdateInventoryItem();
  const isNew  = item === 'new';

  const initial = {
    itemName:         isNew ? '' : (item as InventoryItemResponse)?.itemName ?? '',
    itemType:         isNew ? 'UNIFORM' : (item as InventoryItemResponse)?.itemType ?? 'UNIFORM',
    unitCost:         isNew ? '' : String((item as InventoryItemResponse)?.unitCost ?? ''),
    stockQuantity:    isNew ? '0' : String((item as InventoryItemResponse)?.stockQuantity ?? '0'),
    reorderThreshold: isNew ? '5' : String((item as InventoryItemResponse)?.reorderThreshold ?? '5'),
    description:      isNew ? '' : (item as InventoryItemResponse)?.description ?? '',
  };
  const [form, setForm] = useState(initial);

  React.useEffect(() => {
    if (item) setForm({
      itemName:         isNew ? '' : (item as InventoryItemResponse)?.itemName ?? '',
      itemType:         isNew ? 'UNIFORM' : (item as InventoryItemResponse)?.itemType ?? 'UNIFORM',
      unitCost:         isNew ? '' : String((item as InventoryItemResponse)?.unitCost ?? ''),
      stockQuantity:    isNew ? '0' : String((item as InventoryItemResponse)?.stockQuantity ?? '0'),
      reorderThreshold: isNew ? '5' : String((item as InventoryItemResponse)?.reorderThreshold ?? '5'),
      description:      isNew ? '' : (item as InventoryItemResponse)?.description ?? '',
    });
  }, [item]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      itemName:         form.itemName,
      itemType:         form.itemType as any,
      unitCost:         Number(form.unitCost),
      stockQuantity:    Number(form.stockQuantity),
      reorderThreshold: Number(form.reorderThreshold),
      description:      form.description || undefined,
    };
    if (isNew) {
      create.mutate(data, {
        onSuccess: () => { showToast('Item created', 'success'); onHide(); },
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
      });
    } else {
      update.mutate({ id: (item as InventoryItemResponse).id, data }, {
        onSuccess: () => { showToast('Item updated', 'success'); onHide(); },
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
      });
    }
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Modal show={!!item} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{isNew ? 'Add Inventory Item' : 'Edit Item'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Item Name *</Form.Label>
            <Form.Control size="sm" value={form.itemName} onChange={e => setForm(f => ({ ...f, itemName: e.target.value }))} required />
          </Form.Group>
          <Row className="mb-2">
            <Col>
              <Form.Label className="small fw-medium">Type *</Form.Label>
              <Form.Select size="sm" value={form.itemType} onChange={e => setForm(f => ({ ...f, itemType: e.target.value }))}>
                <option value="UNIFORM">Uniform</option>
                <option value="EQUIPMENT">Equipment</option>
                <option value="CONSUMABLE">Consumable</option>
              </Form.Select>
            </Col>
            <Col>
              <Form.Label className="small fw-medium">Unit Cost (UGX) *</Form.Label>
              <Form.Control size="sm" type="number" min="0" value={form.unitCost} onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} required />
            </Col>
          </Row>
          <Row className="mb-2">
            <Col>
              <Form.Label className="small fw-medium">{isNew ? 'Initial Stock' : 'Stock Quantity'}</Form.Label>
              <Form.Control size="sm" type="number" min="0" value={form.stockQuantity} onChange={e => setForm(f => ({ ...f, stockQuantity: e.target.value }))} />
            </Col>
            <Col>
              <Form.Label className="small fw-medium">Reorder Threshold</Form.Label>
              <Form.Control size="sm" type="number" min="0" value={form.reorderThreshold} onChange={e => setForm(f => ({ ...f, reorderThreshold: e.target.value }))} />
            </Col>
          </Row>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Description</Form.Label>
            <Form.Control as="textarea" rows={2} size="sm" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </Form.Group>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? <Spinner size="sm" /> : isNew ? 'Add Item' : 'Save Changes'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

// ── Issue Item Modal ───────────────────────────────────────────────────────────

function IssueItemModal({
  show,
  preItem,
  onHide,
}: {
  show: boolean;
  preItem?: InventoryItemResponse | null;
  onHide: () => void;
}) {
  const { showToast } = useToast();
  const issue = useIssueItem();
  const { data: itemsData } = useInventoryItems({ page: 1, limit: 200 });
  const { data: guardsData, isLoading: guardsLoading, isError: guardsError, refetch: refetchGuards } = useGuardList({ page: 1, limit: 200 });
  const items  = itemsData?.data  ?? [];
  const guards = guardsData?.data ?? [];
  const [form, setForm] = useState({ itemId: preItem?.id ?? '', guardId: '', quantity: '1', conditionNote: '' });

  React.useEffect(() => {
    if (preItem) setForm(f => ({ ...f, itemId: preItem.id }));
  }, [preItem]);

  const selectedItem = items.find(i => i.id === form.itemId);
  const qty          = Number(form.quantity);
  const showWarning  = selectedItem && qty > 0 && qty > (selectedItem.stockQuantity * 0.5);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    issue.mutate(
      { itemId: form.itemId, guardId: form.guardId, quantity: qty, conditionNote: form.conditionNote || undefined },
      {
        onSuccess: () => { showToast('Item issued', 'success'); onHide(); },
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
      },
    );
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton><Modal.Title>Issue Item to Guard</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Item *</Form.Label>
            <Form.Select size="sm" value={form.itemId} onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))} required>
              <option value="">Select item…</option>
              {items.filter(i => i.isActive && i.stockQuantity > 0).map(i => (
                <option key={i.id} value={i.id}>{i.itemCode} — {i.itemName} (Stock: {i.stockQuantity})</option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Guard *</Form.Label>
            {guardsError ? (
              <Alert variant="danger" className="small py-1 px-2 mb-0 d-flex align-items-center justify-content-between">
                Failed to load guards.
                <Button size="sm" variant="link" className="p-0 ms-2" onClick={() => refetchGuards()}>Retry</Button>
              </Alert>
            ) : (
              <Form.Select size="sm" value={form.guardId} onChange={e => setForm(f => ({ ...f, guardId: e.target.value }))} required disabled={guardsLoading}>
                <option value="">{guardsLoading ? 'Loading guards…' : 'Select guard…'}</option>
                {guards.map(g => <option key={g.id} value={g.id}>{g.firstName} {g.lastName}</option>)}
              </Form.Select>
            )}
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Quantity *</Form.Label>
            <Form.Control
              size="sm"
              type="number"
              min="1"
              max={selectedItem?.stockQuantity ?? undefined}
              value={form.quantity}
              onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
              required
            />
          </Form.Group>
          {showWarning && (
            <Alert variant="warning" className="small py-1 px-2 mb-2">
              ⚠️ Issuing {qty} of {selectedItem!.stockQuantity} available
            </Alert>
          )}
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Condition Note</Form.Label>
            <Form.Control size="sm" value={form.conditionNote} onChange={e => setForm(f => ({ ...f, conditionNote: e.target.value }))} />
          </Form.Group>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
            <Button type="submit" size="sm" disabled={issue.isPending}>
              {issue.isPending ? <Spinner size="sm" /> : 'Issue Item'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

// ── Return Item Modal ──────────────────────────────────────────────────────────

function ReturnItemModal({
  show,
  preItem,
  preGuardId,
  onHide,
}: {
  show: boolean;
  preItem?: InventoryItemResponse | null;
  preGuardId?: string;
  onHide: () => void;
}) {
  const { showToast } = useToast();
  const ret = useReturnItem();
  const { data: itemsData } = useInventoryItems({ page: 1, limit: 200 });
  const { data: guardsData, isLoading: guardsLoading, isError: guardsError, refetch: refetchGuards } = useGuardList({ page: 1, limit: 200 });
  const items  = itemsData?.data  ?? [];
  const guards = guardsData?.data ?? [];
  const [form, setForm] = useState({
    itemId: preItem?.id ?? '',
    guardId: preGuardId ?? '',
    quantity: '1',
    action: 'RETURNED',
    conditionNote: '',
  });

  React.useEffect(() => {
    setForm(f => ({
      ...f,
      itemId:  preItem?.id    ?? f.itemId,
      guardId: preGuardId ?? f.guardId,
    }));
  }, [preItem, preGuardId]);

  const selectedItem = items.find(i => i.id === form.itemId);
  const isDamageOrLoss = form.action !== 'RETURNED';
  const deductionAmt = selectedItem && isDamageOrLoss
    ? selectedItem.unitCost * Number(form.quantity)
    : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ret.mutate(
      {
        itemId:       form.itemId,
        guardId:      form.guardId,
        quantity:     Number(form.quantity),
        action:       form.action as any,
        conditionNote: form.conditionNote || undefined,
      },
      {
        onSuccess: () => { showToast('Return recorded', 'success'); onHide(); },
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
      },
    );
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton><Modal.Title>Record Item Return</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Item *</Form.Label>
            <Form.Select size="sm" value={form.itemId} onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))} required>
              <option value="">Select item…</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.itemCode} — {i.itemName}</option>)}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Guard *</Form.Label>
            {guardsError ? (
              <Alert variant="danger" className="small py-1 px-2 mb-0 d-flex align-items-center justify-content-between">
                Failed to load guards.
                <Button size="sm" variant="link" className="p-0 ms-2" onClick={() => refetchGuards()}>Retry</Button>
              </Alert>
            ) : (
              <Form.Select size="sm" value={form.guardId} onChange={e => setForm(f => ({ ...f, guardId: e.target.value }))} required disabled={guardsLoading}>
                <option value="">{guardsLoading ? 'Loading guards…' : 'Select guard…'}</option>
                {guards.map(g => <option key={g.id} value={g.id}>{g.firstName} {g.lastName}</option>)}
              </Form.Select>
            )}
          </Form.Group>
          <Row className="mb-2">
            <Col>
              <Form.Label className="small fw-medium">Quantity *</Form.Label>
              <Form.Control size="sm" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required />
            </Col>
            <Col>
              <Form.Label className="small fw-medium">Return Type *</Form.Label>
              <Form.Select size="sm" value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))}>
                <option value="RETURNED">Returned (Good)</option>
                <option value="DAMAGED">Damaged</option>
                <option value="LOST">Lost</option>
              </Form.Select>
            </Col>
          </Row>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">
              Condition Note {isDamageOrLoss ? '*' : ''}
            </Form.Label>
            <Form.Control
              size="sm"
              value={form.conditionNote}
              onChange={e => setForm(f => ({ ...f, conditionNote: e.target.value }))}
              required={isDamageOrLoss}
            />
          </Form.Group>
          {isDamageOrLoss && deductionAmt > 0 && (
            <Alert variant="warning" className="small py-2 mb-3">
              A deduction of <strong>UGX {deductionAmt.toLocaleString()}</strong> will be automatically added to this guard's payroll deductions.
            </Alert>
          )}
          <div className="d-flex justify-content-end gap-2">
            <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
            <Button type="submit" size="sm" disabled={ret.isPending}>
              {ret.isPending ? <Spinner size="sm" /> : 'Record Return'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

// ── Stock Adjustment Modal ─────────────────────────────────────────────────────

function StockAdjustmentModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  const { showToast } = useToast();
  const adjust = useAdjustStock();
  const { data: itemsData } = useInventoryItems({ page: 1, limit: 200 });
  const items = itemsData?.data ?? [];
  const [form, setForm] = useState({ itemId: '', adjType: 'in', quantity: '1', reference: '', note: '' });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = form.adjType === 'in' ? Number(form.quantity) : -Number(form.quantity);
    adjust.mutate(
      { itemId: form.itemId, quantity: qty, reference: form.reference || undefined, note: form.note || undefined },
      {
        onSuccess: () => { showToast('Stock adjusted', 'success'); onHide(); },
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
      },
    );
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton><Modal.Title>Adjust Stock</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Item *</Form.Label>
            <Form.Select size="sm" value={form.itemId} onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))} required>
              <option value="">Select item…</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.itemCode} — {i.itemName} (Stock: {i.stockQuantity})</option>)}
            </Form.Select>
          </Form.Group>
          <Row className="mb-2">
            <Col>
              <Form.Label className="small fw-medium">Adjustment Type</Form.Label>
              <Form.Select size="sm" value={form.adjType} onChange={e => setForm(f => ({ ...f, adjType: e.target.value }))}>
                <option value="in">Stock In</option>
                <option value="out">Remove Stock</option>
              </Form.Select>
            </Col>
            <Col>
              <Form.Label className="small fw-medium">Quantity *</Form.Label>
              <Form.Control size="sm" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required />
            </Col>
          </Row>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Reference (PO / note)</Form.Label>
            <Form.Control size="sm" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Note</Form.Label>
            <Form.Control size="sm" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </Form.Group>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
            <Button type="submit" size="sm" disabled={adjust.isPending}>
              {adjust.isPending ? <Spinner size="sm" /> : 'Apply Adjustment'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter]       = useState('');
  const [lowStockOnly, setLowStockOnly]   = useState(false);
  const [search, setSearch]               = useState('');
  const [editItem, setEditItem]           = useState<InventoryItemResponse | 'new' | null>(null);
  const [showIssue, setShowIssue]         = useState(false);
  const [showReturn, setShowReturn]       = useState(false);
  const [showAdjust, setShowAdjust]       = useState(false);
  const [quickItem, setQuickItem]         = useState<InventoryItemResponse | null>(null);

  const { data: itemsData, isLoading: loadingItems } = useInventoryItems({
    itemType:   typeFilter   || undefined,
    isLowStock: lowStockOnly || undefined,
    search:     search       || undefined,
    page: 1, limit: 100,
  });
  const { data: txnsData, isLoading: loadingTxns } = useInventoryTransactions({ page: 1, limit: 100 });
  const { data: lowStock, isLoading: loadingLow }  = useLowStockItems();

  const items = itemsData?.data ?? [];
  const txns  = txnsData?.data  ?? [];

  return (
    <div className="container-fluid py-4">
      <div className="mb-4">
        <h4 className="fw-bold mb-0">Inventory Management</h4>
        <p className="text-muted small mb-0">Track uniforms, equipment, and consumables</p>
      </div>

      <Tabs defaultActiveKey="catalogue" className="mb-3">
        {/* ── TAB 1: Catalogue ────────────────────────────────────────────────── */}
        <Tab eventKey="catalogue" title="Stock Catalogue">
          <div className="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
            <div className="d-flex gap-2 flex-wrap align-items-center">
              <Form.Select size="sm" style={{ width: 160 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="">All Types</option>
                <option value="UNIFORM">Uniform</option>
                <option value="EQUIPMENT">Equipment</option>
                <option value="CONSUMABLE">Consumable</option>
              </Form.Select>
              <Form.Control
                size="sm"
                placeholder="Search by name or code…"
                style={{ width: 220 }}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <Form.Check
                type="switch"
                id="low-stock-filter"
                label="Low Stock Only"
                className="small"
                checked={lowStockOnly}
                onChange={e => setLowStockOnly(e.target.checked)}
              />
            </div>
            <div className="d-flex gap-2 flex-wrap">
              <Button size="sm" variant="primary" onClick={() => setEditItem('new')}>
                <i className="bi bi-plus-lg me-1" />Add Item
              </Button>
              <Button size="sm" variant="outline-primary" onClick={() => setShowIssue(true)}>
                Issue Item
              </Button>
              <Button size="sm" variant="outline-secondary" onClick={() => setShowReturn(true)}>
                Record Return
              </Button>
              <Button size="sm" variant="outline-warning" onClick={() => setShowAdjust(true)}>
                Adjust Stock
              </Button>
            </div>
          </div>

          {loadingItems ? (
            <div className="text-center py-5"><Spinner /></div>
          ) : items.length === 0 ? (
            <Alert variant="info">No inventory items found.</Alert>
          ) : (
            <Table hover size="sm" responsive className="align-middle">
              <thead className="table-light">
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Type</th>
                  <th>Unit Cost</th>
                  <th className="text-center">In Stock</th>
                  <th className="text-center">Threshold</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} style={item.isLowStock ? { background: '#fff3f3' } : undefined}>
                    <td>
                      <code style={{ background: '#d0e4f7', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
                        {item.itemCode}
                      </code>
                    </td>
                    <td className="fw-medium">{item.itemName}</td>
                    <td>
                      <Badge bg={TYPE_BADGES[item.itemType] ?? 'secondary'} style={{ fontSize: 11 }}>
                        {item.itemType}
                      </Badge>
                    </td>
                    <td className="small">UGX {item.unitCost.toLocaleString()}</td>
                    <td
                      className={`text-center fw-bold ${item.isLowStock ? 'text-danger' : 'text-dark'}`}
                    >
                      {item.stockQuantity}
                    </td>
                    <td className="text-center text-muted small">{item.reorderThreshold}</td>
                    <td>
                      {item.isLowStock
                        ? <span style={{ fontSize: 12 }}>🔴 Low Stock</span>
                        : <span style={{ fontSize: 12 }}>✅ OK</span>}
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <Button
                          size="sm"
                          variant="outline-primary"
                          style={{ fontSize: 11, padding: '1px 6px' }}
                          onClick={() => { setQuickItem(item); setShowIssue(true); }}
                        >
                          Issue
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          style={{ fontSize: 11, padding: '1px 6px' }}
                          onClick={() => { setQuickItem(item); setShowReturn(true); }}
                        >
                          Return
                        </Button>
                        <Button
                          size="sm"
                          variant="outline-dark"
                          style={{ fontSize: 11, padding: '1px 6px' }}
                          onClick={() => setEditItem(item)}
                        >
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Tab>

        {/* ── TAB 2: Transactions ──────────────────────────────────────────────── */}
        <Tab eventKey="transactions" title="Transactions Ledger">
          {loadingTxns ? (
            <div className="text-center py-5"><Spinner /></div>
          ) : txns.length === 0 ? (
            <Alert variant="info">No transactions recorded yet.</Alert>
          ) : (
            <Table hover size="sm" responsive>
              <thead className="table-light">
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Guard</th>
                  <th>Action</th>
                  <th className="text-center">Qty</th>
                  <th>Condition</th>
                  <th>Charged (UGX)</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {txns.map(t => {
                  const badge = ACTION_BADGES[t.action] ?? { bg: 'secondary' };
                  return (
                    <tr key={t.id}>
                      <td className="small text-nowrap">
                        {new Date(t.createdAt).toLocaleDateString('en-UG')}
                      </td>
                      <td>
                        <div className="small fw-medium">{t.item.itemName}</div>
                        <code style={{ fontSize: 10, color: '#666' }}>{t.item.itemCode}</code>
                      </td>
                      <td className="small">{t.guard?.fullName ?? '—'}</td>
                      <td>
                        <Badge
                          bg={badge.bg}
                          text={badge.text as any}
                          style={{ ...(badge.style ?? {}), fontSize: 11 }}
                        >
                          {t.action}
                        </Badge>
                      </td>
                      <td className="text-center">{t.quantity}</td>
                      <td className="small text-muted">{t.conditionNote ?? '—'}</td>
                      <td className="small">
                        {t.chargedAmount != null ? `UGX ${t.chargedAmount.toLocaleString()}` : '—'}
                      </td>
                      <td className="small">{t.recordedBy.name}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Tab>

        {/* ── TAB 3: Low Stock ─────────────────────────────────────────────────── */}
        <Tab eventKey="low-stock" title={<>Low Stock Alerts {lowStock && lowStock.length > 0 && <Badge bg="danger" className="ms-1">{lowStock.length}</Badge>}</>}>
          {loadingLow ? (
            <div className="text-center py-5"><Spinner /></div>
          ) : !lowStock || lowStock.length === 0 ? (
            <Alert variant="success">All items are adequately stocked.</Alert>
          ) : (
            <>
              <Alert variant="warning">{lowStock.length} item{lowStock.length > 1 ? 's are' : ' is'} below reorder threshold.</Alert>
              <Table hover size="sm" responsive>
                <thead className="table-light">
                  <tr>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th>Type</th>
                    <th className="text-center">In Stock</th>
                    <th className="text-center">Threshold</th>
                    <th className="text-center">Shortfall</th>
                    <th>Suggested Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map(item => (
                    <tr key={item.id} style={{ background: '#fff3f3' }}>
                      <td><code style={{ fontSize: 12 }}>{item.itemCode}</code></td>
                      <td className="fw-medium">{item.itemName}</td>
                      <td><Badge bg={TYPE_BADGES[item.itemType] ?? 'secondary'} style={{ fontSize: 11 }}>{item.itemType}</Badge></td>
                      <td className="text-center text-danger fw-bold">{item.stockQuantity}</td>
                      <td className="text-center">{item.reorderThreshold}</td>
                      <td className="text-center text-danger">{item.reorderThreshold - item.stockQuantity}</td>
                      <td>
                        <Button
                          size="sm"
                          variant="outline-warning"
                          style={{ fontSize: 11 }}
                          onClick={() => navigate('/requisitions', {
                            state: {
                              prefill: {
                                description: item.itemName,
                                quantity:    item.reorderThreshold - item.stockQuantity,
                                category:    'INVENTORY',
                              },
                            },
                          })}
                        >
                          Create Requisition
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </Tab>
      </Tabs>

      {/* Modals */}
      <ItemFormModal item={editItem} onHide={() => { setEditItem(null); setQuickItem(null); }} />
      <IssueItemModal
        show={showIssue}
        preItem={quickItem}
        onHide={() => { setShowIssue(false); setQuickItem(null); }}
      />
      <ReturnItemModal
        show={showReturn}
        preItem={quickItem}
        onHide={() => { setShowReturn(false); setQuickItem(null); }}
      />
      <StockAdjustmentModal show={showAdjust} onHide={() => setShowAdjust(false)} />
    </div>
  );
}
