import { useState } from 'react';
import {
  Badge, Breadcrumb, Button, Card, Alert,
  Col, Row, Spinner, Tab, Table, Tabs,
} from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useRequisitions, useSuppliers } from '../../hooks/useRequisitions';
import { useAuth } from '../../context/AuthContext';
import RoleGuard from '../../components/RoleGuard';
import RequisitionFormModal from '../../components/requisitions/RequisitionFormModal';
import ApprovalModal from '../../components/requisitions/ApprovalModal';
import PurchaseOrderModal from '../../components/requisitions/PurchaseOrderModal';
import SupplierFormModal from '../../components/requisitions/SupplierFormModal';
import { ROLES } from '@stap/shared';
import type { RequisitionResponse } from '@stap/shared';

const NAVY = '#1B3A6B';

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text?: string }> = {
    SUBMITTED: { bg: 'warning', text: 'dark' },
    APPROVED:  { bg: 'success' },
    REJECTED:  { bg: 'danger' },
    CANCELLED: { bg: 'secondary' },
  };
  const cfg = map[status] ?? { bg: 'secondary' };
  return <Badge bg={cfg.bg} text={cfg.text}>{status}</Badge>;
}

function urgencyBadge(urgency: string) {
  const map: Record<string, { bg: string; text?: string }> = {
    LOW:    { bg: 'secondary' },
    NORMAL: { bg: 'info' },
    HIGH:   { bg: 'warning', text: 'dark' },
    URGENT: { bg: 'danger' },
  };
  const cfg = map[urgency] ?? { bg: 'secondary' };
  return <Badge bg={cfg.bg} text={cfg.text}>{urgency}</Badge>;
}

// ── My Requisitions Tab ───────────────────────────────────────────────────────

function MyRequisitionsTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [poReq, setPoReq]           = useState<RequisitionResponse | null>(null);
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
              <th>Category</th>
              <th>Description</th>
              <th>Qty</th>
              <th className="text-end">Est. Total</th>
              <th>Urgency</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reqs.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-muted py-4">No requisitions yet</td></tr>
            ) : reqs.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleDateString('en-GB')}</td>
                <td><Badge bg="light" text="dark" className="border">{r.category}</Badge></td>
                <td className="text-truncate" style={{ maxWidth: 200 }}>{r.description}</td>
                <td>{r.quantity}</td>
                <td className="text-end">UGX {r.estimatedTotal.toLocaleString()}</td>
                <td>{urgencyBadge(r.urgency)}</td>
                <td>{statusBadge(r.status)}</td>
                <td>
                  {r.status === 'APPROVED' && r.purchaseOrders.length === 0 && (
                    <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR]}>
                      <Button size="sm" variant="outline-primary" onClick={() => setPoReq(r)}>
                        Create PO
                      </Button>
                    </RoleGuard>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {showCreate && <RequisitionFormModal onClose={() => setShowCreate(false)} />}
      {poReq && <PurchaseOrderModal requisition={poReq} onClose={() => setPoReq(null)} />}
    </>
  );
}

// ── Pending Approval Tab ──────────────────────────────────────────────────────

function PendingApprovalTab() {
  const [approveReq, setApproveReq] = useState<{ req: RequisitionResponse; action: 'APPROVE' | 'REJECT' } | null>(null);
  const [poReq, setPoReq]           = useState<RequisitionResponse | null>(null);
  const { data, isLoading }         = useRequisitions({ status: 'SUBMITTED' });
  const reqs = data?.data ?? [];

  return (
    <>
      {reqs.length > 0 && (
        <Alert variant="warning" className="small py-2">
          {reqs.length} requisition{reqs.length > 1 ? 's' : ''} awaiting your approval
        </Alert>
      )}

      {isLoading ? (
        <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>
      ) : (
        <Table striped responsive className="small">
          <thead className="table-light">
            <tr>
              <th>Date</th>
              <th>Raised By</th>
              <th>Category</th>
              <th>Description</th>
              <th className="text-end">Est. Total</th>
              <th>Urgency</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reqs.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted py-4">No pending approvals</td></tr>
            ) : reqs.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleDateString('en-GB')}</td>
                <td>{r.raisedByName}</td>
                <td><Badge bg="light" text="dark" className="border">{r.category}</Badge></td>
                <td className="text-truncate" style={{ maxWidth: 180 }}>{r.description}</td>
                <td className="text-end">UGX {r.estimatedTotal.toLocaleString()}</td>
                <td>{urgencyBadge(r.urgency)}</td>
                <td>
                  <div className="d-flex gap-1">
                    <Button size="sm" variant="success"
                      onClick={() => setApproveReq({ req: r, action: 'APPROVE' })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="danger"
                      onClick={() => setApproveReq({ req: r, action: 'REJECT' })}>
                      Reject
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {approveReq && (
        <ApprovalModal
          requisition={approveReq.req}
          action={approveReq.action}
          onClose={() => setApproveReq(null)}
        />
      )}
      {poReq && <PurchaseOrderModal requisition={poReq} onClose={() => setPoReq(null)} />}
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
  const canApprove = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER].includes(user?.role as any);

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
            {canApprove && (
              <Tab eventKey="pending" title="Pending Approval">
                <PendingApprovalTab />
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
