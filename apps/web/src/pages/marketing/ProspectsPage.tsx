import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Col, Form, Modal, Row, Spinner, Table,
} from 'react-bootstrap';
import {
  PROSPECT_STATUSES, PIPELINE_ORDER,
  prospectStatusLabel, prospectStatusColour,
  type ProspectResponse, type ProspectStatus,
  MARKETING_MANAGER_ROLES,
} from '@stap/shared';
import {
  useProspects, useProspect, useCreateProspect, useUpdateProspect, useConvertProspect,
} from '../../hooks/useMarketing';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { marketingApi } from '../../lib/marketing.api';
import { getApiErrorMessage } from '../../lib/api';

const NAVY  = '#1B3A6B';
const AMBER = '#F2AA20';
const GREY  = '#6c757d';
const GREEN = '#1E8449';


const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const ugxCompact = (n: number) =>
  n >= 1_000_000 ? `UGX ${(n / 1_000_000).toFixed(1)}M` : `UGX ${n.toLocaleString()}`;

// ── Create / edit form ─────────────────────────────────────────────────────────

function ProspectFormModal({
  initialStatus, existing, onClose,
}: {
  initialStatus?: ProspectStatus;
  existing?: ProspectResponse;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const create = useCreateProspect();
  const update = useUpdateProspect();
  const pending = create.isPending || update.isPending;

  const [companyName, setCompanyName]   = useState(existing?.companyName ?? '');
  const [contactName, setContactName]   = useState(existing?.contactName ?? '');
  const [contactPhone, setContactPhone] = useState(existing?.contactPhone ?? '');
  const [contactEmail, setContactEmail] = useState(existing?.contactEmail ?? '');
  const [address, setAddress]           = useState(existing?.address ?? '');
  const [industry, setIndustry]         = useState(existing?.industry ?? '');
  const [value, setValue]               = useState<number | ''>(existing?.estimatedValue ?? '');
  const [notes, setNotes]               = useState(existing?.notes ?? '');
  const [error, setError]               = useState('');

  const submit = () => {
    if (companyName.trim().length < 2) { setError('Company name is required.'); return; }
    setError('');

    const payload = {
      companyName:    companyName.trim(),
      contactName:    contactName.trim() || null,
      contactPhone:   contactPhone.trim() || null,
      contactEmail:   contactEmail.trim() || null,
      address:        address.trim() || null,
      industry:       industry.trim() || null,
      notes:          notes.trim() || null,
      estimatedValue: value === '' ? null : Number(value),
    };
    const handlers = {
      onSuccess: () => { showToast(existing ? 'Prospect updated' : 'Prospect added', 'success'); onClose(); },
      onError:   (err: unknown) => setError(getApiErrorMessage(err, 'Could not save the prospect.')),
    };

    if (existing) update.mutate({ id: existing.id, data: payload }, handlers);
    else          create.mutate({ ...payload, status: initialStatus ?? 'NEW' } as any, handlers);
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1.05rem' }}>
          {existing ? 'Edit prospect' : 'Add prospective client'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

        <Form.Group className="mb-3">
          <Form.Label className="fw-bold small">Company name <span className="text-danger">*</span></Form.Label>
          <Form.Control value={companyName} maxLength={200} placeholder="e.g. Nakumatt Uganda Ltd"
            onChange={(e) => { setCompanyName(e.target.value); setError(''); }} />
        </Form.Group>

        <Row className="g-2 mb-3">
          <Col sm={6}>
            <Form.Label className="fw-bold small">Contact name</Form.Label>
            <Form.Control value={contactName} maxLength={150}
              onChange={(e) => setContactName(e.target.value)} />
          </Col>
          <Col sm={6}>
            <Form.Label className="fw-bold small">Contact phone</Form.Label>
            <Form.Control value={contactPhone} maxLength={40} placeholder="+256 772 123456"
              onChange={(e) => setContactPhone(e.target.value)} />
          </Col>
        </Row>

        <Row className="g-2 mb-3">
          <Col sm={7}>
            <Form.Label className="fw-bold small">Contact email</Form.Label>
            <Form.Control type="email" value={contactEmail} maxLength={150}
              onChange={(e) => setContactEmail(e.target.value)} />
          </Col>
          <Col sm={5}>
            <Form.Label className="fw-bold small">Industry</Form.Label>
            <Form.Control value={industry} maxLength={100} placeholder="e.g. Retail"
              onChange={(e) => setIndustry(e.target.value)} />
          </Col>
        </Row>

        <Row className="g-2 mb-3">
          <Col sm={7}>
            <Form.Label className="fw-bold small">Physical address</Form.Label>
            <Form.Control value={address} maxLength={300}
              onChange={(e) => setAddress(e.target.value)} />
          </Col>
          <Col sm={5}>
            <Form.Label className="fw-bold small">Est. monthly value (UGX)</Form.Label>
            <Form.Control type="number" min={0} value={value}
              onChange={(e) => setValue(e.target.value === '' ? '' : Number(e.target.value))} />
          </Col>
        </Row>

        <Form.Group>
          <Form.Label className="fw-bold small">Notes</Form.Label>
          <Form.Control as="textarea" rows={2} maxLength={4000} value={notes}
            onChange={(e) => setNotes(e.target.value)} />
        </Form.Group>

        <div className="text-muted mt-2" style={{ fontSize: '0.72rem' }}>
          Contact name, phone and address are needed before a won prospect can be converted into a client.
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button style={{ background: NAVY, borderColor: NAVY }} onClick={submit} disabled={pending}>
          {pending
            ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Saving…</>
            : existing ? 'Save changes' : 'Add prospect'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Detail with pipeline control ───────────────────────────────────────────────

function ProspectDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { showToast } = useToast();
  const { data: prospect, isLoading } = useProspect(id);
  const update  = useUpdateProspect();
  const convert = useConvertProspect();

  const [nextStatus, setNextStatus] = useState<ProspectStatus | ''>('');
  const [lostReason, setLostReason] = useState('');
  const [note, setNote]             = useState('');
  const [error, setError]           = useState('');
  const [showEdit, setShowEdit]     = useState(false);

  const applyStatus = () => {
    if (!nextStatus) return;
    if (nextStatus === 'LOST' && !lostReason.trim()) {
      setError('Give a reason before marking this prospect as lost.');
      return;
    }
    setError('');
    update.mutate(
      { id, data: { status: nextStatus, lostReason: lostReason.trim() || null, note: note.trim() || null } },
      {
        onSuccess: () => {
          showToast(`Moved to ${prospectStatusLabel(nextStatus)}`, 'success');
          setNextStatus(''); setLostReason(''); setNote('');
        },
        onError: (err) => setError(getApiErrorMessage(err, 'Could not update the prospect.')),
      },
    );
  };

  const doConvert = () => {
    convert.mutate(id, {
      onSuccess: () => showToast('Converted into a client', 'success'),
      onError:   (err) => setError(getApiErrorMessage(err, 'Could not convert this prospect.')),
    });
  };

  return (
    <>
      <Modal show onHide={onClose} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1.05rem' }}>
            {prospect?.companyName ?? 'Prospect'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {isLoading || !prospect ? (
            <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
          ) : (
            <>
              {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

              <div className="d-flex align-items-center gap-2 mb-3">
                <Badge bg={prospectStatusColour(prospect.status)}>
                  {prospectStatusLabel(prospect.status)}
                </Badge>
                {prospect.estimatedValue != null && (
                  <span className="fw-bold" style={{ color: '#1E8449' }}>
                    {ugxCompact(prospect.estimatedValue)}/mo
                  </span>
                )}
                <Button size="sm" variant="outline-secondary" className="ms-auto"
                  onClick={() => setShowEdit(true)}>
                  ✏️ Edit details
                </Button>
              </div>

              <Row className="g-2 mb-3 small">
                <Col sm={6}><span className="text-muted">Contact:</span> {prospect.contactName ?? '—'}</Col>
                <Col sm={6}><span className="text-muted">Phone:</span> {prospect.contactPhone ?? '—'}</Col>
                <Col sm={6}><span className="text-muted">Email:</span> {prospect.contactEmail ?? '—'}</Col>
                <Col sm={6}><span className="text-muted">Industry:</span> {prospect.industry ?? '—'}</Col>
                <Col sm={12}><span className="text-muted">Address:</span> {prospect.address ?? '—'}</Col>
                <Col sm={6}><span className="text-muted">Assigned to:</span> {prospect.assignedTo?.name ?? '—'}</Col>
                {prospect.wonDate && (
                  <Col sm={6}><span className="text-muted">Won on:</span> {formatDate(prospect.wonDate)}</Col>
                )}
              </Row>

              {prospect.notes && (
                <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '10px 14px',
                              marginBottom: '16px', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                  {prospect.notes}
                </div>
              )}

              {prospect.lostReason && (
                <Alert variant="danger" className="py-2 small">
                  <strong>Lost:</strong> {prospect.lostReason}
                </Alert>
              )}

              {/* Conversion */}
              {prospect.status === 'WON' && (
                prospect.convertedClientId ? (
                  <Alert variant="success" className="py-2 small">
                    ✅ Converted into a client.
                  </Alert>
                ) : (
                  <div className="mb-3">
                    <Button variant="success" size="sm" disabled={convert.isPending} onClick={doConvert}>
                      {convert.isPending
                        ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Converting…</>
                        : '🏆 Convert to client'}
                    </Button>
                  </div>
                )
              )}

              {/* Pipeline move */}
              {!prospect.convertedClientId && (
                <div className="mb-3 p-3" style={{ background: '#F2F4F7', borderRadius: '0.5rem' }}>
                  <div className="fw-bold small mb-2">Move through the pipeline</div>
                  <Row className="g-2">
                    <Col sm={5}>
                      <Form.Select value={nextStatus} onChange={(e) => { setNextStatus(e.target.value as ProspectStatus); setError(''); }}>
                        <option value="">— Select stage —</option>
                        {PROSPECT_STATUSES.filter(s => s.value !== prospect.status).map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </Form.Select>
                    </Col>
                    <Col sm={7}>
                      <Form.Control value={note} maxLength={500} placeholder="Note for the history (optional)"
                        onChange={(e) => setNote(e.target.value)} />
                    </Col>
                  </Row>
                  {nextStatus === 'LOST' && (
                    <Form.Control
                      className="mt-2" value={lostReason} maxLength={500}
                      placeholder="Why was this lost? (required)"
                      isInvalid={!!error && !lostReason.trim()}
                      onChange={(e) => { setLostReason(e.target.value); setError(''); }}
                    />
                  )}
                  <Button
                    size="sm" className="mt-2"
                    style={{ background: NAVY, borderColor: NAVY }}
                    disabled={!nextStatus || update.isPending}
                    onClick={applyStatus}
                  >
                    {update.isPending ? 'Moving…' : 'Move'}
                  </Button>
                </div>
              )}

              {/* History */}
              <div className="fw-bold small mb-2">Status history</div>
              {prospect.statusHistory.length === 0 ? (
                <div className="text-muted small">Nothing recorded yet.</div>
              ) : (
                <div>
                  {prospect.statusHistory.map((h) => (
                    <div key={h.id} style={{
                      borderLeft: `3px solid ${AMBER}`, paddingLeft: '12px',
                      marginBottom: '10px', fontSize: '0.82rem',
                    }}>
                      <div>
                        {h.fromStatus
                          ? <>{prospectStatusLabel(h.fromStatus)} → <strong>{prospectStatusLabel(h.toStatus)}</strong></>
                          : <>Entered pipeline at <strong>{prospectStatusLabel(h.toStatus)}</strong></>}
                      </div>
                      {h.note && <div className="text-muted fst-italic">{h.note}</div>}
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                        {h.changedBy.name} · {formatDate(h.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </Modal.Footer>
      </Modal>

      {showEdit && prospect && (
        <ProspectFormModal existing={prospect} onClose={() => setShowEdit(false)} />
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ProspectsPage() {
  const [view, setView]           = useState<'board' | 'list'>('board');
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');
  const [detailId, setDetailId]   = useState<string | null>(null);
  const [createIn, setCreateIn]   = useState<ProspectStatus | null>(null);
  const [officerFilter, setOfficerFilter] = useState('');

  const { user } = useAuth();
  const isManager = (MARKETING_MANAGER_ROLES as string[]).includes(user?.role ?? '');

  // Sales officers to offer in the head's filter, from the marketing module
  // rather than the staff directory — that is gated on staff-management roles a
  // marketing head does not hold. The API scopes the board by the caller's own
  // role regardless, so this only narrows a view that is already allowed.
  const { data: marketingOfficers = [] } = useQuery({
    queryKey: ['marketing', 'sales-staff'],
    queryFn:  marketingApi.salesStaff,
    enabled:  isManager,
  });

  const { data, isLoading } = useProspects(
    isManager && officerFilter ? { assignedToId: officerFilter } : undefined,
  );
  const prospects = data?.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return prospects.filter((p) =>
      (!statusFilter || p.status === statusFilter) &&
      (!q ||
        p.companyName.toLowerCase().includes(q) ||
        (p.contactName ?? '').toLowerCase().includes(q) ||
        (p.industry ?? '').toLowerCase().includes(q)),
    );
  }, [prospects, search, statusFilter]);

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <h5 className="fw-bold mb-0" style={{ color: NAVY }}>Prospective Clients</h5>
          <div className="text-muted small">{filtered.length} of {prospects.length} shown</div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Form.Control
            size="sm" style={{ width: 220 }} value={search}
            placeholder="Search company, contact, industry…"
            onChange={(e) => setSearch(e.target.value)}
          />
          <Form.Select size="sm" style={{ width: 170 }} value={statusFilter}
            onChange={(e) => setStatus(e.target.value)}>
            <option value="">All stages</option>
            {PROSPECT_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Form.Select>
          <Button size="sm" variant={view === 'board' ? 'primary' : 'outline-primary'}
            onClick={() => setView('board')}>Board</Button>
          <Button size="sm" variant={view === 'list' ? 'primary' : 'outline-primary'}
            onClick={() => setView('list')}>List</Button>
          <Button size="sm" style={{ background: NAVY, borderColor: NAVY }}
            onClick={() => setCreateIn('NEW')}>+ Add prospect</Button>
        </div>
      </div>

      {/* Whose leads am I looking at? Without this an officer cannot tell an
          empty pipeline from a filtered one. */}
      <div style={{
        background:     isManager ? '#D6E0F0' : '#EBF5FB',
        borderRadius:   '0.5rem',
        padding:        '8px 14px',
        marginBottom:   '14px',
        fontSize:       '0.82rem',
        borderLeft:     `3px solid ${NAVY}`,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        flexWrap:       'wrap',
        gap:            '8px',
      }}>
        <span>
          {isManager ? (
            <>👁️ <strong>Head view</strong> — showing all leads from all sales staff</>
          ) : (
            <>🤝 <strong>My leads</strong> — showing only leads assigned to you</>
          )}
        </span>

        {isManager && marketingOfficers.length > 0 && (
          <div className="d-flex align-items-center gap-2">
            <span className="text-muted small">Filter by sales officer:</span>
            <Form.Select
              size="sm"
              value={officerFilter}
              onChange={(e) => setOfficerFilter(e.target.value)}
              style={{ fontSize: '0.78rem', width: 'auto', minWidth: 160 }}
            >
              <option value="">All sales staff</option>
              {marketingOfficers.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </Form.Select>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : view === 'board' ? (
        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '16px' }}>
          {PIPELINE_ORDER.map((stage) => {
            const stageProspects = filtered.filter(p => p.status === stage);
            // Won and lost are where a deal stops moving. Both read as
            // outcomes rather than next steps, and neither takes a new lead.
            const isLost = stage === 'LOST';
            const isWon  = stage === 'WON';
            const accent = isLost ? GREY : isWon ? GREEN : AMBER;

            return (
              <div key={stage} style={{
                minWidth:     230,
                background:   isLost ? '#F8F9FA' : isWon ? '#F0FFF4' : '#F2F4F7',
                borderRadius: '0.5rem',
                overflow:     'hidden',
              }}>
                <div style={{
                  background:     isLost ? GREY : isWon ? GREEN : NAVY,
                  padding:        '8px 12px',
                  display:        'flex',
                  justifyContent: 'space-between',
                  alignItems:     'center',
                }}>
                  <span style={{ color: 'white', fontSize: '0.8rem', fontWeight: 600 }}>
                    {prospectStatusLabel(stage)}
                  </span>
                  <Badge
                    bg={isLost ? 'secondary' : isWon ? 'success' : 'light'}
                    text={!isLost && !isWon ? 'dark' : undefined}
                    style={{ fontSize: '0.68rem' }}
                  >
                    {stageProspects.length}
                  </Badge>
                </div>
                <div style={{ padding: '8px', minHeight: 200, maxHeight: 600, overflowY: 'auto' }}>
                  {stageProspects.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#adb5bd', fontSize: '0.75rem', padding: '20px 8px' }}>
                      {isLost ? 'No lost leads' : isWon ? 'No won leads' : 'None'}
                    </div>
                  )}
                  {stageProspects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setDetailId(p.id)}
                      style={{
                        background: 'white', borderRadius: '0.375rem', padding: '10px 12px',
                        marginBottom: '8px', cursor: 'pointer', borderLeft: `3px solid ${accent}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                        opacity: isLost ? 0.85 : 1,
                      }}
                    >
                      <div className="fw-bold" style={{
                        fontSize:       '0.85rem',
                        textDecoration: isLost ? 'line-through' : 'none',
                        color:          isLost ? GREY : '#1A1A1A',
                      }}>
                        {p.companyName}
                      </div>
                      {p.contactName && (
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{p.contactName}</div>
                      )}
                      {p.estimatedValue != null && (
                        <div style={{
                          fontSize: '0.72rem', fontWeight: 600, marginTop: 4,
                          color: isLost ? '#adb5bd' : GREEN,
                        }}>
                          {ugxCompact(p.estimatedValue)}/mo
                        </div>
                      )}
                      {isLost && p.lostReason && (
                        <div style={{ fontSize: '0.7rem', color: '#dc3545', marginTop: 4, fontStyle: 'italic' }}>
                          ❌ {p.lostReason}
                        </div>
                      )}
                      <div style={{ fontSize: '0.68rem', color: '#adb5bd', marginTop: 4 }}>
                        {formatDate(p.updatedAt)}
                      </div>
                    </div>
                  ))}
                  {!isLost && !isWon && (
                    <Button
                      variant="outline-secondary" size="sm" className="w-100 mt-1"
                      style={{ fontSize: '0.75rem', borderStyle: 'dashed' }}
                      onClick={() => setCreateIn(stage)}
                    >
                      + Add
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table striped size="sm" className="small">
            <thead className="table-light">
              <tr>
                <th>Company</th><th>Contact</th><th>Industry</th><th>Stage</th>
                <th className="text-end">Est. Value</th><th>Assigned To</th><th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted py-4">No prospects match.</td></tr>
              ) : filtered.map((p) => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(p.id)}>
                  <td className="fw-semibold">{p.companyName}</td>
                  <td>{p.contactName ?? '—'}</td>
                  <td>{p.industry ?? '—'}</td>
                  <td><Badge bg={prospectStatusColour(p.status)}>{prospectStatusLabel(p.status)}</Badge></td>
                  <td className="text-end">{p.estimatedValue != null ? ugxCompact(p.estimatedValue) : '—'}</td>
                  <td>{p.assignedTo?.name ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {createIn && <ProspectFormModal initialStatus={createIn} onClose={() => setCreateIn(null)} />}
      {detailId && <ProspectDetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
