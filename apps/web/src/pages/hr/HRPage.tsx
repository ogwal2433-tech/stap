import React, { useState, useRef } from 'react';
import {
  Alert, Badge, Button, Col, Form, ListGroup, Modal, Offcanvas,
  ProgressBar, Row, Spinner, Tab, Table, Tabs,
} from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import RoleGuard from '../../components/RoleGuard';
import {
  ROLES, HR_ROLES, INTERNAL_ROLES, APPLICANT_STAGES, LETTER_TYPES, type UserRole,
  TRAINING_TARGET_GROUPS, FACILITATOR_TYPES, targetGroupLabel,
  GUARDS_TARGET_GROUP, STAFF_TARGET_GROUP,
  INTERNAL_FACILITATOR, EXTERNAL_FACILITATOR, getJobTitleLabel,
  LEAVE_TYPES, LEAVE_APPLICANT_TYPES, GUARD_APPLICANT, STAFF_APPLICANT,
  leaveTypeLabel,
} from '@stap/shared';
import type {
  ApplicantResponse, TrainingSessionResponse, LeaveRequestResponse, LetterTemplateResponse,
} from '@stap/shared';
import {
  useApplicants, useApplicant, usePipelineSummary,
  useCreateApplicant, useUpdateApplicantStage, useConvertToGuard,
  useVerifyDocuments, useUpdateVettingRequirements,
  useUploadApplicationLetter, useUploadVettingForm,
  useFacilitators, useTrainingSessions, useCreateTrainingSession, useRecordTrainingResults,
  useLeaveRequests, useRequestLeave, useApproveLeave,
  useLetterTemplates, useSaveLetterTemplate, usePreviewTemplate,
} from '../../hooks/useHR';
import { useGuardList } from '../../hooks/useGuards';

// ── Constants ──────────────────────────────────────────────────────────────────

const HR_VIEW_ROLES: UserRole[] = [...HR_ROLES, ROLES.TRAINER, ROLES.OPERATIONS_SUPERVISOR, ROLES.HR];

const STAGE_COLORS: Record<string, string> = {
  APPLICATION_RECEIVED:  '#f8f9fa',
  SCREENING:             '#d0e4f7',
  INTERVIEW_SCHEDULED:   '#fff3cd',
  INTERVIEW_DONE:        '#d1ecf1',
  OFFER_MADE:            '#ffe5cc',
  ACCEPTED:              '#d4edda',
  REJECTED:              '#f8d7da',
  ONBOARDING:            '#e2d9f3',
};

const STAGE_LABELS: Record<string, string> = {
  APPLICATION_RECEIVED:  'Received',
  SCREENING:             'Screening',
  INTERVIEW_SCHEDULED:   'Interview Scheduled',
  INTERVIEW_DONE:        'Interview Done',
  OFFER_MADE:            'Offer Made',
  ACCEPTED:              'Accepted',
  REJECTED:              'Rejected',
  ONBOARDING:            'Onboarding',
};

const NEXT_STAGE: Record<string, string | null> = {
  APPLICATION_RECEIVED:  'SCREENING',
  SCREENING:             'INTERVIEW_SCHEDULED',
  INTERVIEW_SCHEDULED:   'INTERVIEW_DONE',
  INTERVIEW_DONE:        'OFFER_MADE',
  OFFER_MADE:            'ACCEPTED',
  ACCEPTED:              'ONBOARDING',
  ONBOARDING:            null,
  REJECTED:              null,
};

const LEAVE_TYPE_BADGES: Record<string, string> = {
  ANNUAL:    'success',
  SICK:      'warning',
  EMERGENCY: 'danger',
  MATERNITY: 'info',
  PATERNITY: 'info',
};

const STATUS_BADGES: Record<string, string> = {
  PENDING:   'warning',
  APPROVED:  'success',
  REJECTED:  'danger',
  SCHEDULED: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'secondary',
};

const LETTER_TYPE_LABELS: Record<string, string> = {
  WARNING:               'Warning Letter',
  SUSPENSION:            'Suspension Letter',
  TERMINATION_NOTICE:    'Termination Notice',
  REINSTATEMENT:         'Reinstatement Letter',
  COMMITMENT_AGREEMENT:  'Commitment Agreement',
  CLEARANCE_FORM:        'Clearance Form',
  SICK_LEAVE:            'Sick Leave Approval',
  RESIGNATION_ACCEPTANCE: 'Resignation Acceptance',
  EXPULSION:             'Expulsion Letter',
};

const SAMPLE_DATA: Record<string, string> = {
  guard_name:      'David Ochieng',
  national_id:     'CM90123456JXKL',
  date:            new Date().toLocaleDateString('en-UG'),
  reason:          'Repeated tardiness and failure to report on time',
  outcome:         'Formal warning issued; probationary monitoring for 30 days',
  director_name:   'Taraka Joel',
  salary:          '650,000',
  contract_start:  '01/01/2026',
  contract_end:    '31/12/2026',
  ref_number:      'STAP/HR/2026/001',
  company_name:    'STAP Security Ltd',
  company_address: 'Kampala, Uganda',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function ApplicantFormModal({
  show,
  onHide,
}: {
  show: boolean;
  onHide: () => void;
}) {
  const { showToast } = useToast();
  const create = useCreateApplicant();
  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', email: '', source: 'WALK_IN' as 'WALK_IN' | 'REFERRAL' | 'ADVERT' | 'OTHER',
    nationalId: '', address: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { ...form, email: form.email || undefined, nationalId: form.nationalId || undefined, address: form.address || undefined },
      {
        onSuccess: () => { showToast('Applicant added', 'success'); onHide(); },
        onError: (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
      },
    );
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton><Modal.Title>Add Applicant</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Row className="mb-2">
            <Col>
              <Form.Label className="small fw-medium">First Name *</Form.Label>
              <Form.Control size="sm" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required />
            </Col>
            <Col>
              <Form.Label className="small fw-medium">Last Name *</Form.Label>
              <Form.Control size="sm" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required />
            </Col>
          </Row>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Phone *</Form.Label>
            <Form.Control size="sm" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Email</Form.Label>
            <Form.Control size="sm" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">National ID</Form.Label>
            <Form.Control size="sm" value={form.nationalId} onChange={e => setForm(f => ({ ...f, nationalId: e.target.value }))} />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Source</Form.Label>
            <Form.Select size="sm" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value as 'WALK_IN' | 'REFERRAL' | 'ADVERT' | 'OTHER' }))}>
              <option value="WALK_IN">Walk-in</option>
              <option value="REFERRAL">Referral</option>
              <option value="ADVERT">Advertisement</option>
              <option value="OTHER">Other</option>
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Address</Form.Label>
            <Form.Control size="sm" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </Form.Group>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
            <Button type="submit" size="sm" disabled={create.isPending}>
              {create.isPending ? <Spinner size="sm" /> : 'Add Applicant'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

function StageUpdateModal({
  applicant,
  onHide,
}: {
  applicant: ApplicantResponse | null;
  onHide: () => void;
}) {
  const { showToast } = useToast();
  const update = useUpdateApplicantStage();
  const nextStage = applicant ? NEXT_STAGE[applicant.stage] : null;
  const [form, setForm] = useState({ stage: '', interviewDate: '', interviewNotes: '', offerSalary: '', rejectionReason: '' });

  if (!applicant) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: any = { stage: form.stage || nextStage };
    if (form.interviewDate) payload.interviewDate = new Date(form.interviewDate).toISOString();
    if (form.interviewNotes) payload.interviewNotes = form.interviewNotes;
    if (form.offerSalary) payload.offerSalary = Number(form.offerSalary);
    if (form.rejectionReason) payload.rejectionReason = form.rejectionReason;

    update.mutate(
      { id: applicant.id, data: payload },
      {
        onSuccess: () => { showToast('Stage updated', 'success'); onHide(); },
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
      },
    );
  };

  const selectedStage = form.stage || nextStage || '';

  return (
    <Modal show={!!applicant} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Update Stage — {applicant.fullName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">New Stage</Form.Label>
            <Form.Select size="sm" value={selectedStage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
              {APPLICANT_STAGES.filter(s => {
                if (s === 'REJECTED') return true;
                const fromIdx = APPLICANT_STAGES.indexOf(applicant.stage as any);
                const toIdx = APPLICANT_STAGES.indexOf(s as any);
                return toIdx > fromIdx;
              }).map(s => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </Form.Select>
          </Form.Group>
          {selectedStage === 'INTERVIEW_SCHEDULED' && (
            <>
              <Form.Group className="mb-2">
                <Form.Label className="small fw-medium">Interview Date</Form.Label>
                <Form.Control size="sm" type="datetime-local" value={form.interviewDate} onChange={e => setForm(f => ({ ...f, interviewDate: e.target.value }))} />
              </Form.Group>
            </>
          )}
          {selectedStage === 'INTERVIEW_DONE' && (
            <Form.Group className="mb-2">
              <Form.Label className="small fw-medium">Interview Notes</Form.Label>
              <Form.Control as="textarea" rows={3} size="sm" value={form.interviewNotes} onChange={e => setForm(f => ({ ...f, interviewNotes: e.target.value }))} />
            </Form.Group>
          )}
          {selectedStage === 'OFFER_MADE' && (
            <Form.Group className="mb-2">
              <Form.Label className="small fw-medium">Offer Salary (UGX)</Form.Label>
              <Form.Control size="sm" type="number" value={form.offerSalary} onChange={e => setForm(f => ({ ...f, offerSalary: e.target.value }))} />
            </Form.Group>
          )}
          {selectedStage === 'REJECTED' && (
            <Form.Group className="mb-2">
              <Form.Label className="small fw-medium">Rejection Reason *</Form.Label>
              <Form.Control as="textarea" rows={3} size="sm" value={form.rejectionReason} onChange={e => setForm(f => ({ ...f, rejectionReason: e.target.value }))} required />
            </Form.Group>
          )}
          <div className="d-flex justify-content-end gap-2 mt-3">
            <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
            <Button type="submit" size="sm" disabled={update.isPending}>
              {update.isPending ? <Spinner size="sm" /> : 'Update Stage'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

function TrainingSessionModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  const { showToast } = useToast();
  const create = useCreateTrainingSession();
  const { data: guardsData } = useGuardList({ page: 1, limit: 200, status: 'ACTIVE' });
  const { data: facilitatorsData, isLoading: loadingStaff } = useFacilitators();
  const guards = guardsData?.data ?? [];
  // The same list serves both the facilitator dropdown and, for a staff
  // session, the attendee picker — they are the same people.
  const staff  = facilitatorsData  ?? [];

  const [form, setForm] = useState({
    title: '', location: '', scheduledAt: '',
    durationHours: '1', passMark: '70', description: '',
    targetGroup:       GUARDS_TARGET_GROUP as string,
    facilitatorType:   INTERNAL_FACILITATOR as string,
    facilitatorUserId: '',
    facilitatorName:   '',
    guardIds: [] as string[],
    staffIds: [] as string[],
  });

  const forStaff = form.targetGroup === STAFF_TARGET_GROUP;
  const attendeeCount = forStaff ? form.staffIds.length : form.guardIds.length;

  const toggle = (key: 'guardIds' | 'staffIds', id: string) => {
    setForm(f => ({
      ...f,
      [key]: f[key].includes(id) ? f[key].filter(x => x !== id) : [...f[key], id],
    }));
  };

  /** Switching who the session is for drops attendees of the other kind. */
  const chooseTargetGroup = (value: string) =>
    setForm(f => ({ ...f, targetGroup: value, guardIds: [], staffIds: [] }));

  const chooseFacilitatorType = (value: string) =>
    setForm(f => ({ ...f, facilitatorType: value, facilitatorUserId: '', facilitatorName: '' }));

  const staffLabel = (u: { name: string; role: string; jobTitle: string | null }) =>
    `${u.name} — ${u.jobTitle ? getJobTitleLabel(u.jobTitle) : u.role.replace(/_/g, ' ')}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        title:         form.title,
        description:   form.description,
        location:      form.location,
        scheduledAt:   new Date(form.scheduledAt).toISOString(),
        durationHours: Number(form.durationHours),
        passMark:      Number(form.passMark),
        targetGroup:   form.targetGroup as never,
        facilitatorType: form.facilitatorType as never,
        // Only the relevant half is sent. Sending both would be rejected by the
        // API, which refuses attendees that do not match the target group
        // rather than quietly dropping them.
        facilitatorUserId: form.facilitatorType === INTERNAL_FACILITATOR
          ? form.facilitatorUserId
          : null,
        facilitatorName: form.facilitatorType === EXTERNAL_FACILITATOR
          ? form.facilitatorName.trim()
          : undefined,
        guardIds: forStaff ? [] : form.guardIds,
        staffIds: forStaff ? form.staffIds : [],
      },
      {
        onSuccess: () => { showToast('Training session scheduled', 'success'); onHide(); },
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
      },
    );
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg">
      <Modal.Header closeButton><Modal.Title>Schedule Training Session</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          {/* Asked first: it decides which attendee list the rest of the form shows. */}
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Training for *</Form.Label>
            <div className="d-flex gap-2">
              {TRAINING_TARGET_GROUPS.map(g => {
                const active = form.targetGroup === g.value;
                return (
                  <div
                    key={g.value}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    onClick={() => chooseTargetGroup(g.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        chooseTargetGroup(g.value);
                      }
                    }}
                    style={{
                      flex:         1,
                      padding:      '10px 12px',
                      border:       `2px solid ${active ? '#1B3A6B' : '#e9ecef'}`,
                      borderRadius: '0.5rem',
                      cursor:       'pointer',
                      background:   active ? '#EBF5FB' : 'white',
                    }}
                  >
                    <div
                      className="fw-bold"
                      style={{ fontSize: '0.84rem', color: active ? '#1B3A6B' : '#4A5568' }}
                    >
                      {g.label}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#6c757d' }}>{g.description}</div>
                  </div>
                );
              })}
            </div>
          </Form.Group>

          <Row className="mb-2">
            <Col md={8}>
              <Form.Label className="small fw-medium">Title *</Form.Label>
              <Form.Control size="sm" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
            </Col>
            <Col md={4}>
              <Form.Label className="small fw-medium">Duration (hrs)</Form.Label>
              <Form.Control size="sm" type="number" min="0.5" step="0.5" value={form.durationHours} onChange={e => setForm(f => ({ ...f, durationHours: e.target.value }))} />
            </Col>
          </Row>
          <Row className="mb-2">
            <Col md={6}>
              <Form.Label className="small fw-medium">Date & Time *</Form.Label>
              <Form.Control size="sm" type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} required />
            </Col>
            <Col md={6}>
              <Form.Label className="small fw-medium">Location</Form.Label>
              <Form.Control size="sm" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </Col>
          </Row>
          <Row className="mb-2">
            <Col md={6}>
              <Form.Label className="small fw-medium">Facilitator / Modulator *</Form.Label>
              <div className="d-flex gap-1 mb-2">
                {FACILITATOR_TYPES.map(t => {
                  const active = form.facilitatorType === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => chooseFacilitatorType(t.value)}
                      style={{
                        padding:      '3px 10px',
                        borderRadius: '20px',
                        border:       `1px solid ${active ? '#1B3A6B' : '#ced4da'}`,
                        background:   active ? '#1B3A6B' : 'white',
                        color:        active ? 'white' : '#4A5568',
                        fontSize:     '0.72rem',
                        fontWeight:   active ? 600 : 400,
                        cursor:       'pointer',
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
              {form.facilitatorType === INTERNAL_FACILITATOR ? (
                <Form.Select
                  size="sm"
                  value={form.facilitatorUserId}
                  onChange={e => setForm(f => ({ ...f, facilitatorUserId: e.target.value }))}
                  required
                  disabled={loadingStaff}
                >
                  <option value="">{loadingStaff ? 'Loading staff…' : 'Select facilitator…'}</option>
                  {staff.map(u => <option key={u.id} value={u.id}>{staffLabel(u)}</option>)}
                </Form.Select>
              ) : (
                <Form.Control
                  size="sm"
                  value={form.facilitatorName}
                  onChange={e => setForm(f => ({ ...f, facilitatorName: e.target.value }))}
                  placeholder="Name of the guest facilitator"
                  required
                />
              )}
            </Col>
            <Col md={6}>
              <Form.Label className="small fw-medium">Pass Mark (%)</Form.Label>
              <Form.Control size="sm" type="number" min="0" max="100" value={form.passMark} onChange={e => setForm(f => ({ ...f, passMark: e.target.value }))} />
            </Col>
          </Row>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Description</Form.Label>
            <Form.Control as="textarea" rows={2} size="sm" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">
              {forStaff ? 'Select staff' : 'Select guards'} * ({attendeeCount} selected)
            </Form.Label>
            <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: 4, padding: 8 }}>
              {forStaff ? (
                staff.length === 0 ? (
                  <div className="text-muted small text-center py-2">
                    {loadingStaff ? 'Loading staff…' : 'No active staff members found'}
                  </div>
                ) : (
                  staff.map(u => (
                    <Form.Check
                      key={u.id}
                      type="checkbox"
                      id={`staff-${u.id}`}
                      label={staffLabel(u)}
                      checked={form.staffIds.includes(u.id)}
                      onChange={() => toggle('staffIds', u.id)}
                      className="small"
                    />
                  ))
                )
              ) : (
                guards.map(g => (
                  <Form.Check
                    key={g.id}
                    type="checkbox"
                    id={`guard-${g.id}`}
                    label={`${g.firstName} ${g.lastName}`}
                    checked={form.guardIds.includes(g.id)}
                    onChange={() => toggle('guardIds', g.id)}
                    className="small"
                  />
                ))
              )}
            </div>
          </Form.Group>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
            <Button type="submit" size="sm" disabled={create.isPending || attendeeCount === 0}>
              {create.isPending ? <Spinner size="sm" /> : 'Schedule Training'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

function RecordResultsModal({
  session,
  onHide,
}: {
  session: TrainingSessionResponse | null;
  onHide: () => void;
}) {
  const { showToast } = useToast();
  const record = useRecordTrainingResults();
  const [results, setResults] = useState<Record<string, { attended: boolean; score: string; notes: string }>>({});

  React.useEffect(() => {
    if (session) {
      const init: typeof results = {};
      // Keyed on the attendee row, not the guard: a staff attendee has no
      // guard, and this used to key on one and throw.
      session.attendees.forEach(a => {
        init[a.id] = { attended: false, score: '', notes: '' };
      });
      setResults(init);
    }
  }, [session]);

  if (!session) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = session.attendees.map(a => ({
      // Exactly one of these, matching the kind of attendee.
      ...(a.guard ? { guardId: a.guard.id } : { userId: a.staff!.id }),
      attended: results[a.id]?.attended ?? false,
      score:    results[a.id]?.score ? Number(results[a.id].score) : undefined,
      notes:    results[a.id]?.notes || undefined,
    }));
    record.mutate(
      { id: session.id, data: { results: payload } },
      {
        onSuccess: () => { showToast('Results recorded', 'success'); onHide(); },
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
      },
    );
  };

  return (
    <Modal show={!!session} onHide={onHide} centered size="lg">
      <Modal.Header closeButton><Modal.Title>Record Results — {session.title}</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Table size="sm" hover>
            <thead className="table-light">
              <tr>
                <th>{session.targetGroup === STAFF_TARGET_GROUP ? 'Staff member' : 'Guard'}</th>
                <th className="text-center">Attended</th>
                <th>Score (%)</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {session.attendees.map(a => (
                <tr key={a.id}>
                  <td className="fw-medium small">
                    {a.guard?.fullName ?? a.staff?.name ?? '—'}
                    {a.staff && (
                      <div className="text-muted" style={{ fontSize: '0.68rem' }}>
                        {a.staff.jobTitle
                          ? getJobTitleLabel(a.staff.jobTitle)
                          : a.staff.role.replace(/_/g, ' ')}
                      </div>
                    )}
                  </td>
                  <td className="text-center">
                    <Form.Check
                      checked={results[a.id]?.attended ?? false}
                      onChange={e => setResults(r => ({ ...r, [a.id]: { ...r[a.id], attended: e.target.checked } }))}
                    />
                  </td>
                  <td>
                    <Form.Control
                      size="sm"
                      type="number"
                      min="0"
                      max="100"
                      value={results[a.id]?.score ?? ''}
                      onChange={e => setResults(r => ({ ...r, [a.id]: { ...r[a.id], score: e.target.value } }))}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td>
                    <Form.Control
                      size="sm"
                      value={results[a.id]?.notes ?? ''}
                      onChange={e => setResults(r => ({ ...r, [a.id]: { ...r[a.id], notes: e.target.value } }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
            <Button type="submit" size="sm" disabled={record.isPending}>
              {record.isPending ? <Spinner size="sm" /> : 'Save Results'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

function LeaveRequestModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  const { showToast } = useToast();
  const request = useRequestLeave();
  const { data: guardsData, isLoading: guardsLoading, isError: guardsError, refetch: refetchGuards } = useGuardList({ page: 1, limit: 200, status: 'ACTIVE' });
  const guards = guardsData?.data ?? [];
  // The facilitator lookup is every active member of staff, which is exactly
  // who can take office leave.
  const { data: staffData, isLoading: staffLoading } = useFacilitators();
  const staff = staffData ?? [];

  const [form, setForm] = useState({
    applicantType: GUARD_APPLICANT as string,
    guardId: '', userId: '',
    type: 'ANNUAL', startDate: '', endDate: '', reason: '',
  });

  const forStaff = form.applicantType === STAFF_APPLICANT;
  const subjectChosen = forStaff ? !!form.userId : !!form.guardId;

  /** Switching who the request is for drops the other subject. */
  const chooseApplicantType = (value: string) =>
    setForm(f => ({ ...f, applicantType: value, guardId: '', userId: '' }));

  /**
   * Working days, matching the server, which does not count Sundays against
   * leave. A calendar-day figure here would disagree with the days that end up
   * recorded, which is worse than showing nothing.
   */
  const workingDays = (() => {
    if (!form.startDate || !form.endDate) return null;
    const start = new Date(form.startDate);
    const end   = new Date(form.endDate);
    if (Number.isNaN(+start) || Number.isNaN(+end) || end < start) return null;
    let count = 0;
    for (const cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
      if (cur.getDay() !== 0) count++;
    }
    return count;
  })();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    request.mutate(
      {
        // Exactly one, which the API also enforces.
        guardId:   forStaff ? null : form.guardId,
        userId:    forStaff ? form.userId : null,
        type:      form.type as any,
        startDate: new Date(form.startDate).toISOString(),
        endDate:   new Date(form.endDate).toISOString(),
        reason:    form.reason,
      },
      {
        onSuccess: () => { showToast('Leave request submitted', 'success'); onHide(); },
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
      },
    );
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton><Modal.Title>Request Leave</Modal.Title></Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Leave for *</Form.Label>
            <div className="d-flex gap-2">
              {LEAVE_APPLICANT_TYPES.map(t => {
                const active = form.applicantType === t.value;
                return (
                  <div
                    key={t.value}
                    role="button"
                    tabIndex={0}
                    aria-pressed={active}
                    onClick={() => chooseApplicantType(t.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        chooseApplicantType(t.value);
                      }
                    }}
                    style={{
                      flex:         1,
                      padding:      '9px 12px',
                      border:       `2px solid ${active ? '#1B3A6B' : '#e9ecef'}`,
                      borderRadius: '0.5rem',
                      cursor:       'pointer',
                      background:   active ? '#EBF5FB' : 'white',
                    }}
                  >
                    <div
                      className="fw-bold"
                      style={{ fontSize: '0.82rem', color: active ? '#1B3A6B' : '#4A5568' }}
                    >
                      {t.label}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#6c757d' }}>{t.description}</div>
                  </div>
                );
              })}
            </div>
          </Form.Group>

          {forStaff ? (
            <Form.Group className="mb-2">
              <Form.Label className="small fw-medium">Staff member *</Form.Label>
              <Form.Select
                size="sm"
                value={form.userId}
                onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}
                required
                disabled={staffLoading}
              >
                <option value="">
                  {staffLoading ? 'Loading staff…' : staff.length === 0 ? 'No active staff found' : 'Select staff member…'}
                </option>
                {staff.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {u.jobTitle ? getJobTitleLabel(u.jobTitle) : u.role.replace(/_/g, ' ')}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          ) : (
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Guard *</Form.Label>
            {guardsError ? (
              <Alert variant="danger" className="small py-1 px-2 mb-0 d-flex align-items-center justify-content-between">
                Failed to load guards.
                <Button size="sm" variant="link" className="p-0 ms-2" onClick={() => refetchGuards()}>Retry</Button>
              </Alert>
            ) : (
              <Form.Select size="sm" value={form.guardId} onChange={e => setForm(f => ({ ...f, guardId: e.target.value }))} required disabled={guardsLoading}>
                {guardsLoading ? (
                  <option value="">Loading guards…</option>
                ) : guards.length === 0 ? (
                  <option value="">No active guards found</option>
                ) : (
                  <>
                    <option value="">Select guard…</option>
                    {guards.map(g => <option key={g.id} value={g.id}>{g.firstName} {g.lastName}</option>)}
                  </>
                )}
              </Form.Select>
            )}
          </Form.Group>
          )}
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Leave Type *</Form.Label>
            <Form.Select size="sm" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {LEAVE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Form.Select>
          </Form.Group>
          <Row className="mb-2">
            <Col>
              <Form.Label className="small fw-medium">Start Date *</Form.Label>
              <Form.Control size="sm" type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} required />
            </Col>
            <Col>
              <Form.Label className="small fw-medium">End Date *</Form.Label>
              <Form.Control size="sm" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} required />
            </Col>
          </Row>
          {workingDays !== null && (
            <div
              style={{
                background:   '#EBF5FB',
                borderRadius: '0.375rem',
                padding:      '7px 11px',
                fontSize:     '0.76rem',
                color:        '#1B3A6B',
                fontWeight:   600,
                marginBottom: '12px',
              }}
            >
              {workingDays} working day{workingDays === 1 ? '' : 's'}
              <span className="fw-normal text-muted ms-1" style={{ fontSize: '0.7rem' }}>
                (Sundays not counted)
              </span>
            </div>
          )}
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Reason *</Form.Label>
            <Form.Control as="textarea" rows={3} size="sm" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} required minLength={10} />
          </Form.Group>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
            <Button type="submit" size="sm" disabled={request.isPending || !subjectChosen}>
              {request.isPending ? <Spinner size="sm" /> : 'Submit Request'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

function TemplateEditorModal({
  template,
  onHide,
}: {
  template: LetterTemplateResponse | null;
  onHide: () => void;
}) {
  const { showToast } = useToast();
  const save    = useSaveLetterTemplate();
  const preview = usePreviewTemplate();
  const [name, setName]       = useState('');
  const [content, setContent] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  React.useEffect(() => {
    if (template) {
      setName(template.name);
      setContent(template.content);
    }
  }, [template]);

  if (!template) return null;

  const handleSave = () => {
    save.mutate(
      { letterType: template.letterType, data: { name, content } },
      {
        onSuccess: () => { showToast('Template saved', 'success'); onHide(); },
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
      },
    );
  };

  const handlePreview = () => {
    preview.mutate(
      { letterType: template.letterType, sampleData: SAMPLE_DATA },
      {
        onSuccess: (html) => { setPreviewHtml(html); setShowPreview(true); },
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Preview failed', 'danger'),
      },
    );
  };

  return (
    <>
      <Modal show={!!template} onHide={onHide} size="xl" fullscreen="lg-down">
        <Modal.Header closeButton>
          <Modal.Title>Edit Template: {LETTER_TYPE_LABELS[template.letterType]}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label className="small fw-medium">Template Name</Form.Label>
            <Form.Control size="sm" value={name} onChange={e => setName(e.target.value)} />
          </Form.Group>
          <Alert variant="info" className="small py-2">
            <strong>Available placeholders:</strong>{' '}
            {['{guard_name}', '{national_id}', '{date}', '{reason}', '{outcome}', '{director_name}',
              '{salary}', '{contract_start}', '{contract_end}', '{ref_number}', '{company_name}', '{company_address}']
              .map(p => <code key={p} className="me-1">{p}</code>)}
          </Alert>
          <Form.Group>
            <Form.Label className="small fw-medium">HTML Content</Form.Label>
            <Form.Control
              as="textarea"
              rows={20}
              value={content}
              onChange={e => setContent(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
            <Form.Text className="text-muted small">
              Use standard HTML. Placeholders in {'{curly_braces}'} will be replaced automatically.
            </Form.Text>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={onHide}>Cancel</Button>
          <Button variant="outline-info" size="sm" onClick={handlePreview} disabled={preview.isPending}>
            {preview.isPending ? <Spinner size="sm" /> : 'Preview'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={save.isPending}>
            {save.isPending ? <Spinner size="sm" /> : 'Save Template'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showPreview} onHide={() => setShowPreview(false)} size="xl">
        <Modal.Header closeButton><Modal.Title>Template Preview</Modal.Title></Modal.Header>
        <Modal.Body>
          <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </Modal.Body>
      </Modal>
    </>
  );
}

// ── Applicant Detail Panel ────────────────────────────────────────────────────

function ConvertToGuardModal({
  applicant,
  onHide,
}: {
  applicant: ApplicantResponse | null;
  onHide: () => void;
}) {
  const { showToast } = useToast();
  const convert = useConvertToGuard();
  const [form, setForm] = useState({
    firstName: '', lastName: '', nationalId: '', phone: '',
    dateOfBirth: '', nextOfKinName: '', nextOfKinPhone: '',
    salaryRate: '', contractStart: '',
  });

  React.useEffect(() => {
    if (applicant) {
      setForm(f => ({
        ...f,
        firstName: applicant.firstName,
        lastName:  applicant.lastName,
        phone:     applicant.phone,
      }));
    }
  }, [applicant]);

  if (!applicant) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    convert.mutate(
      {
        id:   applicant.id,
        data: {
          ...form,
          salaryRate:    Number(form.salaryRate),
          dateOfBirth:   form.dateOfBirth ? new Date(form.dateOfBirth).toISOString() : undefined as any,
          contractStart: new Date(form.contractStart).toISOString(),
        },
      },
      {
        onSuccess: () => {
          showToast('Guard created. Uniform issued automatically. Shoe deduction of UGX 30,000 created.', 'success');
          onHide();
        },
        onError: (err: any) => showToast(err?.response?.data?.error || 'Conversion failed', 'danger'),
      },
    );
  };

  return (
    <Modal show={!!applicant} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Convert to Guard — {applicant.fullName}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Row className="mb-2">
            <Col>
              <Form.Label className="small fw-medium">First Name *</Form.Label>
              <Form.Control size="sm" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} required />
            </Col>
            <Col>
              <Form.Label className="small fw-medium">Last Name *</Form.Label>
              <Form.Control size="sm" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} required />
            </Col>
          </Row>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">National ID *</Form.Label>
            <Form.Control size="sm" value={form.nationalId} onChange={e => setForm(f => ({ ...f, nationalId: e.target.value }))} required />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Phone *</Form.Label>
            <Form.Control size="sm" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
          </Form.Group>
          <Form.Group className="mb-2">
            <Form.Label className="small fw-medium">Date of Birth *</Form.Label>
            <Form.Control size="sm" type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} required />
          </Form.Group>
          <Row className="mb-2">
            <Col>
              <Form.Label className="small fw-medium">Next of Kin Name *</Form.Label>
              <Form.Control size="sm" value={form.nextOfKinName} onChange={e => setForm(f => ({ ...f, nextOfKinName: e.target.value }))} required />
            </Col>
            <Col>
              <Form.Label className="small fw-medium">Next of Kin Phone *</Form.Label>
              <Form.Control size="sm" value={form.nextOfKinPhone} onChange={e => setForm(f => ({ ...f, nextOfKinPhone: e.target.value }))} required />
            </Col>
          </Row>
          <Row className="mb-3">
            <Col>
              <Form.Label className="small fw-medium">Salary (UGX) *</Form.Label>
              <Form.Control size="sm" type="number" value={form.salaryRate} onChange={e => setForm(f => ({ ...f, salaryRate: e.target.value }))} required />
            </Col>
            <Col>
              <Form.Label className="small fw-medium">Contract Start *</Form.Label>
              <Form.Control size="sm" type="date" value={form.contractStart} onChange={e => setForm(f => ({ ...f, contractStart: e.target.value }))} required />
            </Col>
          </Row>
          <Alert variant="info" className="small py-2 mb-3">
            Uniform will be issued automatically and a UGX 30,000 shoe deduction will be created on the guard's first payroll.
          </Alert>
          <div className="d-flex justify-content-end gap-2">
            <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
            <Button type="submit" size="sm" variant="success" disabled={convert.isPending}>
              {convert.isPending ? <Spinner size="sm" /> : 'Convert to Guard'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

function ApplicantDetailPanel({
  applicantId,
  onHide,
}: {
  applicantId: string | null;
  onHide: () => void;
}) {
  const { showToast } = useToast();
  const { data: applicant, isLoading } = useApplicant(applicantId ?? '');
  const verifyDocs     = useVerifyDocuments();
  const updateVetting  = useUpdateVettingRequirements();
  const uploadLetter   = useUploadApplicationLetter();
  const uploadVetting  = useUploadVettingForm();
  const updateStage    = useUpdateApplicantStage();
  const letterRef      = useRef<HTMLInputElement>(null);
  const vettingRef     = useRef<HTMLInputElement>(null);
  const [showConvert, setShowConvert] = useState(false);
  const [contractDate, setContractDate] = useState('');

  if (!applicantId) return null;

  const a = applicant;

  const toggleDoc = (field: 'relativesIdVerified' | 'nationalIdVerified' | 'academicDocsVerified', current: boolean) => {
    if (!a) return;
    verifyDocs.mutate(
      {
        id:   a.id,
        data: {
          relativesIdVerified:  field === 'relativesIdVerified'  ? !current : a.relativesIdVerified,
          nationalIdVerified:   field === 'nationalIdVerified'   ? !current : a.nationalIdVerified,
          academicDocsVerified: field === 'academicDocsVerified' ? !current : a.academicDocsVerified,
        },
      },
      { onError: (err: any) => showToast(err?.response?.data?.error || 'Update failed', 'danger') },
    );
  };

  const toggleVetting = (field: 'contractSigned', current: boolean) => {
    if (!a) return;
    updateVetting.mutate(
      {
        id:   a.id,
        data: {
          contractSigned:   !current,
          contractSignedAt: !current && contractDate ? new Date(contractDate).toISOString() : undefined,
        },
      },
      { onError: (err: any) => showToast(err?.response?.data?.error || 'Update failed', 'danger') },
    );
  };

  const handleLetterUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !a) return;
    uploadLetter.mutate(
      { id: a.id, file },
      {
        onSuccess: () => showToast('Application letter uploaded', 'success'),
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Upload failed', 'danger'),
      },
    );
  };

  const handleVettingUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !a) return;
    uploadVetting.mutate(
      { id: a.id, file },
      {
        onSuccess: () => showToast('Vetting form uploaded', 'success'),
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Upload failed', 'danger'),
      },
    );
  };

  const handleMoveToTraining = () => {
    if (!a) return;
    updateStage.mutate(
      { id: a.id, data: { stage: 'INTERVIEW_SCHEDULED' } },
      {
        onSuccess: () => showToast('Moved to training', 'success'),
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
      },
    );
  };

  const docCount   = a ? [a.relativesIdVerified, a.nationalIdVerified, a.academicDocsVerified].filter(Boolean).length : 0;
  const vettingCount = a ? [a.applicationLetterUploaded, a.contractSigned, a.vettingFormUploaded].filter(Boolean).length : 0;
  const pendingCount = 3 - docCount + 3 - vettingCount;

  return (
    <>
      <Offcanvas show={!!applicantId} onHide={onHide} placement="end" style={{ width: 480 }}>
        <Offcanvas.Header closeButton style={{ background: '#1B3A6B', color: '#fff' }}>
          <div>
            {isLoading ? (
              <Spinner size="sm" variant="light" />
            ) : a ? (
              <>
                <div className="fw-bold fs-5">{a.fullName}</div>
                <div className="d-flex gap-2 align-items-center mt-1">
                  <Badge bg="light" text="dark" style={{ fontSize: 11 }}>{a.source}</Badge>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                    {a.daysInPipeline} days in pipeline
                  </span>
                  <Badge bg={a.stage === 'REJECTED' ? 'danger' : 'warning'} text="dark" style={{ fontSize: 11 }}>
                    {STAGE_LABELS[a.stage] ?? a.stage}
                  </Badge>
                </div>
              </>
            ) : null}
          </div>
        </Offcanvas.Header>

        <Offcanvas.Body className="p-0">
          {isLoading ? (
            <div className="text-center py-5"><Spinner /></div>
          ) : !a ? (
            <Alert variant="danger" className="m-3">Failed to load applicant.</Alert>
          ) : (
            <Tabs defaultActiveKey="progress" className="px-3 pt-2">

              {/* ── TAB: Progress ──────────────────────────────────────────────── */}
              <Tab eventKey="progress" title="Progress" tabClassName="small">
                <div className="p-3">

                  {/* Document Verification */}
                  <div className="card border-0 shadow-sm mb-3">
                    <div className="card-header bg-white fw-semibold small py-2">
                      Document Verification
                    </div>
                    <div className="card-body py-2 px-3">
                      {[
                        {
                          field:   'relativesIdVerified' as const,
                          label:   'Relatives ID',
                          desc:    'Original ID of a close relative',
                          checked: a.relativesIdVerified,
                          date:    a.relativesIdVerifiedAt,
                        },
                        {
                          field:   'nationalIdVerified' as const,
                          label:   'National ID (Original)',
                          desc:    "Applicant's own original National ID card",
                          checked: a.nationalIdVerified,
                          date:    a.nationalIdVerifiedAt,
                        },
                        {
                          field:   'academicDocsVerified' as const,
                          label:   'Academic Documents',
                          desc:    'School certificates or transcripts',
                          checked: a.academicDocsVerified,
                          date:    a.academicDocsVerifiedAt,
                        },
                      ].map(row => (
                        <div key={row.field} className="d-flex justify-content-between align-items-start py-2 border-bottom">
                          <div>
                            <div className="small fw-medium d-flex align-items-center gap-1">
                              {row.checked
                                ? <span className="text-success">✓</span>
                                : <span className="text-muted">○</span>}
                              {row.label}
                            </div>
                            <div className="text-muted" style={{ fontSize: 11 }}>{row.desc}</div>
                            {row.checked && row.date && (
                              <div className="text-success" style={{ fontSize: 11 }}>
                                Verified {new Date(row.date).toLocaleDateString('en-UG')}
                              </div>
                            )}
                          </div>
                          <Form.Check
                            type="switch"
                            checked={row.checked}
                            onChange={() => toggleDoc(row.field, row.checked)}
                            disabled={verifyDocs.isPending}
                          />
                        </div>
                      ))}
                      <div className="mt-2">
                        <div className="d-flex justify-content-between small mb-1">
                          <span className="text-muted">Documents</span>
                          <span className={docCount === 3 ? 'text-success fw-medium' : 'text-muted'}>
                            {docCount} of 3 verified
                          </span>
                        </div>
                        <ProgressBar
                          now={(docCount / 3) * 100}
                          variant={docCount === 3 ? 'success' : 'primary'}
                          style={{ height: 6 }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Vetting Requirements */}
                  <div className="card border-0 shadow-sm mb-3">
                    <div className="card-header bg-white fw-semibold small py-2">
                      Vetting Requirements
                    </div>
                    <div className="card-body py-2 px-3">

                      {/* Application Letter */}
                      <div className="d-flex justify-content-between align-items-start py-2 border-bottom">
                        <div>
                          <div className="small fw-medium d-flex align-items-center gap-1">
                            {a.applicationLetterUploaded
                              ? <span className="text-success">✓</span>
                              : <span className="text-muted">○</span>}
                            Application Letter
                          </div>
                          {a.applicationLetterUploaded ? (
                            <div className="text-success" style={{ fontSize: 11 }}>Uploaded</div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              style={{ fontSize: 11, padding: '1px 8px', marginTop: 4 }}
                              onClick={() => letterRef.current?.click()}
                              disabled={uploadLetter.isPending}
                            >
                              {uploadLetter.isPending ? <Spinner size="sm" /> : 'Upload'}
                            </Button>
                          )}
                          <input ref={letterRef} type="file" accept=".pdf,.doc,.docx" className="d-none" onChange={handleLetterUpload} />
                        </div>
                        <Form.Check type="switch" checked={a.applicationLetterUploaded} readOnly disabled />
                      </div>

                      {/* Contract Signed */}
                      <div className="d-flex justify-content-between align-items-start py-2 border-bottom">
                        <div>
                          <div className="small fw-medium d-flex align-items-center gap-1">
                            {a.contractSigned
                              ? <span className="text-success">✓</span>
                              : <span className="text-muted">○</span>}
                            Contract Signed
                          </div>
                          {!a.contractSigned && (
                            <Form.Control
                              type="date"
                              size="sm"
                              value={contractDate}
                              onChange={e => setContractDate(e.target.value)}
                              style={{ fontSize: 11, marginTop: 4, width: 140 }}
                            />
                          )}
                          {a.contractSigned && a.contractSignedAt && (
                            <div className="text-success" style={{ fontSize: 11 }}>
                              Signed {new Date(a.contractSignedAt).toLocaleDateString('en-UG')}
                            </div>
                          )}
                        </div>
                        <Form.Check
                          type="switch"
                          checked={a.contractSigned}
                          onChange={() => toggleVetting('contractSigned', a.contractSigned)}
                          disabled={updateVetting.isPending}
                        />
                      </div>

                      {/* Vetting Form */}
                      <div className="d-flex justify-content-between align-items-start py-2">
                        <div>
                          <div className="small fw-medium d-flex align-items-center gap-1">
                            {a.vettingFormUploaded
                              ? <span className="text-success">✓</span>
                              : <span className="text-muted">○</span>}
                            Vetting Form (Physical)
                          </div>
                          {a.vettingFormUploaded ? (
                            <div className="text-success" style={{ fontSize: 11 }}>Uploaded</div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              style={{ fontSize: 11, padding: '1px 8px', marginTop: 4 }}
                              onClick={() => vettingRef.current?.click()}
                              disabled={uploadVetting.isPending}
                            >
                              {uploadVetting.isPending ? <Spinner size="sm" /> : 'Upload scan'}
                            </Button>
                          )}
                          <input ref={vettingRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="d-none" onChange={handleVettingUpload} />
                        </div>
                        <Form.Check type="switch" checked={a.vettingFormUploaded} readOnly disabled />
                      </div>

                      <div className="mt-2">
                        <div className="d-flex justify-content-between small mb-1">
                          <span className="text-muted">Vetting</span>
                          <span className={vettingCount === 3 ? 'text-success fw-medium' : 'text-muted'}>
                            {vettingCount} of 3 complete
                          </span>
                        </div>
                        <ProgressBar
                          now={(vettingCount / 3) * 100}
                          variant={vettingCount === 3 ? 'success' : 'warning'}
                          style={{ height: 6 }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Readiness indicator */}
                  {a.allDocumentsVerified && a.allVettingComplete ? (
                    <Alert variant="success" className="small py-2 mb-3">
                      <div className="fw-semibold">Ready to start training</div>
                      <div>All requirements met.</div>
                      {!['INTERVIEW_SCHEDULED', 'INTERVIEW_DONE', 'OFFER_MADE', 'ACCEPTED', 'ONBOARDING'].includes(a.stage) && (
                        <RoleGuard allowedRoles={[...HR_ROLES, ROLES.HR] as UserRole[]}>
                          <Button
                            size="sm"
                            variant="success"
                            className="mt-2"
                            onClick={handleMoveToTraining}
                            disabled={updateStage.isPending}
                          >
                            {updateStage.isPending ? <Spinner size="sm" /> : 'Move to Training'}
                          </Button>
                        </RoleGuard>
                      )}
                    </Alert>
                  ) : (
                    <Alert variant="warning" className="small py-2 mb-3">
                      <strong>{pendingCount} requirement{pendingCount !== 1 ? 's' : ''} still pending</strong> before training can begin.
                    </Alert>
                  )}

                  {/* Convert to Guard */}
                  {a.stage === 'ACCEPTED' && (
                    <RoleGuard allowedRoles={HR_ROLES as UserRole[]}>
                      <div className="d-grid">
                        <Button variant="success" size="sm" onClick={() => setShowConvert(true)}>
                          Convert to Guard
                        </Button>
                      </div>
                    </RoleGuard>
                  )}
                </div>
              </Tab>

              {/* ── TAB: Details ───────────────────────────────────────────────── */}
              <Tab eventKey="details" title="Details" tabClassName="small">
                <div className="p-3">
                  <dl className="row small mb-0">
                    {[
                      ['Phone', a.phone],
                      ['Email', a.email ?? '—'],
                      ['National ID', (a as any).nationalId ?? '—'],
                      ['Date of Birth', (a as any).dateOfBirth ? new Date((a as any).dateOfBirth).toLocaleDateString('en-UG') : '—'],
                      ['Address', (a as any).address ?? '—'],
                      ['Source', a.source],
                      ['Stage', STAGE_LABELS[a.stage] ?? a.stage],
                      ['Interview Date', a.interviewDate ? new Date(a.interviewDate).toLocaleDateString('en-UG') : '—'],
                      ['Offer Salary', a.offerSalary ? `UGX ${a.offerSalary.toLocaleString()}` : '—'],
                      ['Assigned To', a.assignedTo?.name ?? '—'],
                      ['Added', new Date(a.createdAt).toLocaleDateString('en-UG')],
                    ].map(([label, value]) => (
                      <React.Fragment key={label as string}>
                        <dt className="col-5 fw-medium text-muted">{label}</dt>
                        <dd className="col-7 mb-1">{value}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </div>
              </Tab>

              {/* ── TAB: Training ──────────────────────────────────────────────── */}
              <Tab eventKey="training" title="Training" tabClassName="small">
                <div className="p-3">
                  {a.trainingSessionId ? (
                    <div className="card border-0 shadow-sm">
                      <div className="card-body small">
                        <div className="fw-semibold mb-1">Training Session Linked</div>
                        {a.trainingStartedAt && (
                          <div className="text-muted">
                            Started: {new Date(a.trainingStartedAt).toLocaleDateString('en-UG')}
                          </div>
                        )}
                        {a.trainingCompletedAt && (
                          <div className="text-success">
                            Completed: {new Date(a.trainingCompletedAt).toLocaleDateString('en-UG')}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Alert variant="info" className="small py-2">
                      No training session assigned yet. Go to the Training tab to schedule one.
                    </Alert>
                  )}
                </div>
              </Tab>
            </Tabs>
          )}
        </Offcanvas.Body>
      </Offcanvas>

      {showConvert && a && (
        <ConvertToGuardModal
          applicant={a}
          onHide={() => setShowConvert(false)}
        />
      )}
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function HRPage() {
  const { user } = useAuth();
  // The Trainer runs recruitment, vetting and training; leave and letter
  // templates remain HR's.
  // HR_ROLES is senior management — it gates payroll elsewhere, so the HR
  // officer is deliberately not in it. Named here so they still get the leave
  // and letter-template tabs, which are their own work.
  const isHR = ([...HR_ROLES, ROLES.HR] as string[]).includes(user?.role ?? '');
  const { showToast } = useToast();
  const approve = useApproveLeave();

  const [showAddApplicant, setShowAddApplicant]   = useState(false);
  const [stageApplicant, setStageApplicant]       = useState<ApplicantResponse | null>(null);
  const [detailApplicantId, setDetailApplicantId] = useState<string | null>(null);
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [resultsSession, setResultsSession]       = useState<TrainingSessionResponse | null>(null);
  const [showLeaveModal, setShowLeaveModal]       = useState(false);
  const [editTemplate, setEditTemplate]           = useState<LetterTemplateResponse | null>(null);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('');
  const [leaveApplicantFilter, setLeaveApplicantFilter] = useState('');
  const [trainingStatusFilter, setTrainingStatusFilter] = useState('');

  const { data: applicantsData, isLoading: loadingApplicants } = useApplicants({ limit: 200 });
  const { data: pipeline } = usePipelineSummary();
  const { data: sessionsData, isLoading: loadingSessions } = useTrainingSessions({
    status: trainingStatusFilter || undefined,
    limit: 50,
  });
  const { data: leaveData, isLoading: loadingLeave } = useLeaveRequests({
    status:        leaveStatusFilter || undefined,
    applicantType: leaveApplicantFilter || undefined,
    limit: 50,
  });
  const { data: templates, isLoading: loadingTemplates } = useLetterTemplates();

  const applicants = applicantsData?.data ?? [];
  const sessions   = sessionsData?.data   ?? [];
  const leaves     = leaveData?.data      ?? [];

  const DISPLAY_STAGES = APPLICANT_STAGES.filter(s => s !== 'ONBOARDING');

  const handleApproveLeave = (id: string, action: 'APPROVE' | 'REJECT', reason?: string) => {
    approve.mutate(
      { id, data: { action, rejectionReason: reason } },
      {
        onSuccess: () => showToast(`Leave ${action === 'APPROVE' ? 'approved' : 'rejected'}`, 'success'),
        onError:   (err: any) => showToast(err?.response?.data?.error || 'Failed', 'danger'),
      },
    );
  };

  return (
    <div className="container-fluid py-4">
      <div className="mb-4">
        <h4 className="fw-bold mb-0">Human Resources</h4>
        <p className="text-muted small mb-0">Recruitment, training, leave management and letter templates</p>
      </div>

      <Tabs defaultActiveKey="recruitment" className="mb-3">
        {/* ── TAB 1: Recruitment ────────────────────────────────────────────── */}
        <Tab eventKey="recruitment" title="Recruitment Pipeline">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-semibold mb-0">Recruitment Pipeline</h6>
            <RoleGuard allowedRoles={HR_ROLES as UserRole[]}>
              <Button size="sm" onClick={() => setShowAddApplicant(true)}>
                <i className="bi bi-plus-lg me-1" />Add Applicant
              </Button>
            </RoleGuard>
          </div>

          {/* KPI row */}
          {pipeline && (
            <Row className="g-3 mb-4">
              {[
                { label: 'Total Active', value: pipeline.totalActive, color: '#1B3A6B' },
                { label: 'Interviews This Week', value: pipeline.byStage.find(s => s.stage === 'INTERVIEW_SCHEDULED')?.count ?? 0, color: '#fd7e14' },
                { label: 'Offers Made', value: pipeline.byStage.find(s => s.stage === 'OFFER_MADE')?.count ?? 0, color: '#6f42c1' },
                { label: `Accepted (${pipeline.conversionRate}%)`, value: pipeline.byStage.find(s => s.stage === 'ACCEPTED')?.count ?? 0, color: '#198754' },
              ].map(kpi => (
                <Col key={kpi.label} xs={6} md={3}>
                  <div className="card border-0 shadow-sm h-100">
                    <div className="card-body py-3 px-3">
                      <div className="small text-muted">{kpi.label}</div>
                      <div className="fw-bold fs-4" style={{ color: kpi.color }}>{kpi.value}</div>
                    </div>
                  </div>
                </Col>
              ))}
            </Row>
          )}

          {loadingApplicants ? (
            <div className="text-center py-5"><Spinner /></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div className="d-flex gap-3 pb-3" style={{ minWidth: DISPLAY_STAGES.length * 220 }}>
                {DISPLAY_STAGES.map(stage => {
                  const stageApplicants = applicants.filter(a => a.stage === stage);
                  return (
                    <div key={stage} style={{ minWidth: 210, flex: '0 0 210px' }}>
                      <div
                        className="rounded-top px-2 py-2 d-flex justify-content-between align-items-center"
                        style={{ background: STAGE_COLORS[stage], border: '1px solid #dee2e6' }}
                      >
                        <span className="small fw-semibold">{STAGE_LABELS[stage]}</span>
                        <Badge bg="secondary" className="rounded-pill">{stageApplicants.length}</Badge>
                      </div>
                      <div
                        className="d-flex flex-column gap-2 p-2 rounded-bottom"
                        style={{ background: '#f8f9fa', border: '1px solid #dee2e6', borderTop: 'none', minHeight: 120 }}
                      >
                        {stageApplicants.map(a => (
                          <div
                            key={a.id}
                            className="card border-0 shadow-sm"
                            style={{ fontSize: 12, cursor: 'pointer' }}
                            onClick={() => setDetailApplicantId(a.id)}
                          >
                            <div className="card-body p-2">
                              <div className="fw-bold">{a.fullName}</div>
                              <div className="text-muted">{a.phone}</div>
                              <div className="d-flex gap-1 mt-1 flex-wrap">
                                <Badge bg="light" text="dark" style={{ fontSize: 10 }}>{a.source}</Badge>
                                <span className="text-muted" style={{ fontSize: 10 }}>{a.daysInPipeline}d</span>
                              </div>
                              <div className="d-flex gap-1 mt-2" onClick={e => e.stopPropagation()}>
                                {NEXT_STAGE[stage] && (
                                  <RoleGuard allowedRoles={HR_ROLES as UserRole[]}>
                                    <Button
                                      size="sm"
                                      variant="outline-primary"
                                      style={{ fontSize: 11, padding: '1px 6px' }}
                                      onClick={() => setStageApplicant(a)}
                                    >
                                      Move →
                                    </Button>
                                  </RoleGuard>
                                )}
                                {stage === 'REJECTED' && (
                                  <Button
                                    size="sm"
                                    variant="outline-secondary"
                                    style={{ fontSize: 11, padding: '1px 6px' }}
                                    onClick={() => setStageApplicant(a)}
                                  >
                                    View
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {stageApplicants.length === 0 && (
                          <div className="text-muted text-center small py-3">Empty</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Tab>

        {/* ── TAB 2: Training ────────────────────────────────────────────────── */}
        <Tab eventKey="training" title="Training Sessions">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-semibold mb-0">Training Sessions</h6>
            <div className="d-flex gap-2 align-items-center">
              <Form.Select
                size="sm"
                style={{ width: 160 }}
                value={trainingStatusFilter}
                onChange={e => setTrainingStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </Form.Select>
              <RoleGuard allowedRoles={[...HR_ROLES, ROLES.TRAINER] as UserRole[]}>
                <Button size="sm" onClick={() => setShowTrainingModal(true)}>
                  <i className="bi bi-plus-lg me-1" />Schedule Training
                </Button>
              </RoleGuard>
            </div>
          </div>

          {loadingSessions ? (
            <div className="text-center py-5"><Spinner /></div>
          ) : sessions.length === 0 ? (
            <Alert variant="info">No training sessions found.</Alert>
          ) : (
            <Table hover size="sm" responsive>
              <thead className="table-light">
                <tr>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Trainer</th>
                  <th>Location</th>
                  <th className="text-center">Attendees</th>
                  <th className="text-center">Pass Rate</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => {
                  const passRate = s.attendeeCount > 0
                    ? `${s.passCount}/${s.attendeeCount}`
                    : '—';
                  const allPassed = s.passCount === s.attendeeCount && s.attendeeCount > 0;
                  return (
                    <tr key={s.id}>
                      <td className="fw-medium">
                        {s.title}
                        <Badge
                          bg={s.targetGroup === STAFF_TARGET_GROUP ? 'success' : 'primary'}
                          className="ms-2"
                          style={{ fontSize: '0.62rem' }}
                        >
                          {targetGroupLabel(s.targetGroup)}
                        </Badge>
                      </td>
                      <td>{new Date(s.scheduledAt).toLocaleDateString('en-UG')}</td>
                      <td>
                        {s.facilitatorName ?? s.facilitatorUser?.name ?? '—'}
                        {s.facilitatorType === EXTERNAL_FACILITATOR && (
                          <Badge bg="secondary" className="ms-1" style={{ fontSize: '0.6rem' }}>
                            External
                          </Badge>
                        )}
                      </td>
                      <td>{s.location ?? '—'}</td>
                      <td className="text-center">{s.attendeeCount}</td>
                      <td className="text-center">
                        {s.status === 'COMPLETED' ? (
                          <span className={allPassed ? 'text-success fw-medium' : 'text-warning fw-medium'}>
                            {passRate}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        <Badge bg={STATUS_BADGES[s.status] ?? 'secondary'}>
                          {s.status}
                        </Badge>
                      </td>
                      <td>
                        <RoleGuard allowedRoles={[...HR_ROLES, ROLES.TRAINER] as UserRole[]}>
                          {s.status === 'SCHEDULED' && (
                            <Button
                              size="sm"
                              variant="outline-success"
                              style={{ fontSize: 11 }}
                              onClick={() => setResultsSession(s)}
                            >
                              Record Results
                            </Button>
                          )}
                        </RoleGuard>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Tab>

        {/* ── TAB 3: Leave ───────────────────────────────────────────────────── */}
        <Tab eventKey="leave" title="Leave Management" disabled={!isHR} tabAttrs={{ hidden: !isHR }}>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-semibold mb-0">Leave Requests</h6>
            <div className="d-flex gap-2">
              <div className="btn-group btn-group-sm">
                {['', 'PENDING', 'APPROVED', 'REJECTED'].map(s => (
                  <Button
                    key={s}
                    variant={leaveStatusFilter === s ? 'primary' : 'outline-secondary'}
                    onClick={() => setLeaveStatusFilter(s)}
                  >
                    {s || 'All'}
                  </Button>
                ))}
              </div>
              <div className="d-flex gap-1 align-items-center">
                {[{ label: 'Everyone', value: '' }, { label: 'Guards', value: GUARD_APPLICANT }, { label: 'Staff', value: STAFF_APPLICANT }].map(f => {
                  const active = leaveApplicantFilter === f.value;
                  return (
                    <button
                      key={f.value || 'all'}
                      type="button"
                      onClick={() => setLeaveApplicantFilter(f.value)}
                      style={{
                        padding:      '3px 12px',
                        borderRadius: '20px',
                        border:       `1px solid ${active ? '#1B3A6B' : '#ced4da'}`,
                        background:   active ? '#1B3A6B' : 'white',
                        color:        active ? 'white' : '#4A5568',
                        fontSize:     '0.74rem',
                        fontWeight:   active ? 600 : 400,
                        cursor:       'pointer',
                      }}
                    >
                      {f.label}
                    </button>
                  );
                })}
                <Button size="sm" className="ms-2" onClick={() => setShowLeaveModal(true)}>
                  <i className="bi bi-plus-lg me-1" />Request Leave
                </Button>
              </div>
            </div>
          </div>

          {loadingLeave ? (
            <div className="text-center py-5"><Spinner /></div>
          ) : leaves.length === 0 ? (
            <Alert variant="info">No leave requests found.</Alert>
          ) : (
            <Table hover size="sm" responsive>
              <thead className="table-light">
                <tr>
                  <th>Who</th>
                  <th>Type</th>
                  <th>Period</th>
                  <th className="text-center">Days</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaves.map(l => (
                  <tr key={l.id}>
                    <td>
                      <div className="fw-medium">{l.applicantName}</div>
                      <div style={{ fontSize: '0.68rem', marginTop: '2px' }}>
                        <Badge
                          bg={l.applicantType === STAFF_APPLICANT ? 'success' : 'primary'}
                          style={{ fontSize: '0.6rem' }}
                        >
                          {l.applicantType === STAFF_APPLICANT ? 'Staff' : 'Guard'}
                        </Badge>
                        {l.staff && (
                          <span className="text-muted ms-2">
                            {l.staff.jobTitle
                              ? getJobTitleLabel(l.staff.jobTitle)
                              : l.staff.role.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <Badge bg={LEAVE_TYPE_BADGES[l.type] ?? 'secondary'} text={l.type === 'SICK' ? 'dark' : undefined}>
                        {leaveTypeLabel(l.type)}
                      </Badge>
                    </td>
                    <td className="small text-nowrap">
                      {new Date(l.startDate).toLocaleDateString('en-UG')} — {new Date(l.endDate).toLocaleDateString('en-UG')}
                    </td>
                    <td className="text-center">{l.daysRequested}</td>
                    <td className="small text-muted" style={{ maxWidth: 200 }}>
                      <span title={l.reason}>{l.reason.length > 60 ? l.reason.slice(0, 60) + '…' : l.reason}</span>
                    </td>
                    <td>
                      <Badge bg={STATUS_BADGES[l.status] ?? 'secondary'} text={l.status === 'PENDING' ? 'dark' : undefined}>
                        {l.status}
                      </Badge>
                    </td>
                    <td>
                      {l.status === 'PENDING' && (
                        <RoleGuard allowedRoles={HR_ROLES as UserRole[]}>
                          <div className="d-flex gap-1">
                            <Button
                              size="sm"
                              variant="outline-success"
                              style={{ fontSize: 11, padding: '1px 6px' }}
                              onClick={() => handleApproveLeave(l.id, 'APPROVE')}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline-danger"
                              style={{ fontSize: 11, padding: '1px 6px' }}
                              onClick={() => {
                                const reason = prompt('Rejection reason (min 10 chars):');
                                if (reason && reason.length >= 10) handleApproveLeave(l.id, 'REJECT', reason);
                              }}
                            >
                              Reject
                            </Button>
                          </div>
                        </RoleGuard>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Tab>

        {/* ── TAB 4: Letter Templates ─────────────────────────────────────────── */}
        <Tab eventKey="templates" title="Letter Templates" disabled={!isHR} tabAttrs={{ hidden: !isHR }}>
          <RoleGuard allowedRoles={HR_ROLES as UserRole[]}>
            <div className="mb-3">
              <h6 className="fw-semibold">Letter Template Library</h6>
              <p className="text-muted small">Edit the templates used to generate formal letters for guards.</p>
            </div>
            {loadingTemplates ? (
              <div className="text-center py-5"><Spinner /></div>
            ) : (
              <ListGroup>
                {LETTER_TYPES.map(lt => {
                  const tmpl = templates?.find(t => t.letterType === lt);
                  return (
                    <ListGroup.Item key={lt} className="d-flex justify-content-between align-items-center">
                      <div>
                        <div className="fw-medium small">{LETTER_TYPE_LABELS[lt]}</div>
                        {tmpl && (
                          <div className="text-muted" style={{ fontSize: 11 }}>
                            v{tmpl.version} · Last updated {new Date(tmpl.updatedAt).toLocaleDateString('en-UG')}
                          </div>
                        )}
                        {!tmpl && <Badge bg="warning" text="dark" style={{ fontSize: 10 }}>Not configured</Badge>}
                      </div>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        onClick={() => setEditTemplate(tmpl ?? {
                          id: '', name: LETTER_TYPE_LABELS[lt], letterType: lt,
                          content: '', version: 0, isActive: true,
                          createdBy: '', updatedBy: null,
                          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                        })}
                      >
                        Edit
                      </Button>
                    </ListGroup.Item>
                  );
                })}
              </ListGroup>
            )}
          </RoleGuard>
        </Tab>
      </Tabs>

      {/* Modals */}
      <ApplicantFormModal show={showAddApplicant} onHide={() => setShowAddApplicant(false)} />
      <StageUpdateModal applicant={stageApplicant} onHide={() => setStageApplicant(null)} />
      <TrainingSessionModal show={showTrainingModal} onHide={() => setShowTrainingModal(false)} />
      <RecordResultsModal session={resultsSession} onHide={() => setResultsSession(null)} />
      <LeaveRequestModal show={showLeaveModal} onHide={() => setShowLeaveModal(false)} />
      <TemplateEditorModal template={editTemplate} onHide={() => setEditTemplate(null)} />
      <ApplicantDetailPanel applicantId={detailApplicantId} onHide={() => setDetailApplicantId(null)} />
    </div>
  );
}
