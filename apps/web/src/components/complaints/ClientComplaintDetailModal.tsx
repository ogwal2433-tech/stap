import { useState } from 'react';
import { Badge, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import type { ComplaintResponse } from '@stap/shared';
import { COMPLAINT_SEVERITY_COLORS, COMPLAINT_STATUS_COLORS } from '@stap/shared';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useAssignComplaint, useUpdateComplaintStatus } from '../../hooks/useComplaints';
import { useUsers } from '../../hooks/useSettings';
import { SearchableSelect } from '../ui/SearchableSelect';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-UG', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

interface Props {
  show:      boolean;
  complaint: ComplaintResponse;
  onClose:   () => void;
}

export default function ClientComplaintDetailModal({ show, complaint, onClose }: Props) {
  const { user }       = useAuth();
  const { showToast }  = useToast();

  const isAssignedToMe = complaint.assignedTo?.id === user?.id;
  const isHRRole       = ['DIRECTOR', 'ASSISTANT_MANAGER'].includes(user?.role ?? '');
  const isAssignerRole = ['DIRECTOR', 'ASSISTANT_MANAGER', 'OPERATIONS_SUPERVISOR'].includes(user?.role ?? '');

  const [receivedById, setReceivedById] = useState('');
  const [assignedToId, setAssignedToId] = useState('');

  const assignMutation = useAssignComplaint(complaint.id);
  const statusMutation = useUpdateComplaintStatus(complaint.id);

  // Only load users when the assignment form is visible
  const { data: usersPage, isLoading: usersLoading } = useUsers(
    isAssignerRole && !complaint.assignedTo ? {} : undefined,
  );
  const staffOptions = (usersPage?.data ?? []).map((u) => ({
    value:    u.id,
    label:    u.name,
    sublabel: u.role.replace(/_/g, ' '),
  }));

  async function handleAssign() {
    if (!receivedById || !assignedToId) return;
    try {
      await assignMutation.mutateAsync({ receivedById, assignedToId });
      showToast('Complaint assigned', 'success');
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to assign complaint', 'danger');
    }
  }

  async function handleStatusUpdate(status: 'UNDER_INVESTIGATION' | 'RESOLVED') {
    try {
      await statusMutation.mutateAsync({ status });
      showToast(
        status === 'RESOLVED'
          ? 'Complaint marked as Resolved'
          : 'Complaint marked Under Investigation',
        'success',
      );
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to update status', 'danger');
    }
  }

  const statusBadgeBg  = COMPLAINT_STATUS_COLORS[complaint.status as keyof typeof COMPLAINT_STATUS_COLORS] ?? 'secondary';
  const statusTextDark = complaint.status === 'UNDER_INVESTIGATION';

  return (
    <Modal show={show} onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title className="fs-6 fw-semibold">Complaint Details</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {/* Status + severity badges */}
        <div className="d-flex align-items-center gap-2 mb-4">
          <Badge
            bg={COMPLAINT_SEVERITY_COLORS[complaint.severity]}
            text={complaint.severity === 'MEDIUM' ? 'dark' : undefined}
            style={{ fontSize: '0.82rem' }}
          >
            {complaint.severity} Severity
          </Badge>
          <Badge
            bg={statusBadgeBg}
            text={statusTextDark ? 'dark' : undefined}
            style={{ fontSize: '0.82rem' }}
          >
            {complaint.status.replace(/_/g, ' ')}
          </Badge>
          <span className="text-muted small ms-auto">
            Logged {formatDate(complaint.createdAt)}
            {complaint.daysOpen > 0 && (
              <> · <span style={{ color: complaint.daysOpen > 7 ? '#dc3545' : undefined }}>
                {complaint.daysOpen}d open
              </span></>
            )}
          </span>
        </div>

        {/* Subject */}
        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1B3A6B', marginBottom: '8px' }}>
          {complaint.subject}
        </div>

        {/* Category + client */}
        <div className="text-muted small mb-3">
          {complaint.category.replace(/_/g, ' ')}
          {complaint.client && <> · {complaint.client.clientName}</>}
          {complaint.site && <> · {complaint.site.siteName}</>}
        </div>

        {/* Description */}
        <div
          style={{
            background:   '#F2F4F7',
            borderRadius: '0.5rem',
            padding:      '14px 16px',
            fontSize:     '0.9rem',
            color:        '#1A1A1A',
            lineHeight:   1.7,
            marginBottom: '20px',
            whiteSpace:   'pre-wrap',
          }}
        >
          {complaint.description}
        </div>

        {/* ── Received By ─────────────────────────────────────────── */}
        {complaint.receivedBy ? (
          <div className="mb-3">
            <div className="text-muted small">Received By</div>
            <div className="fw-bold">{complaint.receivedBy.name}</div>
          </div>
        ) : (
          isAssignerRole && (
            <div className="mb-3">
              <Form.Label className="fw-bold small">
                Received By <span className="text-danger">*</span>
              </Form.Label>
              <SearchableSelect
                options={staffOptions}
                value={receivedById}
                onChange={setReceivedById}
                placeholder="Who received this complaint?"
                isLoading={usersLoading}
              />
            </div>
          )
        )}

        {/* ── Assigned To ─────────────────────────────────────────── */}
        {complaint.assignedTo ? (
          <div
            style={{
              background:   '#D6E0F0',
              borderRadius: '0.5rem',
              padding:      '12px 16px',
              marginBottom: '16px',
            }}
          >
            <div className="fw-bold mb-2" style={{ color: '#1B3A6B' }}>Assigned To</div>
            <Row className="g-2">
              <Col xs={12}>
                <span className="text-muted small">Name:</span>{' '}
                <strong>{complaint.assignedTo.name}</strong>
              </Col>
              <Col xs={12}>
                <span className="text-muted small">Title:</span>{' '}
                {complaint.assignedTo.title}
              </Col>
              <Col xs={12}>
                <span className="text-muted small">Phone Number:</span>{' '}
                {complaint.assignedTo.phone}
              </Col>
            </Row>
            {complaint.assignedAt && (
              <div className="text-muted small mt-2">
                Assigned on {formatDate(complaint.assignedAt)}
              </div>
            )}
          </div>
        ) : (
          isAssignerRole && (
            <div className="mb-3">
              <Form.Label className="fw-bold small">
                Assign To <span className="text-danger">*</span>
              </Form.Label>
              <SearchableSelect
                options={staffOptions}
                value={assignedToId}
                onChange={setAssignedToId}
                placeholder="Select staff member to assign this complaint to..."
                isLoading={usersLoading}
              />
              <Button
                variant="primary"
                size="sm"
                className="mt-2"
                disabled={!receivedById || !assignedToId || assignMutation.isPending}
                onClick={handleAssign}
              >
                {assignMutation.isPending
                  ? <><Spinner size="sm" className="me-1" />Assigning...</>
                  : 'Assign Complaint'}
              </Button>
            </div>
          )
        )}

        {/* ── Status Update buttons ─────────────────────────────── */}
        {complaint.assignedTo && (isAssignedToMe || isHRRole) && (
          <div className="mb-3">
            <div className="fw-bold small mb-2">Update Status</div>
            <div className="d-flex gap-2 flex-wrap">
              <Button
                variant="warning"
                size="sm"
                disabled={
                  complaint.status === 'UNDER_INVESTIGATION' ||
                  complaint.status === 'RESOLVED' ||
                  statusMutation.isPending
                }
                onClick={() => handleStatusUpdate('UNDER_INVESTIGATION')}
              >
                🔍 Under Investigation
              </Button>
              <Button
                variant="success"
                size="sm"
                disabled={complaint.status === 'RESOLVED' || statusMutation.isPending}
                onClick={() => handleStatusUpdate('RESOLVED')}
              >
                ✅ Resolved
              </Button>
            </div>
          </div>
        )}

        {/* Resolved timestamp */}
        {complaint.status === 'RESOLVED' && complaint.resolvedAt && (
          <div
            style={{
              background:   '#d5f5e3',
              borderRadius: '0.5rem',
              padding:      '14px 16px',
              borderLeft:   '4px solid #1E8449',
              marginTop:    '8px',
            }}
          >
            <div style={{ fontWeight: 700, color: '#1E8449', marginBottom: '4px', fontSize: '0.88rem' }}>
              ✅ Resolved
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
              Resolved on {formatDate(complaint.resolvedAt)}
            </div>
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}
