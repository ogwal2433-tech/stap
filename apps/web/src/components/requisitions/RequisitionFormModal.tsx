import { useState } from 'react';
import { Modal, Form, Button, Row, Col, Badge } from 'react-bootstrap';
import { useCreateRequisition } from '../../hooks/useRequisitions';
import { useToast } from '../../context/ToastContext';

interface Props { onClose: () => void }

const CATEGORIES = [
  { value: 'UNIFORM',             label: 'Uniform' },
  { value: 'EQUIPMENT',           label: 'Equipment' },
  { value: 'STATIONERY',          label: 'Stationery' },
  { value: 'VEHICLE_MAINTENANCE', label: 'Vehicle Maintenance' },
  { value: 'OTHER',               label: 'Other' },
] as const;

const URGENCY = [
  { value: 'LOW',    label: 'Low' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'HIGH',   label: 'High' },
  { value: 'URGENT', label: 'Urgent' },
];

type Category = typeof CATEGORIES[number]['value'];

export default function RequisitionFormModal({ onClose }: Props) {
  const { showToast } = useToast();
  const createReq = useCreateRequisition();

  const [categories, setCategories] = useState<Category[]>([]);
  const [description, setDescription] = useState('');
  const [particulars, setParticulars] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [estimatedUnitCost, setEstimatedUnitCost] = useState('');
  const [urgency, setUrgency] = useState<string>('NORMAL');
  const [justification, setJustification] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountDetails, setAccountDetails] = useState('');
  const [bankName, setBankName] = useState('');
  const [remarks, setRemarks] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const unitCost = parseInt(estimatedUnitCost.replace(/[^\d]/g, ''), 10) || 0;
  const total = quantity * unitCost;

  function toggleCategory(cat: Category) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
    setErrors((e) => ({ ...e, categories: '' }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (categories.length === 0) e.categories = 'Select at least one category';
    if (description.trim().length < 10) e.description = 'Description must be at least 10 characters';
    if (quantity < 1) e.quantity = 'Quantity must be at least 1';
    if (unitCost <= 0) e.estimatedUnitCost = 'Unit cost must be positive';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    try {
      await createReq.mutateAsync({
        categories,
        description: description.trim(),
        particulars: particulars.trim() || undefined,
        quantity,
        estimatedUnitCost: unitCost,
        urgency: urgency as any,
        justification: justification.trim() || undefined,
        accountName: accountName.trim() || undefined,
        accountDetails: accountDetails.trim() || undefined,
        bankName: bankName.trim() || undefined,
        remarks: remarks.trim() || undefined,
      });
      showToast('Requisition submitted', 'success');
      onClose();
    } catch {
      showToast('Failed to submit requisition', 'danger');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>New Requisition</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          <Row className="g-3">
            {/* Categories — multi-select checkboxes */}
            <Col md={12}>
              <Form.Label className="fw-semibold">
                Category <span className="text-danger">*</span>
              </Form.Label>
              <div className="d-flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <Form.Check
                    key={c.value}
                    type="checkbox"
                    id={`cat-${c.value}`}
                    label={c.label}
                    checked={categories.includes(c.value)}
                    onChange={() => toggleCategory(c.value)}
                    className="me-2"
                  />
                ))}
              </div>
              {categories.length > 0 && (
                <div className="mt-2 d-flex gap-1 flex-wrap">
                  {categories.map((c) => (
                    <Badge key={c} bg="secondary" className="small">
                      {CATEGORIES.find((x) => x.value === c)?.label}
                    </Badge>
                  ))}
                </div>
              )}
              {errors.categories && <div className="text-danger small mt-1">{errors.categories}</div>}
            </Col>

            {/* Urgency */}
            <Col md={4}>
              <Form.Group>
                <Form.Label>Urgency</Form.Label>
                <Form.Select value={urgency} onChange={(e) => setUrgency(e.target.value)}>
                  {URGENCY.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>

            {/* Description */}
            <Col md={12}>
              <Form.Group>
                <Form.Label>Description <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  as="textarea" rows={2}
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); setErrors((x) => ({ ...x, description: '' })); }}
                  placeholder="Describe the item(s) needed…"
                  isInvalid={!!errors.description}
                />
                <Form.Control.Feedback type="invalid">{errors.description}</Form.Control.Feedback>
              </Form.Group>
            </Col>

            {/* Particulars */}
            <Col md={12}>
              <Form.Group>
                <Form.Label>Particulars <span className="text-muted small">(optional)</span></Form.Label>
                <Form.Control
                  as="textarea" rows={2}
                  value={particulars}
                  onChange={(e) => setParticulars(e.target.value)}
                  placeholder="Specific details, sizes, specifications…"
                />
              </Form.Group>
            </Col>

            {/* Qty / Cost / Total */}
            <Col md={4}>
              <Form.Group>
                <Form.Label>Quantity <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="number" min={1}
                  value={quantity}
                  onChange={(e) => { setQuantity(parseInt(e.target.value, 10) || 1); setErrors((x) => ({ ...x, quantity: '' })); }}
                  isInvalid={!!errors.quantity}
                />
                <Form.Control.Feedback type="invalid">{errors.quantity}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Est. Unit Cost (UGX) <span className="text-danger">*</span></Form.Label>
                <Form.Control
                  type="text" inputMode="numeric"
                  value={estimatedUnitCost}
                  onChange={(e) => { setEstimatedUnitCost(e.target.value.replace(/[^\d]/g, '')); setErrors((x) => ({ ...x, estimatedUnitCost: '' })); }}
                  placeholder="0"
                  isInvalid={!!errors.estimatedUnitCost}
                />
                <Form.Control.Feedback type="invalid">{errors.estimatedUnitCost}</Form.Control.Feedback>
              </Form.Group>
            </Col>
            <Col md={4} className="d-flex align-items-end">
              <div className="w-100 p-2 rounded bg-light text-center">
                <div className="small text-muted">Est. Total</div>
                <div className="fw-bold" style={{ color: '#1B3A6B' }}>UGX {total.toLocaleString()}</div>
              </div>
            </Col>

            {/* Justification */}
            <Col md={12}>
              <Form.Group>
                <Form.Label>Justification <span className="text-muted small">(optional)</span></Form.Label>
                <Form.Control as="textarea" rows={2} value={justification} onChange={(e) => setJustification(e.target.value)} />
              </Form.Group>
            </Col>

            {/* Payment Details */}
            <Col md={12}>
              <hr className="my-1" />
              <div className="small fw-semibold text-muted mb-2">Payment Details (optional)</div>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Account Name</Form.Label>
                <Form.Control value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Name on account" />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Account Number</Form.Label>
                <Form.Control value={accountDetails} onChange={(e) => setAccountDetails(e.target.value)} placeholder="Account number" />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Bank Name</Form.Label>
                <Form.Control value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Stanbic Bank" />
              </Form.Group>
            </Col>

            {/* Remarks */}
            <Col md={12}>
              <Form.Group>
                <Form.Label>Remarks <span className="text-muted small">(optional)</span></Form.Label>
                <Form.Control as="textarea" rows={1} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any additional notes…" />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" style={{ background: '#1B3A6B', borderColor: '#1B3A6B' }} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit Requisition'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
