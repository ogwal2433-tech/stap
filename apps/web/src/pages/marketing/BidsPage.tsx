import { useState } from 'react';
import { Alert, Badge, Button, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';
import {
  BID_TYPES, BID_STATUSES, bidStatusLabel, bidStatusColour,
  type BidResponse, type BidType, type BidStatus,
} from '@stap/shared';
import { useBids, useCreateBid, useUpdateBid } from '../../hooks/useMarketing';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

const NAVY = '#1B3A6B';

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const toIso = (d: string) => (d ? new Date(`${d}T00:00:00.000Z`).toISOString() : null);

function BidFormModal({ existing, onClose }: { existing?: BidResponse; onClose: () => void }) {
  const { showToast } = useToast();
  const create = useCreateBid();
  const update = useUpdateBid();
  const pending = create.isPending || update.isPending;

  const [organization, setOrganization] = useState(existing?.organization ?? '');
  const [bidType, setBidType]           = useState<BidType>(existing?.bidType ?? 'TENDER');
  const [amount, setAmount]             = useState<number | ''>(existing?.amount ?? '');
  const [submissionDate, setSubmission] = useState(toDateInput(existing?.submissionDate ?? null));
  const [closingDate, setClosing]       = useState(toDateInput(existing?.closingDate ?? null));
  const [status, setStatus]             = useState<BidStatus>(existing?.status ?? 'DRAFT');
  const [description, setDescription]   = useState(existing?.description ?? '');
  const [requirements, setRequirements] = useState(existing?.requirements ?? '');
  const [notes, setNotes]               = useState(existing?.notes ?? '');
  const [lostReason, setLostReason]     = useState(existing?.lostReason ?? '');
  const [error, setError]               = useState('');

  const submit = () => {
    if (organization.trim().length < 2) { setError('Organisation is required.'); return; }
    if (status === 'LOST' && !lostReason.trim()) { setError('Give a reason before marking this bid as lost.'); return; }
    if (submissionDate && closingDate && submissionDate > closingDate) {
      setError('Submission date cannot be after the closing date.');
      return;
    }
    setError('');

    const payload = {
      organization:   organization.trim(),
      bidType,
      amount:         amount === '' ? null : Number(amount),
      submissionDate: toIso(submissionDate),
      closingDate:    toIso(closingDate),
      status,
      description:    description.trim() || null,
      requirements:   requirements.trim() || null,
      notes:          notes.trim() || null,
      lostReason:     status === 'LOST' ? lostReason.trim() : null,
    };
    const handlers = {
      onSuccess: () => { showToast(existing ? 'Bid updated' : 'Bid created', 'success'); onClose(); },
      onError:   (err: unknown) => setError(getApiErrorMessage(err, 'Could not save the bid.')),
    };

    if (existing) update.mutate({ id: existing.id, data: payload as any }, handlers);
    else          create.mutate(payload as any, handlers);
  };

  return (
    <Modal show onHide={onClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem' }}>{existing ? 'Edit bid' : 'New bid / tender'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        <Row className="g-2 mb-3">
          <Col sm={7}>
            <Form.Label className="fw-bold small">Organisation <span className="text-danger">*</span></Form.Label>
            <Form.Control value={organization} maxLength={200} placeholder="e.g. Ministry of Finance"
              onChange={(e) => { setOrganization(e.target.value); setError(''); }} />
          </Col>
          <Col sm={5}>
            <Form.Label className="fw-bold small">Bid type</Form.Label>
            <Form.Select value={bidType} onChange={(e) => setBidType(e.target.value as BidType)}>
              {BID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Form.Select>
          </Col>
        </Row>

        <Row className="g-2 mb-3">
          <Col sm={4}>
            <Form.Label className="fw-bold small">Amount (UGX)</Form.Label>
            <Form.Control type="number" min={0} value={amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))} />
          </Col>
          <Col sm={4}>
            <Form.Label className="fw-bold small">Submission date</Form.Label>
            <Form.Control type="date" value={submissionDate}
              onChange={(e) => { setSubmission(e.target.value); setError(''); }} />
          </Col>
          <Col sm={4}>
            <Form.Label className="fw-bold small">Closing date</Form.Label>
            <Form.Control type="date" value={closingDate}
              onChange={(e) => { setClosing(e.target.value); setError(''); }} />
          </Col>
        </Row>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Status</Form.Label>
          <Form.Select value={status} onChange={(e) => { setStatus(e.target.value as BidStatus); setError(''); }}>
            {BID_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Form.Select>
        </Form.Group>

        {status === 'LOST' && (
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold small">Reason lost <span className="text-danger">*</span></Form.Label>
            <Form.Control value={lostReason} maxLength={500}
              onChange={(e) => { setLostReason(e.target.value); setError(''); }} />
          </Form.Group>
        )}

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Description</Form.Label>
          <Form.Control as="textarea" rows={2} maxLength={4000} value={description}
            onChange={(e) => setDescription(e.target.value)} />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Requirements</Form.Label>
          <Form.Control as="textarea" rows={2} maxLength={4000} value={requirements}
            onChange={(e) => setRequirements(e.target.value)} />
        </Form.Group>

        <Form.Group>
          <Form.Label className="fw-bold small">Notes</Form.Label>
          <Form.Control as="textarea" rows={2} maxLength={2000} value={notes}
            onChange={(e) => setNotes(e.target.value)} />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button style={{ background: NAVY, borderColor: NAVY }} onClick={submit} disabled={pending}>
          {pending
            ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Saving…</>
            : existing ? 'Save changes' : 'Create bid'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default function BidsPage() {
  const [statusFilter, setStatus] = useState('');
  const [typeFilter, setType]     = useState('');
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<BidResponse | null>(null);

  const { data, isLoading } = useBids({
    status:  statusFilter || undefined,
    bidType: typeFilter || undefined,
    search:  search.trim() || undefined,
  });
  const bids = data?.data ?? [];

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <h5 className="fw-bold mb-0" style={{ color: NAVY }}>Bids &amp; Tenders</h5>
          <div className="text-muted small">{bids.length} shown</div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Form.Control size="sm" style={{ width: 200 }} value={search} placeholder="Search organisation…"
            onChange={(e) => setSearch(e.target.value)} />
          <Form.Select size="sm" style={{ width: 150 }} value={statusFilter} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {BID_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Form.Select>
          <Form.Select size="sm" style={{ width: 130 }} value={typeFilter} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {BID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </Form.Select>
          <Button size="sm" style={{ background: NAVY, borderColor: NAVY }} onClick={() => setShowForm(true)}>
            + New bid
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table striped size="sm" className="small">
            <thead className="table-light">
              <tr>
                <th>Organisation</th><th>Type</th><th className="text-end">Amount</th>
                <th>Submitted</th><th>Closing</th><th>Status</th><th>Assigned To</th><th />
              </tr>
            </thead>
            <tbody>
              {bids.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-muted py-4">No bids recorded.</td></tr>
              ) : bids.map((b) => {
                // Only live bids get a countdown — a closed one is not "overdue".
                const live = b.status === 'DRAFT' || b.status === 'SUBMITTED';
                return (
                  <tr key={b.id}>
                    <td className="fw-semibold">{b.organization}</td>
                    <td>{b.bidType}</td>
                    <td className="text-end">{b.amount != null ? b.amount.toLocaleString() : '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(b.submissionDate)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(b.closingDate)}
                      {live && b.daysToClosing != null && b.daysToClosing >= 0 && b.daysToClosing <= 7 && (
                        <Badge bg="danger" className="ms-1" style={{ fontSize: '0.65rem' }}>
                          {b.daysToClosing}d left
                        </Badge>
                      )}
                      {live && b.daysToClosing != null && b.daysToClosing < 0 && (
                        <Badge bg="secondary" className="ms-1" style={{ fontSize: '0.65rem' }}>closed</Badge>
                      )}
                    </td>
                    <td><Badge bg={bidStatusColour(b.status)}>{bidStatusLabel(b.status)}</Badge></td>
                    <td>{b.assignedTo?.name ?? '—'}</td>
                    <td>
                      <Button size="sm" variant="outline-secondary" style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                        onClick={() => setEditing(b)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}

      {showForm && <BidFormModal onClose={() => setShowForm(false)} />}
      {editing  && <BidFormModal existing={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
