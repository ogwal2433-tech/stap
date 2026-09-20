import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Badge, Breadcrumb, Button, ButtonGroup, Col, Dropdown,
  Form, Modal, Pagination, Row, Spinner, Tab, Table, Tabs,
} from 'react-bootstrap';
import { useGuard, useGuardDeploymentHistory, useReinstateGuard, useTransferHistory, useDownloadIdCard, usePromotionHistory } from '../../hooks/useGuards';
import { useDisciplinaryRecords, useGuardLetters } from '../../hooks/useDisciplinary';
import { useLettersBySubject } from '../../hooks/useLetters';
import { useDeductions, useCancelDeduction } from '../../hooks/useFinance';
import { useGuardInventory } from '../../hooks/useInventory';
import { guardsApi } from '../../lib/guards.api';
import { lettersApi } from '../../lib/letters.api';
import { useAuth, useHasPermission } from '../../context/AuthContext';
import RoleGuard from '../../components/RoleGuard';
import PermissionGuard from '../../components/PermissionGuard';
import DeleteConfirmModal from '../../components/shared/DeleteConfirmModal';
import { useQueryClient } from '@tanstack/react-query';
import InitialsAvatar from '../../components/ui/InitialsAvatar';
import StatusChangeModal from '../../components/guards/StatusChangeModal';
import DocumentUploadModal from '../../components/guards/DocumentUploadModal';
import DisciplinaryRecordModal from '../../components/guards/DisciplinaryRecordModal';
import DisciplinaryLetterModal from '../../components/letters/DisciplinaryLetterModal';
import HRLetterModal from '../../components/letters/HRLetterModal';
import ApproveLetterModal from '../../components/letters/ApproveLetterModal';
import LetterStatusBadge from '../../components/letters/LetterStatusBadge';
import TransferModal from '../../components/guards/TransferModal';
import PromoteGuardModal from '../../components/guards/PromoteGuardModal';
import GuardSystemAccess from '../../components/guards/GuardSystemAccess';
import ReturnItemModal from '../../components/inventory/ReturnItemModal';
import DeductionFormModal from '../../components/finance/DeductionFormModal';
import { useToast } from '../../context/ToastContext';
import {
  ROLES, GUARD_CONTRACT_TYPES, GUARD_RANKS, GUARD_WRITE_ROLES, HR_ROLES, FINANCE_ROLES, type UserRole,
  GUARD_STATUS_CONFIG, guardStatusLabel, EXITED_STATUSES, type GuardEmploymentStatus,
  type GuardDocumentResponse, type GuardTransferResponse, type GuardPromotionResponse, type GeneratedLetterResponse, type DisciplinaryResponse,
  guardIdTypeConfig,
} from '@stap/shared';
import { computeDisplayDuration, daysUntilExpiry } from '../../lib/dateUtils';

const STATUS_BADGE: Record<string, string> = Object.fromEntries(
  Object.entries(GUARD_STATUS_CONFIG).map(([value, cfg]) => [value, cfg.colour]),
);

/** Bootstrap's warning/info fills are light — they need dark text to stay legible. */
const DARK_TEXT_BADGES = ['warning', 'info'];

const STATUS_ACTIONS: { value: GuardEmploymentStatus; action: string; icon: string; danger?: boolean }[] = [
  { value: 'ACTIVE',     action: 'Activate',      icon: '✅' },
  { value: 'ON_LEAVE',   action: 'Set on leave',  icon: '🌴' },
  { value: 'SUSPENDED',  action: 'Suspend',       icon: '⚠️' },
  { value: 'RESIGNED',   action: 'Mark resigned', icon: '📄', danger: true },
  { value: 'TERMINATED', action: 'Terminate',     icon: '⛔', danger: true },
];

const RANK_BADGE: Record<string, string> = {
  GUARD:        'secondary',
  SENIOR_GUARD: 'info',
  CORPORAL:     'primary',
  SERGEANT:     'warning',
  SUPERVISOR:   'dark',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

const DISCIPLINARY_BADGE: Record<string, { bg: string; text?: string; style?: React.CSSProperties }> = {
  WARNING: { bg: 'warning', text: 'dark' },
  SUSPENSION: { bg: 'danger' },
  TERMINATION: { bg: 'dark' },
  REINSTATEMENT: { bg: 'success' },
};

interface StatusModal {
  targetStatus: GuardEmploymentStatus;
}

const DEDUCTION_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER];

interface ReinstateModalProps {
  guardId:   string;
  guard:     import('@stap/shared').GuardResponse;
  onClose:   () => void;
  onSuccess: () => void;
}

function ReinstateModal({ guardId, guard, onClose, onSuccess }: ReinstateModalProps) {
  const [reason, setReason] = useState('');
  const [error,  setError]  = useState('');
  const reinstate = useReinstateGuard();

  const nextIncrementYear = new Date(
    new Date().getFullYear() + 1,
    new Date().getMonth(),
    new Date().getDate(),
  ).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const handleConfirm = () => {
    if (reason.trim().length < 10) {
      setError('Reason must be at least 10 characters.');
      return;
    }
    setError('');
    reinstate.mutate(
      { guardId, reason: reason.trim() },
      {
        onSuccess: () => { onSuccess(); onClose(); },
        onError: (err: any) => setError(err?.response?.data?.error || 'Reinstatement failed.'),
      },
    );
  };

  return (
    <Modal show onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Re-instate Guard</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Guard info header */}
        <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '12px 16px', marginBottom: '16px' }}>
          <div className="fw-bold">{guard.fullName}</div>
          <div className="text-muted small mt-1">
            Current status:{' '}
            <Badge bg={STATUS_BADGE[guard.employmentStatus] ?? 'secondary'}
              text={DARK_TEXT_BADGES.includes(STATUS_BADGE[guard.employmentStatus]) ? 'dark' : undefined}>
              {guardStatusLabel(guard.employmentStatus)}
            </Badge>
          </div>
          {(guard as any).reinstatedCount > 0 && (
            <div className="text-muted small mt-1">
              Previously reinstated {(guard as any).reinstatedCount} time(s).
              {(guard as any).lastReinstatedAt && (
                <> Last: {new Date((guard as any).lastReinstatedAt).toLocaleDateString('en-GB')}</>
              )}
            </div>
          )}
        </div>

        {/* Service counting reset notice */}
        <Alert variant="info" className="mb-3">
          <div className="fw-bold mb-1">ℹ️ Service Counting Will Restart</div>
          <div className="small">
            Upon reinstatement, this guard's service counting will restart from today's date.
            <ul className="mb-0 mt-1">
              <li>Salary increment history is reset</li>
              <li>
                First UGX 20,000 increment will be due in 1 year from today{' '}
                <strong>({nextIncrementYear})</strong>
              </li>
              <li>Subsequent annual increments of UGX 10,000 will follow each year after that</li>
            </ul>
          </div>
        </Alert>

        <Form.Group>
          <Form.Label className="fw-bold small">
            Reason for Reinstatement <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            as="textarea"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Disciplinary matter has been resolved. Guard attended counselling and acknowledged the code of conduct. HR has cleared the case."
            isInvalid={!!error}
          />
          <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>
          <Form.Text className="text-muted">
            This reason will be saved to the guard's disciplinary record.
          </Form.Text>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={reinstate.isPending}>
          Cancel
        </Button>
        <Button
          variant="success"
          onClick={handleConfirm}
          disabled={reinstate.isPending || reason.trim().length < 10}
        >
          {reinstate.isPending ? <><Spinner size="sm" className="me-1" />Reinstating…</> : 'Confirm Reinstatement'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function IssuedItemsTab({ guardId, guardName, guardStatus }: {
  guardId: string; guardName: string; guardStatus: string;
}) {
  const { data: items, isLoading, refetch } = useGuardInventory(guardId);
  const { showToast } = useToast();
  // Seeing what a guard holds and taking it back are separate grants.
  const canReturn = useHasPermission('inventory.return');
  const [returnTarget, setReturnTarget] = useState<{
    itemId: string; itemName: string; outstanding: number;
  } | null>(null);

  const hasLeft = EXITED_STATUSES.includes(guardStatus as GuardEmploymentStatus);

  if (isLoading) return <div className="text-center py-4"><Spinner /></div>;
  if (!items || items.length === 0) {
    return <Alert variant="light" className="small py-2">No items currently issued to this guard.</Alert>;
  }

  return (
    <>
    <Table hover size="sm" responsive className="mt-2">
      <thead className="table-light">
        <tr>
          <th>Item Code</th>
          <th>Item Name</th>
          <th>Type</th>
          <th className="text-center">Outstanding</th>
          {canReturn && <th>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {items.map(row => (
          <tr key={row.item.id}>
            <td><code style={{ fontSize: 12 }}>{row.item.itemCode}</code></td>
            <td className="fw-medium">{row.item.itemName}</td>
            <td><Badge bg="secondary" style={{ fontSize: 10 }}>{row.item.itemType}</Badge></td>
            <td className="text-center fw-bold">{row.outstanding}</td>
            {canReturn && <td>
              <Button
                size="sm"
                variant={hasLeft ? 'warning' : 'outline-warning'}
                style={{ fontSize: 11, padding: '1px 6px' }}
                onClick={() => setReturnTarget({
                  itemId: row.item.id, itemName: row.item.itemName, outstanding: row.outstanding,
                })}
              >
                {hasLeft ? 'Collect return' : 'Return'}
              </Button>
            </td>}
          </tr>
        ))}
      </tbody>
    </Table>

      {returnTarget && (
        <ReturnItemModal
          itemId={returnTarget.itemId}
          itemName={returnTarget.itemName}
          guardId={guardId}
          guardName={guardName}
          guardStatus={guardStatus}
          outstanding={returnTarget.outstanding}
          onClose={() => setReturnTarget(null)}
          onSuccess={() => { refetch(); showToast('Return recorded', 'success'); }}
        />
      )}
    </>
  );
}

const LETTER_TYPE_LABEL: Record<string, string> = {
  WARNING: 'Warning Letter', SUSPENSION: 'Suspension Letter', TERMINATION: 'Termination Letter',
  COMMENDATION: 'Commendation Letter', REINSTATEMENT: 'Reinstatement Letter', GENERAL: 'General Letter',
  COMMITMENT_AGREEMENT: 'Commitment Agreement',
};

function LetterCard({ letter, canReview, onReview }: {
  letter: GeneratedLetterResponse;
  canReview: boolean;
  onReview: () => void;
}) {
  return (
    <div style={{
      padding: '10px 14px', border: '1px solid #e9ecef', borderRadius: '0.5rem',
      borderLeft: `4px solid ${
        letter.approvalStatus === 'APPROVED' ? '#1E8449'
        : letter.approvalStatus === 'REJECTED' ? '#dc3545'
        : '#E8701A'
      }`,
    }}>
      <div className="d-flex align-items-start justify-content-between gap-2">
        <div style={{ flex: 1 }}>
          <div className="fw-bold" style={{ fontSize: '0.88rem' }}>{letter.title}</div>
          <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: 2 }}>
            {LETTER_TYPE_LABEL[letter.letterType] ?? letter.letterType.replace(/_/g, ' ')} · By {letter.generatedBy.name} ·{' '}
            {new Date(letter.generatedAt).toLocaleDateString('en-GB')}
          </div>
          {letter.approvalStatus === 'APPROVED' && letter.approvedBy && (
            <div style={{ fontSize: '0.72rem', color: '#1E8449', marginTop: 2 }}>
              Approved by {letter.approvedBy.name} on {new Date(letter.approvedAt!).toLocaleDateString('en-GB')}
            </div>
          )}
          {letter.approvalStatus === 'REJECTED' && letter.approvalNotes && (
            <div style={{ fontSize: '0.72rem', color: '#842029', marginTop: 2, fontStyle: 'italic' }}>
              Rejected: {letter.approvalNotes}
            </div>
          )}
        </div>
        <div className="d-flex flex-column align-items-end gap-1">
          <LetterStatusBadge status={letter.approvalStatus} />
          {letter.approvalStatus === 'PENDING' && canReview && (
            <Button size="sm" variant="outline-primary" style={{ fontSize: '0.72rem', padding: '2px 8px' }} onClick={onReview}>
              Review
            </Button>
          )}
          {letter.approvalStatus === 'APPROVED' && (
            <Button
              size="sm"
              variant="outline-secondary"
              style={{ fontSize: '0.72rem', padding: '2px 8px' }}
              onClick={() => lettersApi.downloadPdf(letter.id, `${letter.letterType}-${letter.subjectName}.pdf`)}
            >
              ↓ PDF
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GuardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const canViewDeductions = !!user && DEDUCTION_ROLES.includes(user.role as UserRole);
  // Issued items are an inventory view, not a payroll one: whoever is granted
  // inventory.view sees them, with no role list of its own to drift.
  const canViewIssuedItems = useHasPermission('inventory.view');
  const canReviewLetters = !!user && (HR_ROLES as string[]).includes(user.role);

  const { data: guard, isLoading, isError, refetch } = useGuard(id ?? '');
  const [statusModal, setStatusModal] = useState<StatusModal | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const { showToast: toast } = useToast();
  const queryClient = useQueryClient();
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [deployPage, setDeployPage] = useState(1);

  const { data: deployHistory, isLoading: deployLoading } = useGuardDeploymentHistory(
    id ?? '',
    deployPage,
  );
  // Always page 1 (most recent first) so the active deployment is found
  // regardless of which page the deployment history table is scrolled to.
  const { data: currentDeploymentPage } = useGuardDeploymentHistory(id ?? '', 1);
  const activeDeployment = currentDeploymentPage?.data.find((d) => !d.endDate) ?? null;
  const { data: disciplinaryRecords = [], refetch: refetchDisciplinary } = useDisciplinaryRecords(id ?? '');
  const { data: guardLetters = [] } = useGuardLetters(id ?? '');
  const { data: letterRecordsRes, refetch: refetchLetterRecords } = useLettersBySubject(id ?? '');
  const letterRecords = letterRecordsRes?.data ?? [];
  const hrLetters = letterRecords.filter((l) => !l.disciplinaryRecordId);

  const [showDisciplinaryModal, setShowDisciplinaryModal] = useState(false);
  const [disciplinaryLetterRecord, setDisciplinaryLetterRecord] = useState<DisciplinaryResponse | null>(null);
  const [showHRLetterModal, setShowHRLetterModal] = useState(false);
  const [reviewLetter, setReviewLetter] = useState<GeneratedLetterResponse | null>(null);
  const [showDeductionModal, setShowDeductionModal] = useState(false);
  const [showReinstateModal, setShowReinstateModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [idCardError, setIdCardError] = useState('');

  const { data: transferHistory, isLoading: transfersLoading } = useTransferHistory(id ?? '');
  const { data: promotionHistory = [] } = usePromotionHistory(id ?? '');
  const downloadIdCard = useDownloadIdCard();

  const { data: deductions = [], refetch: refetchDeductions } = useDeductions({ guardId: id });
  const cancelDeduction = useCancelDeduction();

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center py-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (isError || !guard) {
    return <Alert variant="danger">Guard not found or could not be loaded.</Alert>;
  }

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm('Remove this document? It will be soft-deleted and cannot be recovered.')) return;
    try {
      await guardsApi.deleteDocument(id!, docId);
      showToast('Document removed', 'success');
      refetch();
    } catch {
      showToast('Failed to remove document', 'danger');
    }
  };

  return (
    <div>
      <Breadcrumb className="mb-3 small">
        <Breadcrumb.Item onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
          Dashboard
        </Breadcrumb.Item>
        <Breadcrumb.Item onClick={() => navigate('/guards')} style={{ cursor: 'pointer' }}>
          Guards
        </Breadcrumb.Item>
        <Breadcrumb.Item active>{guard.fullName}</Breadcrumb.Item>
      </Breadcrumb>

      {/* Action bar */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <h4 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>{guard.fullName}</h4>
          {guard.systemId && (
            <span style={{
              background: '#1B3A6B', color: '#fff', padding: '2px 10px',
              borderRadius: 12, fontSize: '0.78rem', fontWeight: 700,
              letterSpacing: '0.5px', fontFamily: 'monospace',
            }}>
              {guard.systemId}
            </span>
          )}
        </div>
        <ButtonGroup size="sm">
          <PermissionGuard permission="guards.edit">
            <Button variant="outline-primary" onClick={() => navigate(`/guards/${id}/edit`)}>
              Edit
            </Button>
          </PermissionGuard>
          <PermissionGuard permission="guards.edit">
            {guard.employmentStatus === 'SUSPENDED' ? (
              <>
                <Button
                  variant="outline-secondary"
                  onClick={() => setStatusModal({ targetStatus: 'ACTIVE' })}
                >
                  Activate
                </Button>
                <Button
                  variant="success"
                  onClick={() => setShowReinstateModal(true)}
                >
                  Re-instate
                </Button>
              </>
            ) : (
              <Dropdown as={ButtonGroup}>
                <Dropdown.Toggle variant="outline-secondary" id="status-action">
                  Change Status
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {STATUS_ACTIONS.filter(a => a.value !== guard.employmentStatus).map(a => (
                    <Dropdown.Item
                      key={a.value}
                      className={a.danger ? 'text-danger' : undefined}
                      onClick={() => setStatusModal({ targetStatus: a.value })}
                    >
                      {a.icon} {a.action}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
            )}
          </PermissionGuard>
          <PermissionGuard permission="guards.delete">
            <Button variant="outline-danger" onClick={() => setShowDelete(true)}>
              Delete
            </Button>
          </PermissionGuard>
          <DeleteConfirmModal
            show={showDelete}
            onHide={() => setShowDelete(false)}
            entityType="guard"
            entityName={`${guard.firstName} ${guard.lastName}`}
            warning="Only a guard added by mistake can be deleted — one with no deployments, attendance, pay or other history. Anyone who has worked is terminated instead."
            onConfirm={async () => {
              const r = await guardsApi.remove(id!);
              toast(`${r.name} deleted. It can be restored from Deleted records.`, 'success');
              queryClient.invalidateQueries({ queryKey: ['guards'] });
              navigate('/guards');
            }}
          />
          {/* Stays on roles: the nearest permission is guards.documents, which the
                       Administrator does not hold, so mapping it would take ID-card printing away. */}
          <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR] as UserRole[]}>
            <Button
              variant="outline-dark"
              disabled={downloadIdCard.isPending}
              onClick={() => {
                setIdCardError('');
                downloadIdCard.mutate(id!, {
                  onError: (err: any) =>
                    setIdCardError(err?.response?.data?.error || 'Failed to generate ID card.'),
                });
              }}
            >
              {downloadIdCard.isPending ? (
                <><Spinner as="span" size="sm" animation="border" className="me-1" /> Generating…</>
              ) : (
                'Generate ID Card'
              )}
            </Button>
          </RoleGuard>
          {guard.employmentStatus === 'ACTIVE' && (
            <PermissionGuard permission="guards.promote">
              <Button
                variant="outline-primary"
                disabled={!guard.rank}
                title={guard.rank ? undefined : 'Assign a rank on this guard before promoting them'}
                onClick={() => setShowPromoteModal(true)}
              >
                Promote
              </Button>
            </PermissionGuard>
          )}
          {guard.employmentStatus === 'ACTIVE' && (
            <PermissionGuard permission="guards.transfer">
              <Button
                variant="outline-info"
                disabled={!activeDeployment}
                title={activeDeployment ? undefined : 'Guard must be deployed to a site before they can be transferred'}
                onClick={() => setShowTransferModal(true)}
              >
                Transfer{!activeDeployment && ' (not deployed)'}
              </Button>
            </PermissionGuard>
          )}
          <Button variant="outline-secondary" onClick={() => navigate('/guards')}>
            ← Back
          </Button>
        </ButtonGroup>
      </div>

      {idCardError && (
        <Alert variant="danger" dismissible onClose={() => setIdCardError('')} className="mb-3 py-2 small">
          {idCardError}
        </Alert>
      )}
      {downloadIdCard.isSuccess && (
        <p className="text-muted small mb-3">
          Print and laminate before issuing to guard.
        </p>
      )}

      {/* Profile header */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <Row className="align-items-center g-3">
            <Col xs="auto">
              {guard.photoUrl ? (
                <img
                  src={guard.photoUrl}
                  alt={guard.fullName}
                  width={120}
                  height={120}
                  className="rounded-circle object-fit-cover"
                />
              ) : (
                <InitialsAvatar name={guard.fullName} size={120} />
              )}
            </Col>
            <Col>
              <h5 className="mb-1 fw-bold">{guard.fullName}</h5>
              <div className="text-muted small mb-1">
                {(() => {
                  const cfg = guardIdTypeConfig(guard.idType);
                  if (!cfg) return <span className="text-warning fw-semibold">No ID document on file</span>;
                  return <>{cfg.icon} {guard.idSummary}</>;
                })()}
              </div>
              <div className="text-muted small">
                {guard.phone ?? <span className="fst-italic">No phone on record</span>}
              </div>
            </Col>
            <Col xs="auto" className="text-end">
              <Badge
                bg={STATUS_BADGE[guard.employmentStatus] ?? 'secondary'}
                text={DARK_TEXT_BADGES.includes(STATUS_BADGE[guard.employmentStatus]) ? 'dark' : undefined}
                className="fs-6 px-3 py-2 mb-2 d-block"
              >
                {guardStatusLabel(guard.employmentStatus)}
              </Badge>
              <Badge
                bg={RANK_BADGE[guard.rank] ?? 'secondary'}
                text={guard.rank === 'SERGEANT' ? 'dark' : undefined}
                className="fs-6 px-3 py-2 mb-2 d-block"
              >
                {GUARD_RANKS[guard.rank] ?? guard.rank}
              </Badge>
              <Badge
                bg={guard.contractType === 'PERMANENT' ? 'success' : 'warning'}
                text={guard.contractType === 'TEMPORARY' ? 'dark' : undefined}
                className="fs-6 px-3 py-2 mb-2 d-block"
              >
                {GUARD_CONTRACT_TYPES[guard.contractType] ?? guard.contractType}
              </Badge>
              {guard.probationStatus === 'ON_PROBATION' ? (
                <Badge
                  bg="warning"
                  text="dark"
                  className="fs-6 px-3 py-2 mb-2 d-block"
                >
                  On Probation
                  {guard.probationEndDate && (
                    <span className="fw-normal ms-1 small">
                      — Ends: {new Date(guard.probationEndDate).toLocaleDateString('en-GB')}
                    </span>
                  )}
                </Badge>
              ) : (
                <Badge bg="success" className="fs-6 px-3 py-2 mb-2 d-block">
                  Confirmed
                </Badge>
              )}
              {/* Salary — see above. */}
              <RoleGuard allowedRoles={FINANCE_ROLES as UserRole[]}>
                <div className="text-muted small">
                  UGX {guard.salaryRate.toLocaleString()} / month
                </div>
              </RoleGuard>
              <div className="mt-2" style={{ fontSize: '0.82rem' }}>
                <div style={{ color: '#6c757d', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  Contract Period
                </div>
                <div className="fw-semibold" style={{ color: '#1A1A1A' }}>
                  {new Date(guard.contractStart).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {guard.contractEnd && (
                    <> → {new Date(guard.contractEnd).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</>
                  )}
                </div>
                {guard.contractEnd && (
                  <div style={{ color: '#0F7B6C', fontWeight: 600, fontSize: '0.75rem' }}>
                    {computeDisplayDuration(guard.contractStart, guard.contractEnd)}
                  </div>
                )}
                {guard.contractEnd && (() => {
                  const days = daysUntilExpiry(guard.contractEnd);
                  if (days < 0) return <Badge bg="danger" className="mt-1">❌ Expired {Math.abs(days)}d ago</Badge>;
                  if (days <= 30) return <Badge bg="warning" text="dark" className="mt-1">⚠️ Expires in {days}d</Badge>;
                  if (days <= 90) return <Badge bg="info" className="mt-1">ℹ️ {days}d remaining</Badge>;
                  return <Badge bg="success" className="mt-1">✅ Active</Badge>;
                })()}
              </div>
            </Col>
          </Row>

          {(() => {
            // Phone, next of kin and the NIN are optional, so a guard can be
            // registered from a paper form before those are to hand. Saying which
            // are missing is what turns "incomplete" into something someone can act
            // on when the guard next comes in.
            const missing = [
              !guard.idType         && 'an identification document',
              !guard.phone          && 'phone number',
              !guard.nextOfKinName  && 'next of kin',
              !guard.nextOfKinPhone && 'next of kin phone',
            ].filter(Boolean) as string[];
            if (!missing.length) return null;
            return (
              <div style={{
                background: '#FEF9E7', borderLeft: '3px solid #F2AA20',
                borderRadius: '0.375rem', padding: '8px 12px',
                fontSize: '0.78rem', color: '#856404', marginTop: 12,
              }}>
                Still to be recorded for this guard: {missing.join(', ')}. Add them from
                Edit once the documents are available.
              </div>
            );
          })()}
        </div>
      </div>

      {/* Salary increment / service counting card */}
      {/* Salary is a finance concern, not a guard one, and has no permission of its own. */}
      <RoleGuard allowedRoles={FINANCE_ROLES as UserRole[]}>
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-header bg-white fw-bold small d-flex align-items-center justify-content-between" style={{ color: '#1B3A6B' }}>
            <span>📈 Salary Increment & Service Counting</span>
          </div>
          <div className="card-body">
            <Row className="g-3">
              <Col md={6}>
                <div className="text-muted small">Service Counting From</div>
                <div className="fw-bold">
                  {guard.effectiveServiceStart
                    ? formatDate(guard.effectiveServiceStart)
                    : formatDate(guard.contractStart)}
                </div>
                {guard.effectiveServiceStart && (
                  <Badge bg="warning" text="dark" className="mt-1" style={{ fontSize: '0.7rem' }}>
                    ↩️ Restarted after reinstatement
                  </Badge>
                )}
              </Col>
              <Col md={6}>
                <div className="text-muted small">Next Increment Due</div>
                <div className={`fw-bold ${guard.nextIncrementDate && new Date(guard.nextIncrementDate) <= new Date() ? 'text-danger' : 'text-success'}`}>
                  {guard.nextIncrementDate ? formatDate(guard.nextIncrementDate) : 'Not applicable'}
                </div>
              </Col>
              <Col md={6}>
                <div className="text-muted small">Increments Applied</div>
                <div className="fw-bold">
                  {guard.incrementCount === 0 ? 'None yet' : `${guard.incrementCount} increment(s)`}
                </div>
              </Col>
              <Col md={6}>
                <div className="text-muted small">Next Increment Amount</div>
                <div className="fw-bold" style={{ color: '#0F7B6C' }}>
                  {guard.contractType !== 'PERMANENT'
                    ? 'N/A (Temporary)'
                    : guard.incrementCount === 0
                      ? 'UGX 20,000 (first year)'
                      : 'UGX 10,000 (subsequent year)'}
                </div>
              </Col>
            </Row>
            {guard.reinstatedCount > 0 && (
              <>
                <hr />
                <div className="fw-bold small text-muted text-uppercase mb-2">Reinstatement History</div>
                <div className="small">
                  <div>Times Reinstated: <strong>{guard.reinstatedCount}</strong></div>
                  {guard.lastReinstatedAt && (
                    <div>Last Reinstated: <strong>{formatDate(guard.lastReinstatedAt)}</strong></div>
                  )}
                  <div className="text-muted mt-1">
                    Service counting restarted on each reinstatement. Only the most recent reinstatement date is used for increment calculations.
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </RoleGuard>

      {/* Suspension banner */}
      {guard.employmentStatus === 'SUSPENDED' && guard.latestSuspension && (
        <Alert variant="warning" className="mb-3">
          <div className="d-flex align-items-start gap-2">
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <div>
              <strong>Guard is currently suspended</strong>
              <div className="mt-1 small">
                Suspended by: <strong>{guard.latestSuspension.officerName}</strong>
                &nbsp;on&nbsp;{formatDate(guard.latestSuspension.incidentDate)}
              </div>
              <div className="small text-muted mt-1">
                Reason: {guard.latestSuspension.reason}
              </div>
            </div>
          </div>
        </Alert>
      )}

      {/* NID pending warning */}
      {guard.isIncompleteNID && (
        <Alert variant="warning" className="d-flex align-items-center gap-3 mb-4">
          <div className="flex-grow-1">
            <strong>National ID not yet provided.</strong> This guard cannot be deployed until their NID is updated.
          </div>
          <PermissionGuard permission="guards.edit">
            <Button
              size="sm"
              variant="warning"
              onClick={() => navigate(`/guards/${id}/edit`)}
            >
              Update NID
            </Button>
          </PermissionGuard>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultActiveKey="details" className="mb-3">
        {/* ── Tab 1: Vetting Form ───────────────────────────────────────────── */}
        <Tab eventKey="details" title="Vetting Form">
          <div className="d-flex justify-content-end mb-3">
            <PermissionGuard permission="guards.edit">
              <Button size="sm" variant="outline-primary" onClick={() => navigate(`/guards/${id}/edit`)}>
                Edit Vetting Details
              </Button>
            </PermissionGuard>
          </div>

          {/* Section A */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-header bg-white fw-bold small" style={{ color: '#1B3A6B', letterSpacing: '0.04em' }}>A — Personal Particulars</div>
            <div className="card-body">
              <Row className="g-3">
                {([
                  ['Surname', guard.lastName],
                  ['First Name', guard.firstName],
                  ['Other Names', guard.otherNames],
                  ['Registered Names', (guard as any).registeredNames],
                  ['Gender', (guard as any).gender],
                  ['Date of Birth', `${new Date(guard.dateOfBirth).toLocaleDateString()} (Age: ${Math.floor((Date.now() - new Date(guard.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} yrs)`],
                  ['Place of Birth', (guard as any).placeOfBirth],
                  ['Tribe', (guard as any).tribe],
                  ['Nationality', 'Ugandan'],
                  ['Education Level', (guard as any).educationLevel],
                  ['Marital Status', (guard as any).maritalStatus],
                  ['Spouse Name', (guard as any).spouseName],
                  ['Spouse Workplace', (guard as any).spouseWorkplace],
                  ['Spouse Telephone', (guard as any).spouseTelephone],
                  ['Phone', guard.phone],
                  ['Preferred Payment Contact', (guard as any).preferredPaymentContact],
                  ['Guard ID Number (SSLG)', guard.systemId],
                  ['Identification', guard.idSummary === 'Not provided' ? null : guard.idSummary],
                  ...(guard.idType === 'RELATIVE_ID'
                    ? [['Relative on the ID', guard.relativeIdName],
                       ["Relative's ID number", guard.relativeIdNumber]] as [string, string | null][]
                    : []),
                  ...(guard.idType === 'OTHER_DOCUMENT'
                    ? [['Document type', guard.otherDocType],
                       ['Document number', guard.otherDocNumber]] as [string, string | null][]
                    : []),
                  ...(guard.idType === 'OWN_ID'
                    ? [['National ID (NIN)', guard.nationalId]] as [string, string | null][]
                    : []),
                  ['NSSF Number', (guard as any).nssfNumber],
                  ['TIN Number', (guard as any).tinNumber],
                  ['PSO Certificate', guard.psoCertNumber],
                ] as [string, string | null | undefined][]).map(([label, value]) => (
                  <Col md={4} key={label}>
                    <div className="text-muted small">{label}</div>
                    <div className={`fw-medium ${!value ? 'text-muted fst-italic' : ''}`}>{value || 'Not provided'}</div>
                  </Col>
                ))}
              </Row>
            </div>
          </div>

          {/* Section B */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-header bg-white fw-bold small" style={{ color: '#1B3A6B', letterSpacing: '0.04em' }}>B — Address &amp; Employment</div>
            <div className="card-body">
              <div className="fw-semibold small text-muted text-uppercase mb-2">Contact Address</div>
              <Row className="g-3 mb-3">
                {([
                  ['Village', (guard as any).village],
                  ['Parish', (guard as any).parish],
                  ['Sub-county', (guard as any).subCounty],
                  ['County', (guard as any).county],
                  ['District', (guard as any).district],
                  ['LC1 Zone', (guard as any).lc1Zone],
                ] as [string, string | null][]).map(([label, value]) => (
                  <Col md={4} key={label}>
                    <div className="text-muted small">{label}</div>
                    <div className={`fw-medium ${!value ? 'text-muted fst-italic' : ''}`}>{value || 'Not provided'}</div>
                  </Col>
                ))}
              </Row>
              <div className="fw-semibold small text-muted text-uppercase mb-2">LC Official</div>
              <Row className="g-3 mb-3">
                {([
                  ['Name', (guard as any).lcOfficialName],
                  ['Position', (guard as any).lcOfficialPosition],
                  ['Phone', (guard as any).lcOfficialPhone],
                ] as [string, string | null][]).map(([label, value]) => (
                  <Col md={4} key={label}>
                    <div className="text-muted small">{label}</div>
                    <div className={`fw-medium ${!value ? 'text-muted fst-italic' : ''}`}>{value || 'Not provided'}</div>
                  </Col>
                ))}
              </Row>
              <div className="fw-semibold small text-muted text-uppercase mb-2">Employment</div>
              <Row className="g-3 mb-3">
                {([
                  ['Previous Employer', (guard as any).previousEmployer],
                  ['Previous Position', (guard as any).previousPosition],
                ] as [string, string | null][]).map(([label, value]) => (
                  <Col md={6} key={label}>
                    <div className="text-muted small">{label}</div>
                    <div className={`fw-medium ${!value ? 'text-muted fst-italic' : ''}`}>{value || 'Not provided'}</div>
                  </Col>
                ))}
                {(guard as any).talentsExperience && (
                  <Col xs={12}>
                    <div className="text-muted small">Talents / Experience</div>
                    <div className="fw-medium">{(guard as any).talentsExperience}</div>
                  </Col>
                )}
              </Row>
              <div className="fw-semibold small text-muted text-uppercase mb-2">STAP Contract</div>
              <Row className="g-3">
                {([
                  ['Contract Start', new Date(guard.contractStart).toLocaleDateString()],
                  ['Contract End', guard.contractEnd ? new Date(guard.contractEnd).toLocaleDateString() : null],
                ] as [string, string | null][]).map(([label, value]) => (
                  <Col md={4} key={label}>
                    <div className="text-muted small">{label}</div>
                    <div className={`fw-medium ${!value ? 'text-muted fst-italic' : ''}`}>{value || 'Open-ended'}</div>
                  </Col>
                ))}
                {(guard as any).reinstatedCount > 0 && (
                  <>
                    <Col md={4}>
                      <div className="text-muted small">Times Reinstated</div>
                      <div className="fw-medium">{(guard as any).reinstatedCount}</div>
                    </Col>
                    <Col md={4}>
                      <div className="text-muted small">Last Reinstated</div>
                      <div className="fw-medium">
                        {(guard as any).lastReinstatedAt
                          ? new Date((guard as any).lastReinstatedAt).toLocaleDateString('en-GB')
                          : '—'}
                      </div>
                    </Col>
                  </>
                )}
                <PermissionGuard permission="guards.edit">
                  <Col md={4}>
                    <div className="text-muted small">Bank Name</div>
                    <div className={`fw-medium ${!guard.bankName ? 'text-muted fst-italic' : ''}`}>{guard.bankName || 'Not provided'}</div>
                  </Col>
                </PermissionGuard>
                {/* Director only, deliberately: the bank account number is the one guard field
                       kept from managers. guards.edit would widen it to them and to HR. */}
                <RoleGuard allowedRoles={[ROLES.DIRECTOR]}>
                  <Col md={4}>
                    <div className="text-muted small">Account Number</div>
                    <div className="fw-medium font-monospace">{guard.accountNumber ?? '—'}</div>
                  </Col>
                </RoleGuard>
              </Row>

              {/* Sits with employment rather than in its own card: whether someone
                  can sign in is a fact about their engagement, not a separate system. */}
              <GuardSystemAccess guard={guard} />
            </div>
          </div>

          {/* Section C */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-header bg-white fw-bold small" style={{ color: '#1B3A6B', letterSpacing: '0.04em' }}>C — Family Background</div>
            <div className="card-body">
              <div className="fw-semibold small text-muted text-uppercase mb-2">Father's Details</div>
              <Row className="g-3 mb-3">
                {([
                  ["Father's Name", (guard as any).fatherName],
                  ['Current Residence', (guard as any).fatherResidence],
                  ['Village', (guard as any).fatherVillage],
                  ['Parish', (guard as any).fatherParish],
                  ['Sub-county', (guard as any).fatherSubCounty],
                  ['County', (guard as any).fatherCounty],
                  ['District', (guard as any).fatherDistrict],
                  ['Nationality', (guard as any).fatherNationality],
                  ['Occupation', (guard as any).fatherOccupation],
                  ['Phone', (guard as any).fatherPhone],
                ] as [string, string | null][]).map(([label, value]) => (
                  <Col md={4} key={label}>
                    <div className="text-muted small">{label}</div>
                    <div className={`fw-medium ${!value ? 'text-muted fst-italic' : ''}`}>{value || 'Not provided'}</div>
                  </Col>
                ))}
              </Row>

              <div className="fw-semibold small text-muted text-uppercase mb-2">Mother's Details</div>
              <Row className="g-3 mb-3">
                {([
                  ["Mother's Name", (guard as any).motherName],
                  ['Current Residence', (guard as any).motherResidence],
                  ['Village', (guard as any).motherVillage],
                  ['Parish', (guard as any).motherParish],
                  ['Sub-county', (guard as any).motherSubCounty],
                  ['County', (guard as any).motherCounty],
                  ['District', (guard as any).motherDistrict],
                  ['Nationality', (guard as any).motherNationality],
                  ['Occupation', (guard as any).motherOccupation],
                  ['Phone', (guard as any).motherPhone],
                ] as [string, string | null][]).map(([label, value]) => (
                  <Col md={4} key={label}>
                    <div className="text-muted small">{label}</div>
                    <div className={`fw-medium ${!value ? 'text-muted fst-italic' : ''}`}>{value || 'Not provided'}</div>
                  </Col>
                ))}
              </Row>

              <div className="fw-semibold small text-muted text-uppercase mb-2">Close Relatives</div>
              {!(guard as any).relatives?.length ? (
                <Alert variant="light" className="small py-2">No relatives recorded.</Alert>
              ) : (
                <Table size="sm" responsive className="mb-3">
                  <thead className="table-light">
                    <tr><th>Name</th><th>Phone</th><th>Relationship</th><th>Occupation</th><th>Residence</th></tr>
                  </thead>
                  <tbody>
                    {(guard as any).relatives.map((r: any) => (
                      <tr key={r.id}>
                        <td className="fw-medium">{r.relativeName}</td>
                        <td>{r.phone || '—'}</td>
                        <td>{r.relationship || '—'}</td>
                        <td>{r.occupation || '—'}</td>
                        <td>{r.placeOfResidence || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}

              <div className="fw-semibold small text-muted text-uppercase mb-2">Close Associates</div>
              {!(guard as any).associates?.length ? (
                <Alert variant="light" className="small py-2">No associates recorded.</Alert>
              ) : (
                <Row className="g-3 mb-3">
                  {(guard as any).associates.map((a: any, i: number) => (
                    <Col md={6} key={a.id}>
                      <div className="border rounded p-3 h-100">
                        <div className="fw-semibold mb-1">Associate {i + 1}: {a.associateName}</div>
                        {a.placeOfWork && <div className="small text-muted">Work: {a.placeOfWork}</div>}
                        {a.workDetails && <div className="small text-muted">Details: {a.workDetails}</div>}
                        {a.residence && <div className="small text-muted">Residence: {a.residence}</div>}
                        {a.phone && <div className="small text-muted">Phone: {a.phone}</div>}
                      </div>
                    </Col>
                  ))}
                </Row>
              )}

              <div className="fw-semibold small text-muted text-uppercase mb-2">Dependents &amp; Next of Kin</div>
              <Row className="g-3">
                <Col md={4}>
                  <div className="text-muted small">Number of Dependents</div>
                  <div className="fw-medium">{(guard as any).numberOfDependents ?? '—'}</div>
                </Col>
                <Col md={4}>
                  <div className="text-muted small">Next of Kin Name</div>
                  <div className={`fw-medium ${!guard.nextOfKinName ? 'text-muted fst-italic' : ''}`}>
                    {guard.nextOfKinName || 'Not provided'}
                  </div>
                </Col>
                <Col md={4}>
                  <div className="text-muted small">Next of Kin Phone</div>
                  <div className={`fw-medium ${!guard.nextOfKinPhone ? 'text-muted fst-italic' : ''}`}>
                    {guard.nextOfKinPhone || 'Not provided'}
                  </div>
                </Col>
              </Row>
            </div>
          </div>

          {/* Section D */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-header bg-white fw-bold small" style={{ color: '#1B3A6B', letterSpacing: '0.04em' }}>D — Health Information</div>
            <div className="card-body">
              <Row className="g-3">
                <Col md={4}>
                  <div className="text-muted small mb-1">Disability</div>
                  <div className="fw-medium">
                    {(guard as any).hasDisability
                      ? <>&#9851; Yes {(guard as any).disabilityDetails && <span className="text-muted fw-normal">— {(guard as any).disabilityDetails}</span>}</>
                      : 'No'}
                  </div>
                </Col>
                <Col md={4}>
                  <div className="text-muted small mb-1">Takes Alcohol</div>
                  <div className="fw-medium">{(guard as any).takesAlcohol ? '🍺 Yes' : 'No'}</div>
                </Col>
                <Col md={4}>
                  <div className="text-muted small mb-1">Allergies</div>
                  <div className="fw-medium">
                    {(guard as any).hasAllergies
                      ? <>&#9888;&#65039; Yes {(guard as any).allergyDetails && <span className="text-muted fw-normal">— {(guard as any).allergyDetails}</span>}</>
                      : 'No'}
                  </div>
                </Col>
              </Row>
            </div>
          </div>
        </Tab>

        {/* ── Tab 2: Documents ──────────────────────────────────────────────── */}
        <Tab eventKey="documents" title="Documents">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <span className="text-muted small">{guard._count?.documents ?? 0} document(s)</span>
            <PermissionGuard permission="guards.documents">
              <Button
                size="sm"
                variant="primary"
                style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
                onClick={() => setShowDocUpload(true)}
              >
                Upload Document
              </Button>
            </PermissionGuard>
          </div>
          {(guard.documents ?? []).length === 0 ? (
            <Alert variant="light">No documents uploaded yet.</Alert>
          ) : (
            <Table size="sm" hover responsive className="align-middle small">
              <thead className="table-light">
                <tr>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Uploaded By</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(guard.documents ?? []).map((doc: GuardDocumentResponse) => (
                  <tr key={doc.id}>
                    <td><Badge bg="secondary">{doc.documentType.replace(/_/g, ' ')}</Badge></td>
                    <td>v{doc.version}</td>
                    <td>{doc.uploadedBy?.name}</td>
                    <td>{new Date(doc.uploadedAt).toLocaleDateString()}</td>
                    <td>
                      <ButtonGroup size="sm">
                        <Button
                          variant="outline-primary"
                          href={doc.filePath}
                          target="_blank"
                          rel="noopener noreferrer"
                          as="a"
                        >
                          Download
                        </Button>
                        <PermissionGuard permission="guards.documents">
                          <Button
                            variant="outline-danger"
                            onClick={() => handleDeleteDoc(doc.id)}
                          >
                            Delete
                          </Button>
                        </PermissionGuard>
                      </ButtonGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Tab>

        {/* ── Tab 3: Deployment History ─────────────────────────────────────── */}
        <Tab eventKey="deployment-history" title="Deployment History">
          {deployLoading ? (
            <div className="py-3 text-center">
              <Spinner animation="border" size="sm" />
            </div>
          ) : deployHistory?.data.length === 0 ? (
            <Alert variant="light">No deployment records found.</Alert>
          ) : (
            <>
              <Table size="sm" hover responsive className="align-middle small">
                <thead className="table-light">
                  <tr>
                    <th>Site</th>
                    <th>Client</th>
                    <th>Shift</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Supervisor</th>
                  </tr>
                </thead>
                <tbody>
                  {deployHistory?.data.map((r) => (
                    <tr key={r.id}>
                      <td>{r.site.siteName}</td>
                      <td>{r.client.clientName}</td>
                      <td>{r.shiftType}</td>
                      <td>{new Date(r.startDate).toLocaleDateString()}</td>
                      <td>
                        {r.endDate ? (
                          new Date(r.endDate).toLocaleDateString()
                        ) : (
                          <Badge bg="success">Current</Badge>
                        )}
                      </td>
                      <td>{r.supervisor.name}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {deployHistory && deployHistory.pagination.totalPages > 1 && (
                <Pagination size="sm" className="justify-content-center mt-2">
                  <Pagination.Prev
                    onClick={() => setDeployPage((p) => p - 1)}
                    disabled={deployPage === 1}
                  />
                  <Pagination.Item active>{deployPage}</Pagination.Item>
                  <Pagination.Next
                    onClick={() => setDeployPage((p) => p + 1)}
                    disabled={deployPage === deployHistory.pagination.totalPages}
                  />
                </Pagination>
              )}
            </>
          )}
        </Tab>

        {/* ── Tab 4: Transfer History ───────────────────────────────────────── */}
        <Tab eventKey="transfer-history" title="Transfer History">
          {transfersLoading ? (
            <div className="py-3 text-center">
              <Spinner animation="border" size="sm" />
            </div>
          ) : !transferHistory || transferHistory.length === 0 ? (
            <Alert variant="light">No transfers on record for this guard.</Alert>
          ) : (
            <Table size="sm" hover responsive className="align-middle small">
              <thead className="table-light">
                <tr>
                  <th>Date</th>
                  <th>From Site</th>
                  <th>To Site</th>
                  <th>Reason</th>
                  <th>Authorised By</th>
                </tr>
              </thead>
              <tbody>
                {transferHistory.map((t: GuardTransferResponse) => (
                  <tr key={t.id}>
                    <td>{new Date(t.transferDate).toLocaleDateString('en-GB')}</td>
                    <td>
                      {t.fromSite ? (
                        <>
                          {t.fromSite.siteName}
                          <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                            {t.fromSite.clientName}
                          </div>
                        </>
                      ) : '—'}
                    </td>
                    <td style={{ color: '#0d9e8e' }}>
                      {t.toSite.siteName}
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                        {t.toSite.clientName}
                      </div>
                    </td>
                    <td title={t.reason}>
                      {t.reason.length > 60 ? t.reason.slice(0, 60) + '…' : t.reason}
                    </td>
                    <td>{t.authorisedBy.name}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Tab>

        {/* ── Tab 5: Promotion History ──────────────────────────────────────── */}
        <Tab eventKey="promotion-history" title="Promotion History">
          {promotionHistory.length === 0 ? (
            <Alert variant="light">No promotions on record for this guard.</Alert>
          ) : (
            <Table size="sm" hover responsive className="align-middle small">
              <thead className="table-light">
                <tr>
                  <th>Effective</th>
                  <th>Rank</th>
                  <th>Salary</th>
                  <th>Change</th>
                  <th>Reason</th>
                  <th>Promoted By</th>
                </tr>
              </thead>
              <tbody>
                {promotionHistory.map((p: GuardPromotionResponse) => (
                  <tr key={p.id}>
                    <td>{new Date(p.effectiveDate).toLocaleDateString('en-GB')}</td>
                    <td>
                      {p.fromRank} → <span style={{ color: '#1E8449', fontWeight: 600 }}>{p.toRank}</span>
                    </td>
                    <td>
                      UGX {p.fromSalary.toLocaleString()} → UGX {p.toSalary.toLocaleString()}
                    </td>
                    <td style={{ color: p.salaryIncrement > 0 ? '#1E8449' : p.salaryIncrement < 0 ? '#c0392b' : '#6c757d', fontWeight: 600 }}>
                      {p.salaryIncrement > 0 ? '+' : ''}UGX {p.salaryIncrement.toLocaleString()}
                    </td>
                    <td title={p.reason ?? undefined}>
                      {p.reason ? (p.reason.length > 60 ? p.reason.slice(0, 60) + '…' : p.reason) : '—'}
                    </td>
                    <td>{p.promotedBy.name}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Tab>

        {/* ── Tab 6: Disciplinary Records ───────────────────────────────────── */}
        <Tab eventKey="disciplinary" title="Disciplinary Records">
          {/* Action bar */}
          <div className="d-flex justify-content-between align-items-center mb-3">
            <span className="text-muted small">{disciplinaryRecords.length} record(s)</span>
            <PermissionGuard permission="hr.disciplinary">
              <Button variant="outline-primary" size="sm" onClick={() => setShowDisciplinaryModal(true)}>
                <i className="bi bi-plus-lg me-1" />Add Record
              </Button>
            </PermissionGuard>
          </div>

          {/* Disciplinary records — card list, each with its own linked letters */}
          {disciplinaryRecords.length === 0 ? (
            <Alert variant="light">No disciplinary records.</Alert>
          ) : (
            <div className="d-flex flex-column gap-3">
              {disciplinaryRecords.map((d) => {
                const badgeInfo = DISCIPLINARY_BADGE[d.type] ?? { bg: 'secondary' };
                const recordLetters = letterRecords.filter((l) => l.disciplinaryRecordId === d.id);
                return (
                  <div key={d.id} className="card border-0 shadow-sm">
                    <div className="card-body">
                      <div className="d-flex align-items-start justify-content-between gap-2">
                        <div>
                          <Badge bg={badgeInfo.bg} text={badgeInfo.text} style={badgeInfo.style}>
                            {d.type.replace(/_/g, ' ')}
                          </Badge>
                          <span className="text-muted small ms-2">{new Date(d.incidentDate).toLocaleDateString('en-GB')}</span>
                          {d.officer?.name && <span className="text-muted small ms-2">· Officer: {d.officer.name}</span>}
                        </div>
                        <PermissionGuard permission="hr.letters">
                          <Button
                            size="sm"
                            style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B', color: '#fff' }}
                            onClick={() => setDisciplinaryLetterRecord(d)}
                          >
                            <i className="bi bi-file-earmark-pdf me-1" />
                            {recordLetters.length === 0 ? 'Generate Letter' : '+ Another Letter'}
                          </Button>
                        </PermissionGuard>
                      </div>
                      <div className="small mt-2"><strong>Reason:</strong> {d.reason}</div>
                      <div className="small"><strong>Outcome:</strong> {d.outcome}</div>
                      {d.letterPath && (
                        <div className="mt-2">
                          <Button size="sm" variant="outline-secondary" href={d.letterPath} target="_blank" rel="noopener noreferrer" as="a">
                            <i className="bi bi-download me-1" />Legacy Letter PDF
                          </Button>
                        </div>
                      )}

                      {recordLetters.length > 0 && (
                        <div className="mt-3 pt-2 border-top">
                          <div className="text-uppercase text-muted fw-semibold mb-2" style={{ fontSize: '0.7rem', letterSpacing: '0.06em' }}>
                            Letters for this incident
                          </div>
                          <div className="d-flex flex-column gap-2">
                            {recordLetters.map((l) => (
                              <LetterCard
                                key={l.id}
                                letter={l}
                                canReview={canReviewLetters}
                                onReview={() => setReviewLetter(l)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* PDF letters (legacy fire-and-forget system) */}
          <PermissionGuard permission="hr.letters">
            {guardLetters.length > 0 && (
              <div className="mt-4">
                <div className="text-uppercase text-muted fw-semibold mb-2" style={{ fontSize: '0.7rem', letterSpacing: '0.06em' }}>
                  PDF Letters (Legacy)
                </div>
                <Table size="sm" hover responsive className="align-middle small">
                  <thead className="table-light">
                    <tr><th>Letter Type</th><th>Date</th><th>Version</th><th></th></tr>
                  </thead>
                  <tbody>
                    {guardLetters.map(l => (
                      <tr key={l.id}>
                        <td><Badge bg="secondary">{l.documentType.replace(/_/g, ' ')}</Badge></td>
                        <td>{new Date(l.uploadedAt).toLocaleDateString()}</td>
                        <td>v{l.version}</td>
                        <td>
                          <Button size="sm" variant="outline-primary" href={l.filePath} target="_blank" rel="noopener noreferrer" as="a">
                            <i className="bi bi-download" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </PermissionGuard>
        </Tab>

        {/* ── Tab 6: Letters (HR letters — never disciplinary) ──────────────── */}
        <Tab eventKey="letters" title="Letters">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <span className="text-muted small">{hrLetters.length} letter(s)</span>
            <PermissionGuard permission="hr.letters">
              <Button
                size="sm"
                style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B', color: '#fff' }}
                onClick={() => setShowHRLetterModal(true)}
              >
                + Generate Letter
              </Button>
            </PermissionGuard>
          </div>

          {hrLetters.length === 0 ? (
            <Alert variant="light" className="small py-2">No letters generated for this guard yet.</Alert>
          ) : (
            <div className="d-flex flex-column gap-2">
              {hrLetters.map((l) => (
                <LetterCard
                  key={l.id}
                  letter={l}
                  canReview={canReviewLetters}
                  onReview={() => setReviewLetter(l)}
                />
              ))}
            </div>
          )}
        </Tab>

        {/* ── Issued Items Tab ──────────────────────────────────────────────── */}
        {canViewIssuedItems && <Tab eventKey="issued-items" title="Issued Items">
          <IssuedItemsTab guardId={id!} guardName={guard.fullName} guardStatus={guard.employmentStatus} />
        </Tab>}

        {/* ── Deductions Tab ────────────────────────────────────────────────── */}
        {canViewDeductions && <Tab eventKey="deductions" title="Deductions">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <span className="fw-semibold small">Guard Deductions</span>
              <Button size="sm" variant="outline-danger" onClick={() => setShowDeductionModal(true)}>
                + Add Deduction
              </Button>
            </div>

            {deductions.length === 0 ? (
              <Alert variant="light" className="small py-2">No deductions recorded.</Alert>
            ) : (
              <>
                <Table size="sm" hover responsive className="align-middle small">
                  <thead className="table-light">
                    <tr>
                      <th>Type</th>
                      <th className="text-end">Amount (UGX)</th>
                      <th>Description</th>
                      <th>Effective Date</th>
                      <th>Status</th>
                      <th>Applied In</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deductions.map((d) => (
                      <tr key={d.id}>
                        <td><Badge bg="secondary" style={{ fontSize: '0.65rem' }}>{d.type.replace(/_/g, ' ')}</Badge></td>
                        <td className="text-end">{d.amount.toLocaleString()}</td>
                        <td>{d.description}</td>
                        <td>{new Date(d.effectiveDate).toLocaleDateString('en-GB')}</td>
                        <td>
                          <Badge
                            bg={d.status === 'PENDING' ? 'warning' : d.status === 'APPLIED' ? 'success' : 'secondary'}
                            text={d.status === 'PENDING' ? 'dark' : undefined}
                          >
                            {d.status}
                          </Badge>
                        </td>
                        <td className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {d.status === 'PENDING' && (
                            <span>
                              Will apply in{' '}
                              {new Date(d.effectiveDate).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                            </span>
                          )}
                          {d.status === 'APPLIED' && d.appliedInPayroll && (
                            <span className="text-success">
                              Applied in {d.appliedInPayroll.month}/{d.appliedInPayroll.year} payroll
                            </span>
                          )}
                          {d.status === 'CANCELLED' && (
                            <span className="text-danger">Cancelled</span>
                          )}
                        </td>
                        <td>
                          {d.status === 'PENDING' && (
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              onClick={() =>
                                cancelDeduction.mutateAsync(d.id)
                                  .then(() => refetchDeductions())
                                  .catch(() => showToast('Failed to cancel', 'danger'))
                              }
                            >
                              Cancel
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <div className="small text-muted mt-1">
                  Total pending: <strong>
                    UGX {deductions.filter((d) => d.status === 'PENDING').reduce((s, d) => s + d.amount, 0).toLocaleString()}
                  </strong>
                </div>
                <Alert variant="info" className="small py-2 mt-2 mb-0">
                  Pending deductions will be automatically applied in the next payroll run.
                </Alert>
              </>
            )}
          </Tab>}
      </Tabs>

      {/* Modals */}
      {statusModal && (
        <StatusChangeModal
          guardId={id!}
          guardName={guard.fullName}
          currentStatus={guard.employmentStatus}
          targetStatus={statusModal.targetStatus}
          onClose={() => setStatusModal(null)}
          onSuccess={() => refetch()}
        />
      )}
      {showDocUpload && (
        <DocumentUploadModal
          guardId={id!}
          onClose={() => setShowDocUpload(false)}
          onSuccess={() => refetch()}
        />
      )}
      {showDisciplinaryModal && (
        <DisciplinaryRecordModal
          guardId={id!}
          guardName={guard.fullName}
          existingRecords={disciplinaryRecords}
          onClose={() => setShowDisciplinaryModal(false)}
          onSuccess={() => refetchDisciplinary()}
        />
      )}
      {disciplinaryLetterRecord && (
        <DisciplinaryLetterModal
          show
          guardId={id!}
          guardName={guard.fullName}
          disciplinaryRecord={disciplinaryLetterRecord}
          onClose={() => setDisciplinaryLetterRecord(null)}
          onSuccess={() => refetchLetterRecords()}
        />
      )}
      {showHRLetterModal && (
        <HRLetterModal
          show={showHRLetterModal}
          guardId={id!}
          guardName={guard.fullName}
          onClose={() => setShowHRLetterModal(false)}
          onSuccess={() => refetchLetterRecords()}
        />
      )}
      {reviewLetter && (
        <ApproveLetterModal
          show
          letter={reviewLetter}
          onClose={() => { setReviewLetter(null); refetchLetterRecords(); }}
        />
      )}
      {showDeductionModal && (
        <DeductionFormModal
          guardId={id!}
          guardName={guard.fullName}
          onClose={() => { setShowDeductionModal(false); refetchDeductions(); }}
        />
      )}
      {showReinstateModal && (
        <ReinstateModal
          guardId={id!}
          guard={guard}
          onClose={() => setShowReinstateModal(false)}
          onSuccess={() => {
            showToast(`${guard.fullName} reinstated. Service counting restarted from today.`, 'success');
            refetch();
            refetchDisciplinary();
          }}
        />
      )}
      {showTransferModal && (
        <TransferModal
          guardId={id!}
          guardName={guard.fullName}
          currentSiteId={activeDeployment?.site.id ?? null}
          currentSiteName={activeDeployment?.site.siteName ?? null}
          onClose={() => setShowTransferModal(false)}
          onSuccess={() => refetch()}
        />
      )}
      {showPromoteModal && (
        <PromoteGuardModal
          guardId={id!}
          guardName={guard.fullName}
          currentRank={guard.rank}
          currentSalary={guard.salaryRate}
          onClose={() => setShowPromoteModal(false)}
          onSuccess={() => { refetch(); showToast(`${guard.fullName} has been promoted.`, 'success'); }}
        />
      )}
    </div>
  );
}
