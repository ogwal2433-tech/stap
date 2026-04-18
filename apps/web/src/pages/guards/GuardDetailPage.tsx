import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Badge, Breadcrumb, Button, ButtonGroup, Col, Dropdown,
  Pagination, Row, Spinner, Tab, Table, Tabs,
} from 'react-bootstrap';
import { useGuard, useGuardDeploymentHistory } from '../../hooks/useGuards';
import { useDisciplinaryRecords, useGuardLetters } from '../../hooks/useDisciplinary';
import { useDeductions, useCancelDeduction } from '../../hooks/useFinance';
import { guardsApi } from '../../lib/guards.api';
import { useAuth } from '../../context/AuthContext';
import RoleGuard from '../../components/RoleGuard';
import InitialsAvatar from '../../components/ui/InitialsAvatar';
import StatusChangeModal from '../../components/guards/StatusChangeModal';
import DocumentUploadModal from '../../components/guards/DocumentUploadModal';
import DisciplinaryRecordModal from '../../components/guards/DisciplinaryRecordModal';
import LetterGenerationModal from '../../components/guards/LetterGenerationModal';
import DeductionFormModal from '../../components/finance/DeductionFormModal';
import { useToast } from '../../context/ToastContext';
import {
  ROLES, GUARD_WRITE_ROLES, HR_ROLES, FINANCE_ROLES, type UserRole,
} from '@stap/shared';

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  TERMINATED: 'danger',
};

const DISCIPLINARY_BADGE: Record<string, { bg: string; text?: string; style?: React.CSSProperties }> = {
  VERBAL_WARNING: { bg: 'warning', text: 'dark' },
  WRITTEN_WARNING: { bg: 'warning', text: 'dark', style: { backgroundColor: '#E8701A', borderColor: '#E8701A' } },
  SUSPENSION: { bg: 'danger' },
  TERMINATION: { bg: 'dark' },
};

interface StatusModal {
  targetStatus: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED';
}

const DEDUCTION_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER];

export default function GuardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const canViewDeductions = !!user && DEDUCTION_ROLES.includes(user.role as UserRole);

  const { data: guard, isLoading, isError, refetch } = useGuard(id ?? '');
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
                {guard.employmentStatus !== 'SUSPENDED' && (
                  <Dropdown.Item onClick={() => setStatusModal({ targetStatus: 'SUSPENDED' })}>
                    ⚠️ Suspend
                  </Dropdown.Item>
                )}
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
          </RoleGuard>
          <Button variant="outline-secondary" onClick={() => navigate('/guards')}>
            ← Back
          </Button>
        </ButtonGroup>
      </div>

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
              <div className="text-muted small mb-1">NIN: {guard.nationalId}</div>
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

      {/* Tabs */}
      <Tabs defaultActiveKey="details" className="mb-3">
        {/* ── Tab 1: Details ─────────────────────────────────────────────────── */}
        <Tab eventKey="details" title="Details">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <Row className="g-3">
                {[
                  { label: 'Date of Birth', value: `${new Date(guard.dateOfBirth).toLocaleDateString()} (Age: ${Math.floor((Date.now() - new Date(guard.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))} yrs)` },
                  { label: 'Next of Kin', value: guard.nextOfKinName },
                  { label: 'Next of Kin Phone', value: guard.nextOfKinPhone },
                  { label: 'PSO Certificate', value: guard.psoCertNumber ?? '—' },
                  { label: 'Contract Start', value: new Date(guard.contractStart).toLocaleDateString() },
                  { label: 'Contract End', value: guard.contractEnd ? new Date(guard.contractEnd).toLocaleDateString() : '—' },
                  { label: 'Date Added', value: new Date(guard.createdAt).toLocaleDateString() },
                  { label: 'Last Updated', value: new Date(guard.updatedAt).toLocaleDateString() },
                ].map(({ label, value }) => (
                  <Col md={6} key={label}>
                    <div className="text-muted small">{label}</div>
                    <div className="fw-medium">{value}</div>
                  </Col>
                ))}

                <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
                  <Col md={6}>
                    <div className="text-muted small">Bank Name</div>
                    <div className="fw-medium">{guard.bankName ?? '—'}</div>
                  </Col>
                </RoleGuard>

                <RoleGuard allowedRoles={[ROLES.DIRECTOR]}>
                  <Col md={6}>
                    <div className="text-muted small">Account Number</div>
                    <div className="fw-medium font-monospace">{guard.accountNumber ?? '—'}</div>
                  </Col>
                </RoleGuard>
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
          {(guard as { documents?: { id: string; documentType: string; filePath: string; version: number; uploadedAt: string; uploader: { name: string } }[] }).documents?.length === 0 ? (
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
                {(guard as { documents?: { id: string; documentType: string; filePath: string; version: number; uploadedAt: string; uploader: { name: string } }[] }).documents?.map((doc) => (
                  <tr key={doc.id}>
                    <td><Badge bg="secondary">{doc.documentType.replace(/_/g, ' ')}</Badge></td>
                    <td>v{doc.version}</td>
                    <td>{doc.uploader?.name}</td>
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

        {/* ── Tab 4: Disciplinary Records ───────────────────────────────────── */}
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
          onClose={() => { setShowDeductionModal(false); refetchDeductions(); }}
        />
      )}
    </div>
  );
}
