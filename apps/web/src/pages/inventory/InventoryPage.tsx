import React, { useState } from 'react';
import {
  Alert, Badge, Button, Col, Form, Modal, Row, Spinner, Tab, Table, Tabs,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import {
  useInventoryItems, useLowStockItems, useInventoryTransactions,
  useCreateInventoryItem, useUpdateInventoryItem,
  useReturnItem, useAdjustStock, useAdjustCondition, useBatchIssueItems,
} from '../../hooks/useInventory';
import { useGuardList } from '../../hooks/useGuards';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import type {
  InventoryItemResponse,
  StockConditionBreakdown,
  ItemCondition,
  AdjustConditionInput,
} from '@stap/shared';
import {
  ITEM_CONDITIONS,
  ITEM_CONDITION_COLORS,
  ITEM_CONDITION_BG,
} from '@stap/shared';

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

// ── Condition Breakdown Bar ────────────────────────────────────────────────────

const ORDERED_CONDITIONS: ItemCondition[] = ['NEW', 'GOOD', 'FAIR', 'DAMAGED'];

function ConditionBreakdownBar({ breakdown, total }: { breakdown: StockConditionBreakdown; total: number }) {
  if (total === 0) {
    return <span className="text-muted small">Out of stock</span>;
  }
  return (
    <div>
      <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 5, width: 130 }}>
        {ORDERED_CONDITIONS.map(c =>
          breakdown[c] > 0 ? (
            <div
              key={c}
              style={{ width: `${(breakdown[c] / total) * 100}%`, background: ITEM_CONDITION_COLORS[c] }}
            />
          ) : null,
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {ORDERED_CONDITIONS.map(c =>
          breakdown[c] > 0 ? (
            <span
              key={c}
              style={{
                fontSize: '0.7rem', padding: '1px 7px', borderRadius: 10,
                background: ITEM_CONDITION_BG[c], color: ITEM_CONDITION_COLORS[c], fontWeight: 600,
              }}
            >
              {ITEM_CONDITIONS[c]}: {breakdown[c]}
            </span>
          ) : null,
        )}
      </div>
      <div style={{ fontSize: '0.72rem', color: '#6c757d', marginTop: 2 }}>
        Total: {total}
      </div>
    </div>
  );
}

// ── Adjust Condition Modal ─────────────────────────────────────────────────────

function AdjustConditionModal({ item, onHide }: { item: InventoryItemResponse; onHide: () => void }) {
  const { showToast } = useToast();
  const adjust = useAdjustCondition();

  const [form, setForm] = useState<AdjustConditionInput>({
    quantityNew:     item.conditionBreakdown.NEW,
    quantityGood:    item.conditionBreakdown.GOOD,
    quantityFair:    item.conditionBreakdown.FAIR,
    quantityDamaged: item.conditionBreakdown.DAMAGED,
    notes:           '',
  });

  const newTotal = form.quantityNew + form.quantityGood + form.quantityFair + form.quantityDamaged;

  const conditionConfig = [
    { key: 'quantityNew'     as const, label: 'New',     helper: 'Brand new, never used' },
    { key: 'quantityGood'    as const, label: 'Good',    helper: 'Used but in good condition' },
    { key: 'quantityFair'    as const, label: 'Fair',    helper: 'Serviceable, showing wear' },
    { key: 'quantityDamaged' as const, label: 'Damaged', helper: 'Damaged, needs repair' },
  ];

  const conditionToItemCondition: Record<string, ItemCondition> = {
    quantityNew: 'NEW', quantityGood: 'GOOD', quantityFair: 'FAIR', quantityDamaged: 'DAMAGED',
  };

  const handleSave = () => {
    adjust.mutate(
      { itemId: item.id, data: form },
      {
        onSuccess: () => { showToast('Condition breakdown updated', 'success'); onHide(); },
        onError:   (err: any) => showToast(err?.response?.data?.error ?? 'Failed to update condition', 'danger'),
      },
    );
  };

  return (
    <Modal show onHide={onHide} size="lg">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1rem' }}>
          Adjust Condition Breakdown — <strong>{item.itemName}</strong>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="info" className="small py-2 mb-3">
          Correct the condition breakdown for this item. The total stock quantity will be
          recalculated automatically as the sum of all four condition counts.
        </Alert>
        <Row className="g-3 mb-3">
          {conditionConfig.map(({ key, label, helper }) => {
            const ic = conditionToItemCondition[key];
            const color = ITEM_CONDITION_COLORS[ic];
            const bg    = ITEM_CONDITION_BG[ic];
            return (
              <Col md={6} key={key}>
                <div style={{ border: `2px solid ${bg}`, borderRadius: '0.5rem', padding: 12, background: bg }}>
                  <div style={{ fontWeight: 700, color, marginBottom: 2, fontSize: '0.88rem' }}>{label}</div>
                  <div style={{ fontSize: '0.73rem', color, opacity: 0.8, marginBottom: 8 }}>{helper}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, [key]: Math.max(0, f[key] - 1) }))}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', border: `1px solid ${color}`,
                        background: '#fff', cursor: 'pointer', color, fontWeight: 'bold', fontSize: '1rem',
                        lineHeight: 1,
                      }}
                    >−</button>
                    <input
                      type="number"
                      min={0}
                      value={form[key]}
                      onChange={e => setForm(f => ({ ...f, [key]: Math.max(0, Number(e.target.value) || 0) }))}
                      style={{
                        width: 70, textAlign: 'center', border: `2px solid ${color}`, borderRadius: 6,
                        padding: '4px', fontSize: '1.1rem', fontWeight: 700, color, background: '#fff',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, [key]: f[key] + 1 }))}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', border: `1px solid ${color}`,
                        background: '#fff', cursor: 'pointer', color, fontWeight: 'bold', fontSize: '1rem',
                        lineHeight: 1,
                      }}
                    >+</button>
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>

        <div style={{
          padding: '10px 16px', background: '#F2F4F7', borderRadius: '0.5rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
        }}>
          <span style={{ fontWeight: 600, color: '#1B3A6B' }}>New total in stock:</span>
          <span style={{ fontSize: '1.4rem', fontWeight: 700, color: newTotal === 0 ? '#dc3545' : '#1B3A6B' }}>
            {newTotal} unit(s)
          </span>
        </div>

        <Form.Group>
          <Form.Label className="small fw-bold">
            Reason for Adjustment <span className="text-muted fw-normal">(optional)</span>
          </Form.Label>
          <Form.Control
            size="sm"
            type="text"
            placeholder="e.g. Stocktake 01 June 2026 — correcting condition breakdown"
            value={form.notes ?? ''}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={adjust.isPending}>
          {adjust.isPending ? <Spinner size="sm" animation="border" /> : 'Save Condition Breakdown'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

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

// ── Line Item Row (used inside IssueItemsModal) ────────────────────────────────

interface LineItem {
  id:            string;
  itemId:        string;
  quantity:      number;
  itemCondition: string;
  conditionNote: string;
}

const QUICK_FILLS = ['New', 'Good condition', 'Serviceable', 'Minor wear', 'Repaired — usable'];

function LineItemRow({
  index,
  lineItem,
  inventoryItems,
  onChange,
  onRemove,
  isLast,
}: {
  index:          number;
  lineItem:       LineItem;
  inventoryItems: InventoryItemResponse[];
  onChange:       (updated: LineItem) => void;
  onRemove:       () => void;
  isLast:         boolean;
}) {
  const inv = inventoryItems.find(i => i.id === lineItem.itemId) ?? null;
  const noteInvalid = lineItem.conditionNote.length > 0 && lineItem.conditionNote.trim().length < 3;

  return (
    <div style={{
      padding:      '12px 14px',
      borderBottom: isLast ? 'none' : '1px solid #e9ecef',
      background:   index % 2 === 0 ? '#fff' : '#fafafa',
    }}>
      <div className="d-flex align-items-start gap-2">
        <div style={{
          width: 24, height: 24, background: '#1B3A6B', color: '#fff', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.7rem', fontWeight: 'bold', flexShrink: 0, marginTop: 6,
        }}>
          {index + 1}
        </div>
        <div style={{ flex: 1 }}>
          <Row className="g-2 mb-2">
            <Col md={6}>
              <Form.Label className="small fw-bold mb-1">Item <span className="text-danger">*</span></Form.Label>
              <Form.Select
                size="sm"
                value={lineItem.itemId}
                onChange={e => onChange({ ...lineItem, itemId: e.target.value })}
                isInvalid={!lineItem.itemId}
              >
                <option value="">— Select item —</option>
                {inventoryItems
                  .filter(i => i.isActive && i.stockQuantity > 0)
                  .map(i => (
                    <option key={i.id} value={i.id}>
                      {i.itemName} ({i.stockQuantity} in stock)
                    </option>
                  ))}
              </Form.Select>
            </Col>
            <Col md={3}>
              <Form.Label className="small fw-bold mb-1">Qty <span className="text-danger">*</span></Form.Label>
              <Form.Control
                size="sm"
                type="number"
                min={1}
                max={inv?.stockQuantity ?? undefined}
                value={lineItem.quantity}
                onChange={e => onChange({ ...lineItem, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                isInvalid={!!inv && lineItem.quantity > inv.stockQuantity}
                style={{ textAlign: 'center' }}
              />
              {inv && (
                <Form.Text style={{ fontSize: '0.7rem', color: lineItem.quantity > inv.stockQuantity ? '#dc3545' : '#6c757d' }}>
                  Max: {inv.stockQuantity}
                </Form.Text>
              )}
            </Col>
            <Col md={3}>
              <Form.Label className="small fw-bold mb-1">Condition</Form.Label>
              <Form.Select
                size="sm"
                value={lineItem.itemCondition}
                onChange={e => onChange({ ...lineItem, itemCondition: e.target.value })}
              >
                <option value="NEW">New</option>
                <option value="GOOD">Good</option>
                <option value="FAIR">Fair</option>
                <option value="DAMAGED">Damaged</option>
              </Form.Select>
            </Col>
          </Row>

          {inv && (
            <div className="d-flex gap-1 flex-wrap mb-2">
              {ORDERED_CONDITIONS
                .filter(c => (inv.conditionBreakdown[c] ?? 0) > 0)
                .map(c => (
                  <span key={c} style={{
                    fontSize: '0.68rem', padding: '1px 6px', borderRadius: 10,
                    background: ITEM_CONDITION_BG[c], color: ITEM_CONDITION_COLORS[c], fontWeight: 600,
                  }}>
                    {ITEM_CONDITIONS[c]}: {inv.conditionBreakdown[c]}
                  </span>
                ))}
            </div>
          )}

          <Form.Label className="small fw-bold mb-1">
            Condition Note <span className="text-danger">*</span>
          </Form.Label>
          <div className="d-flex flex-wrap gap-1 mb-1">
            {QUICK_FILLS.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ ...lineItem, conditionNote: s })}
                style={{
                  background: '#F2F4F7', border: '1px solid #D0D5DD', borderRadius: '1rem',
                  padding: '1px 8px', fontSize: '0.7rem', color: '#1B3A6B', cursor: 'pointer',
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <Form.Control
            as="textarea"
            rows={2}
            size="sm"
            placeholder="Describe condition before issuing…"
            value={lineItem.conditionNote}
            onChange={e => onChange({ ...lineItem, conditionNote: e.target.value })}
            isInvalid={noteInvalid}
            style={{ fontSize: '0.82rem' }}
          />
          {noteInvalid && (
            <div style={{ color: '#dc3545', fontSize: '0.75rem', marginTop: 2 }}>
              At least 3 characters required.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: 'none', border: 'none', color: '#dc3545',
            cursor: 'pointer', fontSize: '1.1rem', padding: '4px', flexShrink: 0, marginTop: 4,
          }}
          title="Remove"
        >✕</button>
      </div>
    </div>
  );
}

// ── Issue Items Modal (multi-item batch) ───────────────────────────────────────

function IssueItemModal({
  show,
  preItem,
  onHide,
}: {
  show: boolean;
  preItem?: InventoryItemResponse | null;
  onHide: () => void;
}) {
  const { showToast }  = useToast();
  const mutation       = useBatchIssueItems();
  const { data: itemsData } = useInventoryItems({ page: 1, limit: 200 });
  const { data: guardsData, isLoading: guardsLoading } = useGuardList({ page: 1, limit: 200 });
  const inventoryItems = itemsData?.data ?? [];
  const guards         = guardsData?.data ?? [];

  const [selectedGuardId, setSelectedGuardId] = useState('');
  const [lineItems, setLineItems]             = useState<LineItem[]>([]);

  const selectedGuard = guards.find(g => g.id === selectedGuardId) ?? null;

  // Pre-populate first line item when opened from a catalogue row
  React.useEffect(() => {
    if (show && preItem) {
      setLineItems([{
        id:            crypto.randomUUID(),
        itemId:        preItem.id,
        quantity:      1,
        itemCondition: 'GOOD',
        conditionNote: '',
      }]);
    }
  }, [show, preItem?.id]);

  const addLineItem = () => {
    setLineItems(prev => [...prev, {
      id: crypto.randomUUID(), itemId: '', quantity: 1, itemCondition: 'GOOD', conditionNote: '',
    }]);
  };
  const updateLineItem = (index: number, updated: LineItem) => {
    setLineItems(prev => prev.map((l, i) => i === index ? updated : l));
  };
  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleClose = () => {
    setSelectedGuardId('');
    setLineItems([]);
    onHide();
  };

  const isValid =
    !!selectedGuardId &&
    lineItems.length > 0 &&
    lineItems.every(l =>
      l.itemId !== '' &&
      l.quantity >= 1 &&
      l.conditionNote.trim().length >= 3,
    );

  const duplicateItemIds = lineItems
    .map(l => l.itemId)
    .filter((id, i, arr) => id !== '' && arr.indexOf(id) !== i);
  const hasDuplicates = duplicateItemIds.length > 0;

  const hasOverStock = lineItems.some(l => {
    const inv = inventoryItems.find(i => i.id === l.itemId);
    return inv && l.quantity > inv.stockQuantity;
  });

  const handleSubmit = async () => {
    if (!isValid) return;
    try {
      const result = await mutation.mutateAsync({
        guardId: selectedGuardId,
        items:   lineItems.map(l => ({
          itemId:        l.itemId,
          quantity:      l.quantity,
          itemCondition: l.itemCondition as any,
          conditionNote: l.conditionNote.trim(),
        })),
      });
      showToast(
        `${result.totalIssued} item type(s) issued to ${result.guardName}.`,
        'success',
      );
      handleClose();
    } catch {
      // error shown inline via mutation.isError
    }
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <div>
          <Modal.Title>Issue Items to Guard</Modal.Title>
          <div className="text-muted small fw-normal">Add one or more items and submit all at once</div>
        </div>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: '72vh', overflowY: 'auto' }}>
        {/* Guard selector */}
        <div className="mb-4">
          <Form.Label className="fw-bold">
            Guard <span className="text-danger">*</span>
          </Form.Label>
          <SearchableSelect
            options={guards.map(g => ({
              value:    g.id,
              label:    `${g.firstName} ${g.lastName}`,
              sublabel: g.rank ?? 'Guard',
            }))}
            value={selectedGuardId}
            onChange={id => { setSelectedGuardId(id); setLineItems([]); }}
            placeholder="— Search and select guard —"
            searchPlaceholder="Type guard name…"
            isLoading={guardsLoading}
          />
          {selectedGuard && (
            <div style={{
              marginTop: 8, padding: '8px 12px', background: '#D6E0F0',
              borderRadius: '0.375rem', fontSize: '0.82rem', color: '#1B3A6B',
            }}>
              <strong>{selectedGuard.firstName} {selectedGuard.lastName}</strong>
              {' · '}
              {selectedGuard.rank ?? 'Guard'}
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="mb-3">
          <div className="d-flex align-items-center justify-content-between mb-2">
            <div className="fw-bold">
              Items to Issue
              {lineItems.length > 0 && (
                <Badge bg="primary" className="ms-2">{lineItems.length}</Badge>
              )}
            </div>
            <Button
              type="button"
              variant="outline-primary"
              size="sm"
              disabled={!selectedGuardId}
              onClick={addLineItem}
              title={!selectedGuardId ? 'Select a guard first' : 'Add another item'}
            >
              + Add Item
            </Button>
          </div>

          {lineItems.length === 0 ? (
            <div style={{
              border: '2px dashed #ced4da', borderRadius: '0.5rem',
              padding: '32px 16px', textAlign: 'center', color: '#6c757d',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>📦</div>
              <div className="fw-bold mb-1">No items added yet</div>
              <div style={{ fontSize: '0.82rem' }}>
                {selectedGuardId
                  ? 'Click "+ Add Item" to build the issue list'
                  : 'Select a guard above first, then add items'}
              </div>
            </div>
          ) : (
            <div style={{ border: '1px solid #ced4da', borderRadius: '0.5rem', overflow: 'hidden' }}>
              {lineItems.map((line, i) => (
                <LineItemRow
                  key={line.id}
                  index={i}
                  lineItem={line}
                  inventoryItems={inventoryItems}
                  onChange={updated => updateLineItem(i, updated)}
                  onRemove={() => removeLineItem(i)}
                  isLast={i === lineItems.length - 1}
                />
              ))}
            </div>
          )}
        </div>

        {/* Review summary */}
        {lineItems.length > 0 && selectedGuardId && (
          <div style={{
            padding: '12px 14px', background: '#D6E0F0',
            borderRadius: '0.5rem', marginBottom: 16, fontSize: '0.82rem',
          }}>
            <div className="fw-bold mb-2">📋 Issue Summary</div>
            <div>Guard: <strong>{selectedGuard?.firstName} {selectedGuard?.lastName}</strong></div>
            <div className="mt-1">Items to issue: <strong>{lineItems.length} type(s)</strong></div>
            <ul className="mb-0 mt-1" style={{ paddingLeft: 16, fontSize: '0.78rem', color: '#4A5568' }}>
              {lineItems.filter(l => l.itemId).map((line, i) => {
                const inv = inventoryItems.find(it => it.id === line.itemId);
                return (
                  <li key={i}>
                    {inv?.itemName ?? 'Unknown'} ×{line.quantity} —{' '}
                    {line.itemCondition.charAt(0) + line.itemCondition.slice(1).toLowerCase()}
                  </li>
                );
              })}
            </ul>
            {hasDuplicates && (
              <div className="mt-2" style={{ color: '#856404', fontWeight: 600, fontSize: '0.8rem' }}>
                ⚠️ Duplicate items detected. Adjust quantity instead of adding the same item twice.
              </div>
            )}
          </div>
        )}

        {/* Validation alerts */}
        {mutation.isError && (
          <Alert variant="danger" className="mb-3 py-2">
            <small>
              ❌ {(mutation.error as any)?.response?.data?.error ?? 'Failed to issue items. Please check your inputs.'}
            </small>
          </Alert>
        )}
        {hasOverStock && (
          <Alert variant="danger" className="mb-3 py-2">
            <small>❌ One or more items have a quantity exceeding available stock.</small>
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={handleClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!isValid || hasDuplicates || hasOverStock || mutation.isPending}
          onClick={handleSubmit}
        >
          {mutation.isPending ? (
            <><Spinner size="sm" animation="border" className="me-1" />Issuing {lineItems.length} item(s)…</>
          ) : (
            `Issue ${lineItems.length || ''} Item${lineItems.length !== 1 ? 's' : ''} to ${selectedGuard?.firstName ?? 'Guard'}`
          )}
        </Button>
      </Modal.Footer>
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
  const [conditionItem, setConditionItem] = useState<InventoryItemResponse | null>(null);

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
                Issue Items
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
                  <th>Stock by Condition</th>
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
                    <td className="fw-medium">
                      {item.itemName}
                      {item.issuedFree && (
                        <Badge bg="success" className="ms-1" style={{ fontSize: 10 }}>FREE</Badge>
                      )}
                      {item.isShoeItem && (
                        <Badge bg="warning" text="dark" className="ms-1" style={{ fontSize: 10 }}>30K DEDUCTION</Badge>
                      )}
                    </td>
                    <td>
                      <Badge bg={TYPE_BADGES[item.itemType] ?? 'secondary'} style={{ fontSize: 11 }}>
                        {item.itemType}
                      </Badge>
                    </td>
                    <td className="small">UGX {item.unitCost.toLocaleString()}</td>
                    <td>
                      <ConditionBreakdownBar
                        breakdown={item.conditionBreakdown}
                        total={item.stockQuantity}
                      />
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
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          style={{ fontSize: 11, padding: '1px 6px' }}
                          title="Adjust condition breakdown"
                          onClick={() => setConditionItem(item)}
                        >
                          📊
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
                      <td className="small" style={{
                        color:     t.conditionNote === 'Not recorded — pre-existing record' ? '#adb5bd' : '#4A5568',
                        fontStyle: 'italic',
                      }}>
                        {t.conditionNote === 'Not recorded — pre-existing record'
                          ? '(No condition note — pre-existing record)'
                          : t.conditionNote || '—'}
                      </td>
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
      {conditionItem && (
        <AdjustConditionModal item={conditionItem} onHide={() => setConditionItem(null)} />
      )}
    </div>
  );
}
