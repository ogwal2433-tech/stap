import { useState } from 'react';
import {
  Badge, Breadcrumb, Button, Card, Alert, Form,
  Col, Row, Spinner, Tab, Table, Tabs, Modal,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import {
  useRequisitions, useSuppliers, useApproveRequisition,
  useHRApproveRequisition, useDirectorApproveRequisition,
  useAssignRequisition, useUpdateRequisitionProgress,
  useCreatePurchaseOrder, useAccountability,
} from '../../hooks/useRequisitions';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '@stap/shared';
import RoleGuard from '../../components/RoleGuard';
import RequisitionFormModal from '../../components/requisitions/RequisitionFormModal';
import ApprovalModal from '../../components/requisitions/ApprovalModal';
import PurchaseOrderModal from '../../components/requisitions/PurchaseOrderModal';
import SupplierFormModal from '../../components/requisitions/SupplierFormModal';
import AccountabilityTable from '../../components/requisitions/AccountabilityTable';
import AccountabilityFormModal from '../../components/requisitions/AccountabilityFormModal';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { useStaffUsers } from '../../hooks/useUsers';
import { ROLES } from '@stap/shared';
import type { RequisitionResponse } from '@stap/shared';

const NAVY = '#1B3A6B';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text?: string }> = {
    PENDING:     { bg: 'warning', text: 'dark' },
    SUBMITTED:   { bg: 'warning', text: 'dark' },
    APPROVED:    { bg: 'success' },
    ASSIGNED:    { bg: 'info', text: 'dark' },
    IN_PROGRESS: { bg: 'primary' },
    COMPLETED:   { bg: 'success' },
    REJECTED:    { bg: 'danger' },
    CANCELLED:   { bg: 'secondary' },
  };
  const cfg = map[status] ?? { bg: 'secondary' };
  return <Badge bg={cfg.bg} text={cfg.text as any}>{status.replace('_', ' ')}</Badge>;
}

// ── Category badges helper ────────────────────────────────────────────────────

function CategoryBadges({ items }: { items: RequisitionResponse['categoryItems'] }) {
  return (
    <div className="d-flex flex-wrap gap-1 mt-1">
      {items.map((item) => (
        <Badge key={item.id} bg="light" text="dark" style={{ fontSize: '0.65rem', border: '1px solid #dee2e6' }}>
          {item.category}: {item.quantity}{item.unit ? ` ${item.unit}` : ''}
        </Badge>
      ))}
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function RequisitionDetailModal({ req, onClose }: { req: RequisitionResponse; onClose: () => void }) {
  const { user } = useAuth();
  const { data: accountability, refetch: refetchAccountability } = useAccountability(req.id);
  const [showAccountabilityForm, setShowAccountabilityForm] = useState(false);

  // Accountability applies once the money has been released.
  const fundsReleased = ['APPROVED', 'ASSIGNED', 'IN_PROGRESS'].includes(req.status);
  const closed = accountability?.status === 'DIRECTOR_APPROVED';

  return (
    <Modal show onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title className="fs-6 fw-semibold">Requisition Detail</Modal.Title>
      </Modal.Header>
      <Modal.Body className="small">
        <Row className="g-3">
          <Col md={4}><strong>Date:</strong><div>{formatDate(req.date)}</div></Col>
          <Col md={4}><strong>Status:</strong><div className="mt-1">{statusBadge(req.status)}</div></Col>
          <Col md={4}><strong>Amount:</strong><div>UGX {req.amount.toLocaleString()}</div></Col>

          <Col md={12}>
            <strong>Particulars:</strong>
            <div className="mt-1">{req.particulars}</div>
          </Col>

          {req.categoryItems.length > 0 && (
            <Col md={12}>
              <strong>Category Breakdown:</strong>
              <Table size="sm" bordered className="mt-1 mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Category</th>
                    <th style={{ width: 100 }} className="text-center">Quantity</th>
                    <th style={{ width: 120 }} className="text-center">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {req.categoryItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.category}</td>
                      <td className="text-center">{item.quantity}</td>
                      <td className="text-center">{item.unit ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Col>
          )}

          <Col md={6}><strong>Requested By:</strong><div>{req.requestedBy.name}</div></Col>
          <Col md={6}><strong>Assigned To:</strong><div>{req.assignedTo?.name ?? '—'}</div></Col>

          <Col md={6}>
            <strong>HR Approval:</strong>
            <div>{req.hrApproved.at ? `✓ ${req.hrApproved.by?.name ?? ''} on ${formatDate(req.hrApproved.at)}` : 'Pending'}</div>
          </Col>
          <Col md={6}>
            <strong>Director Approval:</strong>
            <div>{req.directorApproved.at ? `✓ ${req.directorApproved.by?.name ?? ''} on ${formatDate(req.directorApproved.at)}` : 'Pending'}</div>
          </Col>

          {req.progress && (
            <Col md={12}><strong>Progress:</strong><div>{req.progress}</div></Col>
          )}
          {req.remarks && (
            <Col md={12}><strong>Remarks:</strong><div>{req.remarks}</div></Col>
          )}
          {(req.accountName || req.accountDetails || req.bankName) && (
            <>
              <Col md={4}><strong>Account Name:</strong><div>{req.accountName ?? '—'}</div></Col>
              <Col md={4}><strong>Account Details:</strong><div>{req.accountDetails ?? '—'}</div></Col>
              <Col md={4}><strong>Bank:</strong><div>{req.bankName ?? '—'}</div></Col>
            </>
          )}
          {req.rejectionReason && (
            <Col md={12}>
              <Alert variant="danger" className="mb-0 py-2">
                <strong>Rejection reason:</strong> {req.rejectionReason}
              </Alert>
            </Col>
          )}

          {/* ── Accountability ─────────────────────────────────────────────── */}
          <Col md={12}>
            <hr className="my-2" />
            <div className="d-flex align-items-center justify-content-between mb-2">
              <strong>Accountability</strong>
              {fundsReleased && !closed && (
                <Button size="sm" variant="outline-primary" onClick={() => setShowAccountabilityForm(true)}>
                  {accountability ? 'Revise breakdown' : '+ Submit accountability'}
                </Button>
              )}
            </div>

            {!accountability ? (
              <div style={{
                border: '2px dashed #ced4da', borderRadius: '0.5rem',
                padding: '18px', textAlign: 'center', color: '#6c757d', fontSize: '0.82rem',
              }}>
                {fundsReleased
                  ? 'Nothing accounted for yet. Record what the money was actually spent on.'
                  : 'Accountability applies once the requisition is approved and funds released.'}
              </div>
            ) : (
              <AccountabilityTable
                accountability={accountability}
                requisitionId={req.id}
                userRole={user?.role as UserRole | undefined}
                onUpdated={() => refetchAccountability()}
              />
            )}
          </Col>
        </Row>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </Modal.Footer>

      {showAccountabilityForm && (
        <AccountabilityFormModal
          requisitionId={req.id}
          requisitionAmount={req.amount}
          existing={accountability}
          onClose={() => setShowAccountabilityForm(false)}
          onSuccess={() => refetchAccountability()}
        />
      )}
    </Modal>
  );
}

// ── Assign Modal ──────────────────────────────────────────────────────────────

function AssignModal({ requisition, onClose }: { requisition: RequisitionResponse; onClose: () => void }) {
  const [userId, setUserId] = useState('');
  const assign = useAssignRequisition();
  const { data: staffUsers = [], isLoading: staffLoading } = useStaffUsers();

  const staffOptions = staffUsers.map((u) => ({
    value:    u.id,
    label:    u.name,
    sublabel: u.role.replace(/_/g, ' '),
  }));
  const selected = staffUsers.find((u) => u.id === userId);

  async function handleAssign() {
    if (!userId.trim()) return;
    try {
      await assign.mutateAsync({ id: requisition.id, data: { assignedToId: userId.trim() } });
      onClose();
    } catch { /* mutation handles error display */ }
  }

  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton><Modal.Title>Assign Requisition</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form.Group>
          <Form.Label className="fw-bold small">Assign To <span className="text-danger">*</span></Form.Label>
          <SearchableSelect
            options={staffOptions}
            value={userId}
            onChange={setUserId}
            placeholder="— Search and select staff member —"
            searchPlaceholder="Type name or role…"
            isLoading={staffLoading}
          />
          <Form.Text className="text-muted">
            Select the staff member who will be responsible for this requisition.
          </Form.Text>

          {selected && (
            <div style={{
              background: '#D0EDE9', borderRadius: '0.375rem', padding: '8px 12px',
              marginTop: '6px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '8px',
            }}>
              <span style={{ fontSize: '1.1rem' }}>👤</span>
              <div>
                <div style={{ fontWeight: 600, color: '#1B3A6B' }}>{selected.name}</div>
                <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                  {selected.role.replace(/_/g, ' ')}
                  {selected.systemId && (
                    <span style={{ fontFamily: 'monospace', marginLeft: '6px' }}>· {selected.systemId}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button style={{ background: NAVY, borderColor: NAVY }} onClick={handleAssign} disabled={assign.isPending || !userId.trim()}>
          {assign.isPending ? 'Assigning…' : 'Assign'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── Progress Modal ────────────────────────────────────────────────────────────

function ProgressModal({ requisition, onClose }: { requisition: RequisitionResponse; onClose: () => void }) {
  const [note, setNote] = useState(requisition.progress ?? '');
  const update = useUpdateRequisitionProgress();

  async function handleSave() {
    if (!note.trim()) return;
    try {
      await update.mutateAsync({ id: requisition.id, data: { progress: note.trim() } });
      onClose();
    } catch { /* mutation handles error display */ }
  }

  return (
    <Modal show onHide={onClose}>
      <Modal.Header closeButton><Modal.Title>Update Progress</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form.Group>
          <Form.Label>Progress Note</Form.Label>
          <Form.Control
            as="textarea" rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Describe current status / progress…"
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button style={{ background: NAVY, borderColor: NAVY }} onClick={handleSave} disabled={update.isPending || !note.trim()}>
          {update.isPending ? 'Saving…' : 'Save Progress'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// ── My Requisitions Tab ───────────────────────────────────────────────────────

function MyRequisitionsTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [detailReq, setDetailReq]   = useState<RequisitionResponse | null>(null);
  const { data, isLoading }         = useRequisitions();
  const reqs = data?.data ?? [];

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <span className="fw-semibold">My Requisitions</span>
        <Button size="sm" style={{ background: NAVY, borderColor: NAVY }} onClick={() => setShowCreate(true)}>
          + New Requisition
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
      ) : (
        <Table striped responsive className="small">
          <thead className="table-light">
            <tr>
              <th>Date</th>
              <th>Particulars</th>
              <th className="text-end">Requisition Amount</th>
              <th>HR Approves</th>
              <th>Director Approves</th>
              <th>Assigned To</th>
              <th>Progress</th>
              <th>Remarks</th>
              <th>Account Details</th>
              <th>Account Name</th>
              <th>Bank Name</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {reqs.length === 0 ? (
              <tr><td colSpan={12} className="text-center text-muted py-4">No requisitions yet</td></tr>
            ) : reqs.map((r) => (
              <tr
                key={r.id}
                style={{ cursor: 'pointer' }}
                onClick={() => setDetailReq(r)}
              >
                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                <td style={{ maxWidth: 180 }}>
                  <div className="text-truncate">{r.particulars}</div>
                  <CategoryBadges items={r.categoryItems} />
                </td>
                <td className="text-end" style={{ whiteSpace: 'nowrap' }}>UGX {r.amount.toLocaleString()}</td>
                <td>
                  {r.hrApproved.at
                    ? <Badge bg="success">✓ {formatDate(r.hrApproved.at)}</Badge>
                    : <Badge bg="warning" text="dark">Pending</Badge>
                  }
                </td>
                <td>
                  {r.directorApproved.at
                    ? <Badge bg="success">✓ {formatDate(r.directorApproved.at)}</Badge>
                    : <Badge bg="warning" text="dark">Pending</Badge>
                  }
                </td>
                <td>
                  {r.assignedTo ? (
                    <div>
                      <div style={{ fontSize: '0.83rem', fontWeight: 500 }}>{r.assignedTo.name}</div>
                      <div style={{ fontSize: '0.7rem', color: '#6c757d' }}>{r.assignedTo.role.replace(/_/g, ' ')}</div>
                    </div>
                  ) : (
                    <span className="text-muted small">Not assigned</span>
                  )}
                </td>
                <td className="text-truncate" style={{ maxWidth: 120 }}>{r.progress ?? '—'}</td>
                <td className="text-truncate" style={{ maxWidth: 120 }}>{r.remarks ?? '—'}</td>
                <td className="text-truncate" style={{ maxWidth: 120 }}>{r.accountDetails ?? '—'}</td>
                <td>{r.accountName ?? '—'}</td>
                <td>{r.bankName ?? '—'}</td>
                <td>{statusBadge(r.status)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {showCreate && <RequisitionFormModal onClose={() => setShowCreate(false)} />}
      {detailReq && <RequisitionDetailModal req={detailReq} onClose={() => setDetailReq(null)} />}
    </>
  );
}

// ── Manage Tab (Director / Admin) ─────────────────────────────────────────────

function ManageTab() {
  const [rejectReq, setRejectReq]     = useState<RequisitionResponse | null>(null);
  const [assignReq, setAssignReq]     = useState<RequisitionResponse | null>(null);
  const [progressReq, setProgressReq] = useState<RequisitionResponse | null>(null);
  const [poReq, setPoReq]             = useState<RequisitionResponse | null>(null);
  const [detailReq, setDetailReq]     = useState<RequisitionResponse | null>(null);

  const { data, isLoading } = useRequisitions();
  const { user }            = useAuth();
  const hrApprove           = useHRApproveRequisition();
  const dirApprove          = useDirectorApproveRequisition();
  const reqs = data?.data ?? [];

  const isDirector = user?.role === ROLES.DIRECTOR;
  const isAdmin    = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR].includes(user?.role as any);

  const pendingCount = reqs.filter((r) => ['PENDING', 'SUBMITTED'].includes(r.status)).length;

  return (
    <>
      {pendingCount > 0 && (
        <Alert variant="warning" className="small py-2">
          {pendingCount} requisition(s) awaiting approval
        </Alert>
      )}

      {isLoading ? (
        <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
      ) : (
        <Table striped responsive className="small">
          <thead className="table-light">
            <tr>
              <th>Date</th>
              <th>Particulars</th>
              <th className="text-end">Amount</th>
              <th>Requested By</th>
              <th>HR Approves</th>
              <th>Director Approves</th>
              <th>Assigned To</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reqs.length === 0 ? (
              <tr><td colSpan={9} className="text-center text-muted py-4">No requisitions</td></tr>
            ) : reqs.map((r) => (
              <tr key={r.id}>
                <td
                  style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}
                  onClick={() => setDetailReq(r)}
                >
                  {formatDate(r.date)}
                </td>
                <td style={{ maxWidth: 160, cursor: 'pointer' }} onClick={() => setDetailReq(r)}>
                  <div className="text-truncate">{r.particulars}</div>
                  <CategoryBadges items={r.categoryItems} />
                </td>
                <td className="text-end">UGX {r.amount.toLocaleString()}</td>
                <td>{r.requestedBy.name}</td>
                <td>
                  {r.hrApproved.at
                    ? <Badge bg="success">✓ {r.hrApproved.by?.name ?? ''}</Badge>
                    : <Badge bg="warning" text="dark">Pending</Badge>
                  }
                </td>
                <td>
                  {r.directorApproved.at
                    ? <Badge bg="success">✓ {r.directorApproved.by?.name ?? ''}</Badge>
                    : <Badge bg="warning" text="dark">Pending</Badge>
                  }
                </td>
                <td>
                  {r.assignedTo ? (
                    <div>
                      <div style={{ fontSize: '0.83rem', fontWeight: 500 }}>{r.assignedTo.name}</div>
                      <div style={{ fontSize: '0.7rem', color: '#6c757d' }}>{r.assignedTo.role.replace(/_/g, ' ')}</div>
                    </div>
                  ) : (
                    <span className="text-muted small">Not assigned</span>
                  )}
                </td>
                <td>{statusBadge(r.status)}</td>
                <td>
                  <div className="d-flex gap-1 flex-wrap">
                    {isAdmin && !r.hrApproved.at && ['PENDING', 'SUBMITTED'].includes(r.status) && (
                      <Button size="sm" variant="outline-success"
                        disabled={hrApprove.isPending}
                        onClick={() => hrApprove.mutate(r.id)}>
                        HR ✓
                      </Button>
                    )}
                    {isDirector && r.hrApproved.at && !r.directorApproved.at && (
                      <Button size="sm" variant="success"
                        disabled={dirApprove.isPending}
                        onClick={() => dirApprove.mutate(r.id)}>
                        Dir ✓
                      </Button>
                    )}
                    {isAdmin && r.status === 'APPROVED' && !r.assignedTo && (
                      <Button size="sm" variant="outline-primary" onClick={() => setAssignReq(r)}>
                        Assign
                      </Button>
                    )}
                    {isAdmin && ['ASSIGNED', 'IN_PROGRESS', 'APPROVED'].includes(r.status) && (
                      <Button size="sm" variant="outline-secondary" onClick={() => setProgressReq(r)}>
                        Progress
                      </Button>
                    )}
                    {isAdmin && r.status === 'APPROVED' && r.purchaseOrders.length === 0 && (
                      <Button size="sm" variant="outline-info" onClick={() => setPoReq(r)}>
                        Create PO
                      </Button>
                    )}
                    {isAdmin && ['PENDING', 'SUBMITTED'].includes(r.status) && (
                      <Button size="sm" variant="outline-danger" onClick={() => setRejectReq(r)}>
                        Reject
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {rejectReq && (
        <ApprovalModal requisition={rejectReq} action="REJECT" onClose={() => setRejectReq(null)} />
      )}
      {assignReq && <AssignModal requisition={assignReq} onClose={() => setAssignReq(null)} />}
      {progressReq && <ProgressModal requisition={progressReq} onClose={() => setProgressReq(null)} />}
      {poReq && <PurchaseOrderModal requisition={poReq} onClose={() => setPoReq(null)} />}
      {detailReq && <RequisitionDetailModal req={detailReq} onClose={() => setDetailReq(null)} />}
    </>
  );
}

// ── Suppliers Tab ─────────────────────────────────────────────────────────────

function SuppliersTab() {
  const [showAdd, setShowAdd] = useState(false);
  const { data: suppliers = [], isLoading } = useSuppliers();

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <span className="fw-semibold">Suppliers</span>
        <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR]}>
          <Button size="sm" style={{ background: NAVY, borderColor: NAVY }} onClick={() => setShowAdd(true)}>
            + Add Supplier
          </Button>
        </RoleGuard>
      </div>

      {isLoading ? (
        <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
      ) : (
        <Table striped responsive className="small">
          <thead className="table-light">
            <tr><th>Name</th><th>Contact</th><th>Phone</th><th>Email</th><th>Categories</th></tr>
          </thead>
          <tbody>
            {suppliers.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-muted py-4">No suppliers yet</td></tr>
            ) : suppliers.map((s) => (
              <tr key={s.id}>
                <td className="fw-medium">{s.name}</td>
                <td>{s.contactPerson ?? '—'}</td>
                <td>{s.phone ?? '—'}</td>
                <td>{s.email ?? '—'}</td>
                <td>
                  {s.itemCategories.map((c) => (
                    <Badge key={c} bg="secondary" className="me-1" style={{ fontSize: '0.6rem' }}>{c}</Badge>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {showAdd && <SupplierFormModal onClose={() => setShowAdd(false)} />}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function RequisitionsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR].includes(user?.role as any);

  return (
    <div className="py-4 px-3">
      <Breadcrumb className="mb-3 small">
        <Breadcrumb.Item onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>Dashboard</Breadcrumb.Item>
        <Breadcrumb.Item active>Requisitions</Breadcrumb.Item>
      </Breadcrumb>

      <h4 className="fw-bold mb-4" style={{ color: NAVY }}>Requisitions</h4>

      <Card className="border-0 shadow-sm">
        <Card.Body>
          <Tabs defaultActiveKey="mine" className="mb-3">
            <Tab eventKey="mine" title="My Requisitions">
              <MyRequisitionsTab />
            </Tab>
            {canManage && (
              <Tab eventKey="manage" title="Manage">
                <ManageTab />
              </Tab>
            )}
            <Tab eventKey="suppliers" title="Suppliers">
              <SuppliersTab />
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>
    </div>
  );
}
