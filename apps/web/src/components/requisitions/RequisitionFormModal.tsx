import { useState } from 'react';
import {
  Modal, Form, Button, Row, Col, Badge, InputGroup, Alert,
} from 'react-bootstrap';
import type { RequisitionResponse } from '@security360/shared';
import { useCreateRequisition, useUpdateRequisition } from '../../hooks/useRequisitions';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

interface Props {
  onClose: () => void;
  /**
   * Supplied to amend an existing requisition instead of raising a new one.
   * The fields are identical either way, so the same form serves both.
   */
  requisition?: RequisitionResponse;
}

const REQUISITION_CATEGORIES = [
  'Stationery', 'Equipment', 'Fuel', 'Maintenance',
  'Uniform', 'Training', 'Medical', 'Transport', 'Other',
];

interface CategorySelection {
  category: string;
  quantity: number;
  unit:     string;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function RequisitionFormModal({ onClose, requisition }: Props) {
  const { showToast } = useToast();
  const createReq = useCreateRequisition();
  const updateReq = useUpdateRequisition();

  const isEdit = !!requisition;

  const [date, setDate]               = useState(requisition ? requisition.date.slice(0, 10) : today());
  const [particulars, setParticulars] = useState(requisition?.particulars ?? '');
  const [amountStr, setAmountStr]     = useState(requisition ? String(requisition.amount) : '');
  const [categoryItems, setCategoryItems] = useState<CategorySelection[]>(
    requisition?.categoryItems.map((c) => ({
      category: c.category,
      quantity: c.quantity,
      unit:     c.unit ?? '',
    })) ?? [],
  );
  const [remarks, setRemarks]         = useState(requisition?.remarks ?? '');
  const [accountDetails, setAccountDetails] = useState(requisition?.accountDetails ?? '');
  const [accountName, setAccountName] = useState(requisition?.accountName ?? '');
  const [bankName, setBankName]       = useState(requisition?.bankName ?? '');
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amount = parseInt(amountStr.replace(/[^\d]/g, ''), 10) || 0;

  const isSelected = (cat: string) => categoryItems.some((c) => c.category === cat);

  function toggleCategory(cat: string) {
    setCategoryItems((prev) =>
      prev.some((c) => c.category === cat)
        ? prev.filter((c) => c.category !== cat)
        : [...prev, { category: cat, quantity: 1, unit: '' }],
    );
    setErrors((e) => ({ ...e, categoryItems: '' }));
  }

  function updateItem(cat: string, field: 'quantity' | 'unit', value: number | string) {
    setCategoryItems((prev) =>
      prev.map((c) => c.category === cat ? { ...c, [field]: value } : c),
    );
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!date) e.date = 'Date is required';
    if (particulars.trim().length < 3) e.particulars = 'Particulars must be at least 3 characters';
    if (amount <= 0) e.amount = 'Amount must be positive';
    if (categoryItems.length === 0) e.categoryItems = 'Select at least one category and specify a quantity';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);

    const payload = {
      date:          `${date}T00:00:00.000Z`,
      particulars:   particulars.trim(),
      amount,
      categoryItems: categoryItems.map((c) => ({
        category: c.category,
        quantity: c.quantity,
        unit:     c.unit.trim() || undefined,
      })),
    };

    try {
      if (requisition) {
        // Cleared optional fields go as null so the API blanks them, rather
        // than as undefined, which it reads as "leave this one alone".
        await updateReq.mutateAsync({
          id:   requisition.id,
          data: {
            ...payload,
            remarks:        remarks.trim() || null,
            accountDetails: accountDetails.trim() || null,
            accountName:    accountName.trim() || null,
            bankName:       bankName.trim() || null,
          },
        });
        showToast('Requisition updated', 'success');
      } else {
        await createReq.mutateAsync({
          ...payload,
          remarks:        remarks.trim() || undefined,
          accountDetails: accountDetails.trim() || undefined,
          accountName:    accountName.trim() || undefined,
          bankName:       bankName.trim() || undefined,
        });
        showToast('Requisition submitted', 'success');
      }
      onClose();
    } catch (err) {
      showToast(
        getApiErrorMessage(err, isEdit ? 'Failed to update requisition' : 'Failed to submit requisition'),
        'danger',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton style={{ backgroundColor: '#1B3A6B', color: '#fff' }}>
        <Modal.Title className="fs-6 fw-semibold">
          {isEdit ? '✏️ Edit Requisition' : 'New Requisition'}
        </Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {isEdit && (
            <Alert variant="info" className="py-2 small mb-3">
              This requisition is still awaiting HR approval, so it can be changed.
              Saving leaves it pending — once HR approves it, it locks.
            </Alert>
          )}
          <Row className="g-3">
            {/* 1. Date */}
            <Col md={4}>
              <Form.Group>
                <Form.Label className="fw-semibold">
                  Date <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  type="date"
                  value={date}
                  onChange={(e) => { setDate(e.target.value); setErrors((x) => ({ ...x, date: '' })); }}
                  isInvalid={!!errors.date}
                />
                <Form.Control.Feedback type="invalid">{errors.date}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            {/* 2. Particulars */}
            <Col md={12}>
              <Form.Group>
                <Form.Label className="fw-semibold">
                  Particulars <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  as="textarea" rows={2}
                  value={particulars}
                  onChange={(e) => { setParticulars(e.target.value); setErrors((x) => ({ ...x, particulars: '' })); }}
                  placeholder="Describe the items or services needed…"
                  isInvalid={!!errors.particulars}
                />
                <Form.Control.Feedback type="invalid">{errors.particulars}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            {/* 3. Requisition Amount */}
            <Col md={5}>
              <Form.Group>
                <Form.Label className="fw-semibold">
                  Requisition Amount (UGX) <span className="text-danger">*</span>
                </Form.Label>
                <InputGroup>
                  <InputGroup.Text>UGX</InputGroup.Text>
                  <Form.Control
                    type="text" inputMode="numeric"
                    value={amountStr}
                    onChange={(e) => {
                      setAmountStr(e.target.value.replace(/[^\d]/g, ''));
                      setErrors((x) => ({ ...x, amount: '' }));
                    }}
                    placeholder="0"
                    isInvalid={!!errors.amount}
                  />
                  <Form.Control.Feedback type="invalid">{errors.amount}</Form.Control.Feedback>
                </InputGroup>
              </Form.Group>
            </Col>

            {/* 4. Category — checkbox list with inline quantity rows */}
            <Col md={12}>
              <Form.Group>
                <Form.Label className="fw-semibold">
                  Category <span className="text-danger">*</span>
                </Form.Label>
                <Form.Text className="text-muted d-block mb-2">
                  Select one or more categories. For each selected category, specify the quantity required.
                </Form.Text>

                <div style={{ border: '1px solid #ced4da', borderRadius: '0.375rem', padding: '4px 0' }}>
                  {REQUISITION_CATEGORIES.map((cat) => {
                    const selected = categoryItems.find((c) => c.category === cat);
                    return (
                      <div key={cat} style={{ borderBottom: '1px solid #f0f0f0', padding: '6px 12px' }}>
                        <Form.Check
                          type="checkbox"
                          id={`cat-${cat}`}
                          label={cat}
                          checked={!!selected}
                          onChange={() => toggleCategory(cat)}
                        />

                        {selected && (
                          <Row className="g-2 mt-1" style={{ marginLeft: 24, maxWidth: 340 }}>
                            <Col xs={6}>
                              <Form.Control
                                size="sm"
                                type="number"
                                min={1}
                                placeholder="Quantity *"
                                value={selected.quantity}
                                onChange={(e) =>
                                  updateItem(cat, 'quantity', parseInt(e.target.value, 10) || 1)
                                }
                              />
                            </Col>
                            <Col xs={6}>
                              <Form.Control
                                size="sm"
                                placeholder="Unit (e.g. litres, boxes)"
                                value={selected.unit}
                                onChange={(e) => updateItem(cat, 'unit', e.target.value)}
                              />
                            </Col>
                          </Row>
                        )}
                      </div>
                    );
                  })}
                </div>

                {errors.categoryItems && (
                  <div style={{ color: '#dc3545', fontSize: '0.875rem', marginTop: 4 }}>
                    {errors.categoryItems}
                  </div>
                )}

                {categoryItems.length > 0 && (
                  <div className="mt-2">
                    <div className="small fw-semibold text-muted mb-1">Summary</div>
                    <div className="d-flex flex-wrap gap-1">
                      {categoryItems.map((c) => (
                        <Badge key={c.category} bg="secondary" style={{ fontSize: '0.72rem' }}>
                          {c.category}: {c.quantity}{c.unit ? ` ${c.unit}` : ''}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </Form.Group>
            </Col>

            {/* Optional section */}
            <Col md={12}>
              <hr className="my-1" />
              <div className="small fw-semibold text-muted mb-2">Optional Details</div>
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label>Remarks</Form.Label>
                <Form.Control
                  as="textarea" rows={1}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Any additional notes…"
                />
              </Form.Group>
            </Col>

            <Col md={4}>
              <Form.Group>
                <Form.Label>Account Details</Form.Label>
                <Form.Control value={accountDetails} onChange={(e) => setAccountDetails(e.target.value)} placeholder="Account number" />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Account Name</Form.Label>
                <Form.Control value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Name on account" />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Bank Name</Form.Label>
                <Form.Control value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Stanbic Bank" />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" style={{ background: '#1B3A6B', borderColor: '#1B3A6B' }} disabled={isSubmitting}>
            {isEdit
              ? (isSubmitting ? 'Saving…' : '💾 Save Changes')
              : (isSubmitting ? 'Submitting…' : 'Submit Requisition')}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
