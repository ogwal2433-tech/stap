import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Badge, Breadcrumb, Button, ButtonGroup, Card, Col, Dropdown,
  Form, Modal, Pagination, Row, Spinner, Tab, Table, Tabs,
} from 'react-bootstrap';
import { useGuard, useGuardDeploymentHistory, useReinstateGuard, useTransferHistory, useDownloadIdCard } from '../../hooks/useGuards';
import { useTodaysDeployments } from '../../hooks/useAttendance';
import { useDisciplinaryRecords, useGuardLetters } from '../../hooks/useDisciplinary';
import { useDeductions, useCancelDeduction } from '../../hooks/useFinance';
import { useGuardInventory, useReturnItem } from '../../hooks/useInventory';
import { guardsApi } from '../../lib/guards.api';
import { useAuth } from '../../context/AuthContext';
import RoleGuard from '../../components/RoleGuard';
import InitialsAvatar from '../../components/ui/InitialsAvatar';
import StatusChangeModal from '../../components/guards/StatusChangeModal';
import DocumentUploadModal from '../../components/guards/DocumentUploadModal';
import DisciplinaryRecordModal from '../../components/guards/DisciplinaryRecordModal';
import LetterGenerationModal from '../../components/guards/LetterGenerationModal';
import TransferModal from '../../components/guards/TransferModal';
import DeductionFormModal from '../../components/finance/DeductionFormModal';
import { useToast } from '../../context/ToastContext';
import {
  ROLES, GUARD_CONTRACT_TYPES, GUARD_WRITE_ROLES, HR_ROLES, FINANCE_ROLES, SALARY_INCREMENT_RULES,
  type UserRole, type GuardDocumentResponse, type GuardTransferResponse,
} from '@stap/shared';
import { useGuardRanks, useDeductionTypes } from '../../hooks/useSettings';
import type { DeductionTypeResponse } from '@stap/shared';

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  TERMINATED: 'danger',
};

const RANK_BADGE_COLORS = ['secondary', 'info', 'primary', 'warning', 'dark'];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

const DISCIPLINARY_BADGE: Record<string, { bg: string; text?: string; style?: React.CSSProperties }> = {
  VERBAL_WARNING: { bg: 'warning', text: 'dark' },
  WRITTEN_WARNING: { bg: 'warning', text: 'dark', style: { backgroundColor: '#E8701A', borderColor: '#E8701A' } },
  SUSPENSION: { bg: 'danger' },
  TERMINATION: { bg: 'dark' },
  REINSTATEMENT: { bg: 'success' },
};

interface StatusModal {
  targetStatus: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
}

const DEDUCTION_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER];

interface ReinstateModalProps {
  guardId: string;
  guardName: string;
  onClose: () => void;
  onSuccess: () => void;
}

function ReinstateModal({ guardId, guardName, onClose, onSuccess }: ReinstateModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const reinstate = useReinstateGuard();

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
        <p className="mb-3">
          <strong>{guardName}</strong> will be reinstated and their status returned to{' '}
          <Badge bg="success">ACTIVE</Badge>.
        </p>
        <Form.Group>
          <Form.Label>Reason for reinstatement <span className="text-danger">*</span></Form.Label>
          <Form.Control
            as="textarea"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Disciplinary matter resolved. Guard has completed counselling and acknowledged the code of conduct."
          />
          {error && <Form.Text className="text-danger">{error}</Form.Text>}
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={reinstate.isPending}>
          Cancel
        </Button>
        <Button
          variant="success"
          onClick={handleConfirm}
          disabled={reinstate.isPending}
        >
          {reinstate.isPending ? <Spinner size="sm" /> : 'Confirm Re-instatement'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function IssuedItemsTab({ guardId }: { guardId: string }) {
  const { data: items, isLoading } = useGuardInventory(guardId);
  const ret = useReturnItem();
  const { showToast } = useToast();

  const handleReturn = (itemId: string, guardId: string) => {
    const qty = Number(prompt('Quantity to return:') ?? '0');
    if (!qty || qty <= 0) return;
    ret.mutate(
      { itemId, guardId, quantity: qty, action: 'RETURNED' },
      {
        onSuccess: () => showToast('Item returned successfully', 'success'),
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed to record return', 'danger'),
      },
    );
  };

  if (isLoading) return <div className="text-center py-4"><Spinner /></div>;
  if (!items || items.length === 0) {
    return <Alert variant="light" className="small py-2">No items currently issued to this guard.</Alert>;
  }

  return (
    <Table hover size="sm" responsive className="mt-2">
      <thead className="table-light">
        <tr>
          <th>Item Code</th>
          <th>Item Name</th>
          <th>Type</th>
          <th className="text-center">Outstanding</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map(row => (
          <tr key={row.item.id}>
            <td><code style={{ fontSize: 12 }}>{row.item.itemCode}</code></td>
            <td className="fw-medium">{row.item.itemName}</td>
            <td><Badge bg="secondary" style={{ fontSize: 10 }}>{row.item.itemType}</Badge></td>
            <td className="text-center fw-bold">{row.outstanding}</td>
            <td>
              <Button
                size="sm"
                variant="outline-warning"
                style={{ fontSize: 11, padding: '1px 6px' }}
                onClick={() => handleReturn(row.item.id, guardId)}
              >
                Return
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default function GuardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const canViewDeductions = !!user && DEDUCTION_ROLES.includes(user.role as UserRole);

  const { data: guard, isLoading, isError, refetch } = useGuard(id ?? '');
  const { data: ranks = [] } = useGuardRanks(false);
  const { data: deductionTypes = [] } = useDeductionTypes(true);
  const todayIso = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';
  const { data: todayDeployments } = useTodaysDeployments({ guardId: id, date: todayIso, limit: 1 });
  const [statusModal, setStatusModal] = useState<StatusModal | null>(null);
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [deployPage, setDeployPage] = useState(1);

  const { data: deployHistory, isLoading: deployLoading } = useGuardDeploymentHistory(
    id ?? '',
    deployPage,
  );
  const { data: disciplinaryRecords = [], refetch: refetchDisciplinary } = useDisciplinaryRecords(id ?? '');
  const { data: guardLetters = [], refetch: refetchLetters } = useGuardLetters(id ?? '');

  const [showDisciplinaryModal, setShowDisciplinaryModal] = useState(false);
  const [showLetterModal, setShowLetterModal] = useState(false);
  const [showDeductionModal, setShowDeductionModal] = useState(false);
  const [prefilledDeductionType, setPrefilledDeductionType] = useState<DeductionTypeResponse | null>(null);
  const [showReinstateModal, setShowReinstateModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [idCardError, setIdCardError] = useState('');

  const { data: transferHistory, isLoading: transfersLoading } = useTransferHistory(id ?? '');
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
        <h4 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>{guard.fullName}</h4>
        <ButtonGroup size="sm">
          <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
            <Button variant="outline-primary" onClick={() => navigate(`/guards/${id}/edit`)}>
              Edit
            </Button>
          </RoleGuard>
          <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER]}>
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
                  {guard.employmentStatus !== 'ACTIVE' && (
                    <Dropdown.Item onClick={() => setStatusModal({ targetStatus: 'ACTIVE' })}>
                      ✅ Activate
                    </Dropdown.Item>
                  )}
                  <Dropdown.Item onClick={() => setStatusModal({ targetStatus: 'SUSPENDED' })}>
                    ⚠️ Suspend
                  </Dropdown.Item>
                  {guard.employmentStatus !== 'TERMINATED' && (
                    <Dropdown.Item
                      className="text-danger"
                      onClick={() => setStatusModal({ targetStatus: 'TERMINATED' })}
                    >
                      <i className="bi bi-x-circle-fill me-1" />Terminate
                    </Dropdown.Item>
                  )}
                </Dropdown.Menu>
              </Dropdown>
            )}
          </RoleGuard>
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
            <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.OPERATIONS_SUPERVISOR] as UserRole[]}>
              <Button variant="outline-info" onClick={() => setShowTransferModal(true)}>
                Transfer
              </Button>
            </RoleGuard>
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
                NIN: {guard.nationalId ?? <span className="text-warning fw-semibold">Pending</span>}
              </div>
              <div className="text-muted small">{guard.phone}</div>
            </Col>
            <Col xs="auto" className="text-end">
              <Badge
                bg={STATUS_BADGE[guard.employmentStatus]}
                text={guard.employmentStatus === 'SUSPENDED' ? 'dark' : undefined}
                className="fs-6 px-3 py-2 mb-2 d-block"
              >
                {guard.employmentStatus}
              </Badge>
              {guard.employmentStatus === 'ACTIVE' && (
                todayDeployments?.data?.[0] ? (
                  <Badge bg="success" className="px-3 py-2 mb-2 d-block" style={{ fontSize: '0.75rem' }}>
                    📍 Deployed today — {todayDeployments.data[0].site.siteName}
                  </Badge>
                ) : (
                  <Badge bg="secondary" className="px-3 py-2 mb-2 d-block" style={{ fontSize: '0.75rem' }}>
                    📭 Not deployed today
                  </Badge>
                )
              )}
              <Badge
                bg={RANK_BADGE_COLORS[((ranks.find((r) => r.name === guard.rank)?.displayOrder ?? 1) - 1) % RANK_BADGE_COLORS.length]}
                className="fs-6 px-3 py-2 mb-2 d-block"
              >
                {guard.rank}
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
              <RoleGuard allowedRoles={FINANCE_ROLES as UserRole[]}>
                <div className="text-muted small">
                  UGX {guard.salaryRate.toLocaleString()} / month
                </div>
              </RoleGuard>
              <div className="text-muted small mt-1">
                From: {new Date(guard.contractStart).toLocaleDateString()}
                {guard.contractEnd && ` → ${new Date(guard.contractEnd).toLocaleDateString()}`}
              </div>
            </Col>
          </Row>
        </div>
      </div>

      {/* Salary Increment History */}
      {guard.contractType === 'PERMANENT' && (
        <RoleGuard allowedRoles={FINANCE_ROLES as UserRole[]}>
          <Card className="mb-3">
            <Card.Header className="fw-bold">Salary Increment History</Card.Header>
            <Card.Body>
              <Row>
                <Col md={4}>
                  <div className="text-muted small">Current Salary</div>
                  <div className="fw-semibold">UGX {guard.salaryRate.toLocaleString()} / month</div>
                </Col>
                <Col md={4}>
                  <div className="text-muted small">Total Increments Applied</div>
                  <div className="fw-semibold">{guard.incrementCount ?? 0}</div>
                </Col>
                <Col md={4}>
                  <div className="text-muted small">Last Increment Date</div>
                  <div className="fw-semibold">
                    {guard.lastIncrementDate ? formatDate(guard.lastIncrementDate) : 'None yet'}
                  </div>
                </Col>
              </Row>
              <Row className="mt-3">
                <Col md={6}>
                  <div className="text-muted small">Next Increment Due</div>
                  <div className="fw-semibold">
                    {guard.nextIncrementDate ? formatDate(guard.nextIncrementDate) : '—'}
                  </div>
                </Col>
                <Col md={6}>
                  <div className="text-muted small">Next Increment Amount</div>
                  <div className="fw-semibold">
                    {guard.incrementCount === 0
                      ? `UGX ${SALARY_INCREMENT_RULES.firstYearIncrement.toLocaleString()}`
                      : `UGX ${SALARY_INCREMENT_RULES.subsequentYearIncrement.toLocaleString()}`}
                  </div>
                </Col>
              </Row>
              {guard.incrementCount === 0 && guard.contractStart && (
                <Alert variant="info" className="mb-0 mt-3 small py-2">
                  First increment of UGX {SALARY_INCREMENT_RULES.firstYearIncrement.toLocaleString()} applies on{' '}
                  {formatDate(
                    new Date(
                      new Date(guard.contractStart).setFullYear(
                        new Date(guard.contractStart).getFullYear() + 1,
                      ),
                    ).toISOString(),
                  )}
                  .
                </Alert>
              )}
            </Card.Body>
          </Card>
        </RoleGuard>
      )}

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
          <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
            <Button
              size="sm"
              variant="warning"
              onClick={() => navigate(`/guards/${id}/edit`)}
            >
              Update NID
            </Button>
          </RoleGuard>
        </Alert>
      )}

      {/* Tabs */}
      <Tabs defaultActiveKey="details" className="mb-3">
        {/* ── Tab 1: Vetting Form ───────────────────────────────────────────── */}
        <Tab eventKey="details" title="Vetting Form">
          <div className="d-flex justify-content-end mb-3">
            <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
              <Button size="sm" variant="outline-primary" onClick={() => navigate(`/guards/${id}/edit`)}>
                Edit Vetting Details
              </Button>
            </RoleGuard>
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
                  ['National ID (NIN)', guard.nationalId],
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
                <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
                  <Col md={4}>
                    <div className="text-muted small">Bank Name</div>
                    <div className={`fw-medium ${!guard.bankName ? 'text-muted fst-italic' : ''}`}>{guard.bankName || 'Not provided'}</div>
                  </Col>
                </RoleGuard>
                <RoleGuard allowedRoles={[ROLES.DIRECTOR]}>
                  <Col md={4}>
                    <div className="text-muted small">Account Number</div>
                    <div className="fw-medium font-monospace">{guard.accountNumber ?? '—'}</div>
                  </Col>
                </RoleGuard>
              </Row>
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
                  <div className="fw-medium">{guard.nextOfKinName}</div>
                </Col>
                <Col md={4}>
                  <div className="text-muted small">Next of Kin Phone</div>
                  <div className="fw-medium">{guard.nextOfKinPhone}</div>
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
            <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
              <Button
                size="sm"
                variant="primary"
                style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
                onClick={() => setShowDocUpload(true)}
              >
                Upload Document
              </Button>
            </RoleGuard>
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
                        <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
                          <Button
                            variant="outline-danger"
                            onClick={() => handleDeleteDoc(doc.id)}
                          >
                            Delete
                          </Button>
                        </RoleGuard>
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

        {/* ── Tab 5: Disciplinary Records ───────────────────────────────────── */}
        <Tab eventKey="disciplinary" title="Disciplinary Records">
          {/* Action bar */}
          <div className="d-flex justify-content-between align-items-center mb-3">
            <span className="text-muted small">{disciplinaryRecords.length} record(s)</span>
            <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
              <ButtonGroup size="sm">
                <Button
                  variant="outline-primary"
                  onClick={() => setShowDisciplinaryModal(true)}
                >
                  <i className="bi bi-plus-lg me-1" />Add Record
                </Button>
                <Button
                  style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B', color: '#fff' }}
                  onClick={() => setShowLetterModal(true)}
                >
                  <i className="bi bi-file-earmark-pdf me-1" />Generate Letter
                </Button>
              </ButtonGroup>
            </RoleGuard>
          </div>

          {/* Disciplinary records table */}
          {disciplinaryRecords.length === 0 ? (
            <Alert variant="light">No disciplinary records.</Alert>
          ) : (
            <Table size="sm" hover responsive className="align-middle small">
              <thead className="table-light">
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Officer</th>
                  <th>Reason</th>
                  <th>Outcome</th>
                  <th>Letter</th>
                </tr>
              </thead>
              <tbody>
                {disciplinaryRecords.map((d) => {
                  const badgeInfo = DISCIPLINARY_BADGE[d.type] ?? { bg: 'secondary' };
                  return (
                    <tr key={d.id}>
                      <td>{new Date(d.incidentDate).toLocaleDateString()}</td>
                      <td>
                        <Badge bg={badgeInfo.bg} text={badgeInfo.text} style={badgeInfo.style}>
                          {d.type.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td>{d.officer?.name}</td>
                      <td title={d.reason}>
                        {d.reason.length > 60 ? d.reason.substring(0, 60) + '…' : d.reason}
                      </td>
                      <td title={d.outcome}>
                        {d.outcome.length > 60 ? d.outcome.substring(0, 60) + '…' : d.outcome}
                      </td>
                      <td>
                        {d.letterPath ? (
                          <Button
                            size="sm"
                            variant="outline-primary"
                            href={d.letterPath}
                            target="_blank"
                            rel="noopener noreferrer"
                            as="a"
                          >
                            <i className="bi bi-download" />
                          </Button>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}

          {/* Generated Letters section */}
          <RoleGuard allowedRoles={HR_ROLES as UserRole[]}>
            <div className="mt-4">
              <h6 className="text-uppercase text-muted fw-semibold mb-2" style={{ fontSize: '0.75rem', letterSpacing: '0.06em' }}>
                Generated Letters
              </h6>
              {guardLetters.length === 0 ? (
                <Alert variant="light" className="small py-2">No letters generated yet.</Alert>
              ) : (
                <Table size="sm" hover responsive className="align-middle small">
                  <thead className="table-light">
                    <tr>
                      <th>Letter Type</th>
                      <th>Date Generated</th>
                      <th>Version</th>
                      <th>Download</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guardLetters.map((l) => (
                      <tr key={l.id}>
                        <td><Badge bg="secondary">{l.documentType.replace(/_/g, ' ')}</Badge></td>
                        <td>{new Date(l.uploadedAt).toLocaleDateString()}</td>
                        <td>v{l.version}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="outline-primary"
                            href={l.filePath}
                            target="_blank"
                            rel="noopener noreferrer"
                            as="a"
                          >
                            <i className="bi bi-download" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          </RoleGuard>
        </Tab>

        {/* ── Issued Items Tab ──────────────────────────────────────────────── */}
        {canViewDeductions && <Tab eventKey="issued-items" title="Issued Items">
          <IssuedItemsTab guardId={id!} />
        </Tab>}

        {/* ── Deductions Tab ────────────────────────────────────────────────── */}
        {canViewDeductions && <Tab eventKey="deductions" title="Deductions">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="fw-semibold small">Guard Deductions</span>
              <Button
                size="sm"
                variant="outline-danger"
                onClick={() => { setPrefilledDeductionType(null); setShowDeductionModal(true); }}
              >
                + Add Deduction
              </Button>
            </div>
            {deductionTypes.filter((t) => t.defaultAmount !== null && !t.isAutomatic).length > 0 && (
              <div className="d-flex flex-wrap gap-1 mb-3">
                {deductionTypes
                  .filter((t) => t.defaultAmount !== null && !t.isAutomatic)
                  .map((t) => (
                    <Button
                      key={t.id}
                      variant="outline-secondary"
                      size="sm"
                      style={{ fontSize: '0.75rem' }}
                      onClick={() => { setPrefilledDeductionType(t); setShowDeductionModal(true); }}
                    >
                      + {t.name} UGX {t.defaultAmount!.toLocaleString()}
                    </Button>
                  ))
                }
              </div>
            )}

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
      {showLetterModal && (
        <LetterGenerationModal
          guardId={id!}
          guardName={guard.fullName}
          disciplinaryRecords={disciplinaryRecords}
          onClose={() => setShowLetterModal(false)}
          onSuccess={() => refetchLetters()}
        />
      )}
      {showDeductionModal && (
        <DeductionFormModal
          guardId={id!}
          prefilledType={prefilledDeductionType}
          onClose={() => { setShowDeductionModal(false); setPrefilledDeductionType(null); refetchDeductions(); }}
        />
      )}
      {showReinstateModal && (
        <ReinstateModal
          guardId={id!}
          guardName={guard.fullName}
          onClose={() => setShowReinstateModal(false)}
          onSuccess={() => {
            showToast('Guard reinstated successfully', 'success');
            refetch();
            refetchDisciplinary();
          }}
        />
      )}
      {showTransferModal && (
        <TransferModal
          guardId={id!}
          guardName={guard.fullName}
          currentSiteId={
            deployHistory?.data.find((d) => !d.endDate)?.site.id ?? null
          }
          currentSiteName={
            deployHistory?.data.find((d) => !d.endDate)?.site.siteName ?? null
          }
          onClose={() => setShowTransferModal(false)}
          onSuccess={() => refetch()}
        />
      )}
    </div>
  );
}
