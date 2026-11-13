import { useEffect, useMemo, useState } from 'react';
import { useCompanyBranding } from '../../hooks/useCompanyBranding';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Col, Form, Modal, Row, Spinner } from 'react-bootstrap';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DEPLOYMENT_ROW_LABELS, GUN_EXTRA_ROWS } from '@security360/shared';
import type { MotorcycleReport, PendingMatter, ShiftReportInput } from '@security360/shared';
import { shiftReportsApi } from '../../lib/shiftReports.api';
import { usersApi } from '../../lib/users.api';
import { useAuth, useHasPermission } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useReportTitle } from '../../hooks/useReportTitles';
import { getApiErrorMessage } from '../../lib/api';
import {
  SectionHeader, DynamicTable, FixedTable, PendingMattersSection, MotorcycleSection, NAVY,
} from './shiftReportParts';

type Row = Record<string, string>;

/** Used only where the company has configured no zones of its own. */
const FALLBACK_ZONES = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'];

const emptyIncident   = { time: '', site: '', incident: '', staffResponding: '', status: '' };
const emptyClientComm = { time: '', clientSite: '', issueRaised: '', staffResponsible: '' };
const emptyDiscipline = { site: '', guardName: '', issue: '', actionTakenBy: '' };

interface FormState {
  date: string; shift: 'DAY' | 'NIGHT'; timeFrom: string; timeTo: string;
  deploymentRows: Row[]; deploymentRemarks: string;
  incidents: Row[]; supervisionRows: Row[]; clientComms: Row[];
  gunsDeployed: Row[]; disciplineIssues: Row[];
  daySupervisorReport: { bikeRegistration: string; bikeCondition: string; sectionA: Row[]; sectionB: Row[] };
  pendingMatters: PendingMatter[]; motorcycleReport: MotorcycleReport[];
  majorIssues: { id: string; issue: string; riskImpact: string; actionRequired: string; responsibleManager: string; deadline: string }[];
  totalIncidents: number; totalClientCalls: number;
  totalAbsentees: number; totalReplacements: number;
  totalSitesExpected: number; totalSitesCovered: number; totalSickGuards: number;
  totalDisciplinary: number; totalOpenActions: number; totalOverdueActions: number;
  majorIssue: string;
  outgoingControllerName: string; outgoingTime: string;
  incomingControllerName: string; incomingTime: string;
  forwardedToId: string | null;
}

function blankForm(): FormState {
  return {
    date:     new Date().toISOString().split('T')[0],
    shift:    'DAY',
    timeFrom: '06:00',
    timeTo:   '18:00',
    deploymentRows: DEPLOYMENT_ROW_LABELS.map(label => ({ label, number: '', siteDetails: '' })),
    deploymentRemarks: '',
    incidents:        [{ ...emptyIncident }],
    supervisionRows:  [],
    clientComms:      [{ ...emptyClientComm }],
    gunsDeployed:     [],
    disciplineIssues: [{ ...emptyDiscipline }],
    // Sections 8 and 9 start empty: unlike the printed tables above, a row here
    // means the controller had something to hand over.
    daySupervisorReport: { bikeRegistration: '', bikeCondition: '', sectionA: [], sectionB: [] },
  // Sections 8 and 9 start empty: unlike the printed tables above, a row here
  // means the controller had something to hand over.
  pendingMatters: [], motorcycleReport: [],
  majorIssues: [],
  totalIncidents: 0, totalClientCalls: 0, totalAbsentees: 0, totalReplacements: 0,
  totalSitesExpected: 0, totalSitesCovered: 0, totalSickGuards: 0,
  totalDisciplinary: 0, totalOpenActions: 0, totalOverdueActions: 0,
  majorIssue: '',
    outgoingControllerName: '', outgoingTime: '',
    incomingControllerName: '', incomingTime: '',
    forwardedToId: null,
  };
}

/** A row counts as filled if anything other than its printed label was typed. */
const countFilled = (rows: Row[], keys: string[]) =>
  rows.filter(r => keys.some(k => (r[k] ?? '').trim() !== '')).length;

export default function ShiftHandoverPage({ readOnly = false }: { readOnly?: boolean }) {
  const { data: companyBranding } = useCompanyBranding();
  const reportTitle = useReportTitle('shift_handover_report');
  const { id }        = useParams<{ id: string }>();
  const navigate      = useNavigate();
  const { user }      = useAuth();
  const { showToast } = useToast();
  const canCreate     = useHasPermission('shift_report.create');
  const canAcknowledge = useHasPermission('shift_report.acknowledge');

  const [form, setForm] = useState<FormState>(blankForm);
  const [showForward, setShowForward] = useState(false);
  const [forwardTo, setForwardTo] = useState('');

  // Auto-populate the outgoing controller from the signed-in user so the report
  // always records exactly who was in the control room making it.
  useEffect(() => {
    if (user?.name && !form.outgoingControllerName && !id) {
      set('outgoingControllerName', user.name);
    }
  }, [user?.name, id]);
  const { data: adminUsers } = useQuery({
    queryKey: ['admin-users-forward'],
    queryFn: () => usersApi.list({ roles: 'DIRECTOR,MD,ASSISTANT_MANAGER,ADMINISTRATOR,CONTROL_ROOM', status: 'ACTIVE' }),
    enabled: showForward,
  });
  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(p => ({ ...p, [key]: val }));

  // isFetched, not just data: the zone rows must not be seeded from the
  // placeholder while this is still in flight, because once seeded they are
  // never replaced and the company's real zones would never appear.
  const { data: options, isFetched: optionsSettled } = useQuery({
    queryKey: ['shift-report-options'],
    queryFn:  shiftReportsApi.formOptions,
  });

  const { data: existing, isLoading } = useQuery({
    queryKey: ['shift-report', id],
    queryFn:  () => shiftReportsApi.get(id as string),
    enabled:  !!id,
  });

  // Sections 3 and 5 list the company's own zones; guns add outposts and a total.
  const zones = options?.zones?.length ? options.zones : FALLBACK_ZONES;

  useEffect(() => {
    if (existing) {
      setForm({
        date:     existing.date.split('T')[0],
        shift:    existing.shift as 'DAY' | 'NIGHT',
        timeFrom: existing.timeFrom,
        timeTo:   existing.timeTo,
        deploymentRows:    existing.deploymentRows as Row[],
        deploymentRemarks: existing.deploymentRemarks ?? '',
        incidents:         existing.incidents as Row[],
        supervisionRows:   existing.supervisionRows as Row[],
        clientComms:       existing.clientComms as Row[],
        gunsDeployed:      existing.gunsDeployed as Row[],
        disciplineIssues:  existing.disciplineIssues as Row[],
        pendingMatters:    existing.pendingMatters   ?? [],
        motorcycleReport:  existing.motorcycleReport ?? [],
        daySupervisorReport: existing.daySupervisorReport ?? { bikeRegistration: '', bikeCondition: '', sectionA: [], sectionB: [] },
        majorIssues:       existing.majorIssues ?? [],
        totalIncidents:    existing.totalIncidents,
        totalClientCalls:  existing.totalClientCalls,
        totalAbsentees:    existing.totalAbsentees,
        totalReplacements: existing.totalReplacements,
        totalSitesExpected: existing.totalSitesExpected ?? 0,
        totalSitesCovered:  existing.totalSitesCovered ?? 0,
        totalSickGuards:    existing.totalSickGuards ?? 0,
        totalDisciplinary:  existing.totalDisciplinary ?? 0,
        totalOpenActions:   existing.totalOpenActions ?? 0,
        totalOverdueActions:existing.totalOverdueActions ?? 0,
        majorIssue:             existing.majorIssue ?? '',
        outgoingControllerName: existing.outgoingControllerName ?? '',
        outgoingTime:           existing.outgoingTime ?? '',
        incomingControllerName: existing.incomingControllerName ?? '',
        incomingTime:           existing.incomingTime ?? '',
        forwardedToId:          existing.forwardedToId ?? null,
      });
      return;
    }
    // A new form starts with one row per zone so the controller fills rather
    // than builds the table, matching the pre-printed sheet. Held until the
    // zone list has settled — the fallback is for a company that has none
    // configured, not for the moment before the request returns.
    if (!id && optionsSettled) {
      setForm(p => ({
        ...p,
        supervisionRows: p.supervisionRows.length ? p.supervisionRows
          : zones.map(zone => ({ zone, physicalCount: '', phoneCount: '', challenges: '' })),
        gunsDeployed: p.gunsDeployed.length ? p.gunsDeployed
          : [...zones, ...GUN_EXTRA_ROWS].map(zone => ({ zone, numGuns: '', numBullets: '', status: '' })),
      }));
    }
  }, [existing, id, optionsSettled, zones.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Suggested from what was actually typed, so the totals cannot silently
  // disagree with the rows above them. Still editable — the paper form counts
  // some things the tables do not hold.
  const suggested = useMemo(() => ({
    totalIncidents:   countFilled(form.incidents, ['site', 'incident', 'staffResponding']),
    totalClientCalls: countFilled(form.clientComms, ['clientSite', 'issueRaised']),
  }), [form.incidents, form.clientComms]);

  const save = useMutation({
    mutationFn: (status: 'DRAFT' | 'SUBMITTED') => {
      const body = { ...form, status } as unknown as ShiftReportInput;
      return id && existing?.status === 'DRAFT'
        ? shiftReportsApi.update(id, body)
        : shiftReportsApi.create(body);
    },
    onSuccess: (r) => {
      showToast(
        r.status === 'DRAFT' ? 'Draft saved.' : `Report ${r.systemId ?? ''} submitted.`,
        'success',
      );
      navigate('/control-room/shift-reports');
    },
    onError: (err) => showToast(getApiErrorMessage(err, 'Could not save the report.'), 'danger'),
  });

  const acknowledge = useMutation({
    mutationFn: () => shiftReportsApi.acknowledge(id as string),
    onSuccess:  () => { showToast('Report acknowledged.', 'success'); navigate('/control-room/shift-reports'); },
    onError:    (err) => showToast(getApiErrorMessage(err, 'Could not acknowledge.'), 'danger'),
  });

  if (id && isLoading) {
    return <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>;
  }

  // A submitted report is the record of a shift that has been handed over, so
  // it is shown rather than edited.
  const locked = readOnly || (!!existing && existing.status !== 'DRAFT') || !canCreate;

  return (
    <div className="p-3 p-md-4" style={{ maxWidth: 980, margin: '0 auto' }}>
      <div style={{
        textAlign: 'center', marginBottom: 24,
        borderBottom: `3px solid ${NAVY}`, paddingBottom: 12,
      }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: NAVY, letterSpacing: 1 }}>
          {companyBranding.company_name.toUpperCase()}
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: NAVY }}>
          {reportTitle.title}
        </div>
        <div className="mt-2 d-flex gap-2 justify-content-center align-items-center flex-wrap">
          {user?.name && <Badge bg="primary" style={{ fontSize: '0.75rem' }}>Controller on duty: {user.name}</Badge>}
          {existing && existing.systemId && <code style={{ fontSize: '0.8rem' }}>{existing.systemId}</code>}
          {existing && (
            <Badge bg={
              existing.status === 'ACKNOWLEDGED' ? 'success'
                : existing.status === 'SUBMITTED' ? 'warning' : 'secondary'
            }>
              {existing.status}
            </Badge>
          )}
          </div>
      </div>

      {locked && existing?.status !== 'DRAFT' && existing && (
        <Alert variant="light" className="border small py-2">
          This report was handed over and is kept as the record of that shift, so it
          can no longer be edited.
          {existing.acknowledgedBy && ` Acknowledged by ${existing.acknowledgedBy}.`}
        </Alert>
      )}

      <Row className="g-3 mb-4">
        <Col md={3} xs={6}>
          <Form.Label className="fw-bold small mb-1">Date</Form.Label>
          <Form.Control type="date" value={form.date} disabled={locked}
            onChange={e => set('date', e.target.value)} />
        </Col>
        <Col md={2} xs={6}>
          <Form.Label className="fw-bold small mb-1">Shift</Form.Label>
          <Form.Select value={form.shift} disabled={locked}
            onChange={e => set('shift', e.target.value as 'DAY' | 'NIGHT')}>
            <option value="DAY">Day (D)</option>
            <option value="NIGHT">Night (N)</option>
          </Form.Select>
        </Col>
        <Col md={2} xs={6}>
          <Form.Label className="fw-bold small mb-1">Time From</Form.Label>
          <Form.Control type="time" value={form.timeFrom} disabled={locked}
            onChange={e => set('timeFrom', e.target.value)} />
        </Col>
        <Col md={2} xs={6}>
          <Form.Label className="fw-bold small mb-1">Time To</Form.Label>
          <Form.Control type="time" value={form.timeTo} disabled={locked}
            onChange={e => set('timeTo', e.target.value)} />
        </Col>
        <Col md={3}>
          <Form.Label className="fw-bold small mb-1">Controller</Form.Label>
          <Form.Control disabled value={existing?.controllerName ?? user?.name ?? ''}
            style={{ background: '#F2F4F7' }} />
        </Col>
      </Row>

      <SectionHeader number={1} title="DEPLOYMENT STATUS" />
      <FixedTable
        headers={[
          { key: 'label',       label: 'Description' },
          { key: 'number',      label: 'Number', width: '90px' },
          { key: 'siteDetails', label: 'Any site details' },
        ]}
        fields={[{ key: 'number', numeric: true }, { key: 'siteDetails' }]}
        rows={form.deploymentRows}
        onChange={rows => set('deploymentRows', rows)}
        readOnly={locked}
      />
      <Form.Group className="mb-4">
        <Form.Label className="small text-muted">
          Deployment Remarks (confirm if all sites are covered, how many O.T, etc.)
        </Form.Label>
        <Form.Control as="textarea" rows={3} value={form.deploymentRemarks} disabled={locked}
          onChange={e => set('deploymentRemarks', e.target.value)} />
      </Form.Group>

      <SectionHeader number={2} title="INCIDENTS / OCCURRENCES" />
      <DynamicTable
        columns={[
          { key: 'time',            label: 'Time', width: '90px' },
          { key: 'site',            label: 'Site' },
          { key: 'incident',        label: 'Incident' },
          { key: 'staffResponding', label: 'Staff name responding' },
          { key: 'status',          label: 'Status', width: '110px' },
        ]}
        rows={form.incidents} emptyRow={emptyIncident} readOnly={locked}
        onChange={rows => set('incidents', rows)}
      />

      <SectionHeader number={3} title="SUPERVISION COVERAGE" />
      <FixedTable
        headers={[
          { key: 'zone',          label: 'Zone Day/Night' },
          { key: 'physicalCount', label: 'Sites Covered Physically', width: '150px' },
          { key: 'phoneCount',    label: 'Sites Covered Phone Call', width: '150px' },
          { key: 'challenges',    label: 'Challenges Reported' },
        ]}
        fields={[
          { key: 'physicalCount', numeric: true },
          { key: 'phoneCount',    numeric: true },
          { key: 'challenges' },
        ]}
        rows={form.supervisionRows}
        onChange={rows => set('supervisionRows', rows)}
        readOnly={locked}
      />

      <SectionHeader number={4} title="CLIENT COMMUNICATIONS / COMPLAINTS" />
      <DynamicTable
        columns={[
          { key: 'time',             label: 'Time', width: '90px' },
          { key: 'clientSite',       label: 'Client/Site' },
          { key: 'issueRaised',      label: 'Issue Raised' },
          { key: 'staffResponsible', label: 'Staff responsible' },
        ]}
        rows={form.clientComms} emptyRow={emptyClientComm} readOnly={locked}
        onChange={rows => set('clientComms', rows)}
      />

      <SectionHeader number={5} title="FIREARMS DEPLOYMENT & ACCOUNTABILITY" />
      <FixedTable
        headers={[
          { key: 'zone',       label: 'Zone' },
          { key: 'numGuns',    label: 'No. Guns', width: '100px' },
          { key: 'numBullets', label: 'No. Bullets', width: '110px' },
          { key: 'status',     label: 'Status' },
        ]}
        fields={[
          { key: 'numGuns',    numeric: true },
          { key: 'numBullets', numeric: true },
          { key: 'status' },
        ]}
        rows={form.gunsDeployed}
        onChange={rows => set('gunsDeployed', rows)}
        readOnly={locked}
        highlightRow="TOTAL"
      />

      <SectionHeader number={6} title="GUARD DISCIPLINE / COMPLIANCE ISSUES" />
      <DynamicTable
        columns={[
          { key: 'site',          label: 'Site' },
          { key: 'guardName',     label: 'Guard name' },
          { key: 'issue',         label: 'Issue' },
          { key: 'actionTakenBy', label: 'Action Taken and by who' },
        ]}
        rows={form.disciplineIssues} emptyRow={emptyDiscipline} readOnly={locked}
        onChange={rows => set('disciplineIssues', rows)}
      />

      <SectionHeader number={6} title="SUPERVISOR & MOTORCYCLE EXCEPTION REPORT" />
      <div className="mb-3">
        <Row className="g-3 mb-2">
          <Col md={6}>
            <Form.Label className="small fw-bold mb-1">Bike / Motorcycle Used</Form.Label>
            <Form.Control size="sm" value={form.daySupervisorReport.bikeRegistration} disabled={locked}
              placeholder="Registration / ID"
              onChange={e => set('daySupervisorReport', { ...form.daySupervisorReport, bikeRegistration: e.target.value })} />
          </Col>
          <Col md={6}>
            <Form.Label className="small fw-bold mb-1">Condition on Handover</Form.Label>
            <Form.Control size="sm" value={form.daySupervisorReport.bikeCondition} disabled={locked}
              placeholder="e.g. Good, minor scratch"
              onChange={e => set('daySupervisorReport', { ...form.daySupervisorReport, bikeCondition: e.target.value })} />
          </Col>
        </Row>
        <div className="fw-bold small mb-1" style={{ color: NAVY }}>Section A ? Tasks Handled</div>
        <DynamicTable
          columns={[
            { key: 'time',     label: 'Time', width: '70px' },
            { key: 'site',     label: 'Site / Location' },
            { key: 'task',     label: 'Task / Activity Performed' },
            { key: 'outcome',  label: 'Outcome / Findings' },
            { key: 'followUp', label: 'Follow-up Required' },
          ]}
          rows={form.daySupervisorReport.sectionA}
          emptyRow={{ time: '', site: '', task: '', outcome: '', followUp: '' }}
          readOnly={locked}
          onChange={rows => set('daySupervisorReport', { ...form.daySupervisorReport, sectionA: rows })}
        />
        <div className="fw-bold small mb-1 mt-2" style={{ color: NAVY }}>Section B ? Tasks Handled</div>
        <DynamicTable
          columns={[
            { key: 'time',     label: 'Time', width: '70px' },
            { key: 'site',     label: 'Site / Location' },
            { key: 'task',     label: 'Task / Activity Performed' },
            { key: 'outcome',  label: 'Outcome / Findings' },
            { key: 'followUp', label: 'Follow-up Required' },
          ]}
          rows={form.daySupervisorReport.sectionB}
          emptyRow={{ time: '', site: '', task: '', outcome: '', followUp: '' }}
          readOnly={locked}
          onChange={rows => set('daySupervisorReport', { ...form.daySupervisorReport, sectionB: rows })}
        />
      </div>

      <SectionHeader number={9} title="SHIFT SUMMARY" />
      <Row className="g-3 mb-3">
        {([
          ['totalIncidents',    'Total Incidents',    suggested.totalIncidents],
          ['totalClientCalls',  'Total Client Calls', suggested.totalClientCalls],
          ['totalAbsentees',    'Total Absentees',    null],
          ['totalReplacements', 'Total Replacements', null],
        ] as const).map(([key, label, hint]) => {
          const value = form[key] as number;
          return (
            <Col key={key} md={3} sm={6}>
              <Form.Label className="fw-bold small mb-1">{label}</Form.Label>
              <Form.Control
                type="number" min={0} value={value} disabled={locked}
                onChange={e => set(key, parseInt(e.target.value, 10) || 0)}
                style={{ fontSize: '1.2rem', fontWeight: 700, textAlign: 'center' }}
              />
              {!locked && hint !== null && hint !== value && (
                <button
                  type="button"
                  className="btn btn-link p-0 mt-1"
                  style={{ fontSize: '0.72rem' }}
                  onClick={() => set(key, hint)}
                >
                  {hint} row{hint === 1 ? '' : 's'} filled in above — use {hint}
                </button>
              )}
            </Col>
          );
        })}
      </Row>
      <SectionHeader number={10} title="MAJOR ISSUES REQUIRING MANAGEMENT ATTENTION" />
      <DynamicTable
        columns={[
          { key: 'issue',              label: 'Issue' },
          { key: 'riskImpact',         label: 'Risk / Impact' },
          { key: 'actionRequired',    label: 'Action Required' },
          { key: 'responsibleManager',label: 'Responsible Manager' },
          { key: 'deadline',          label: 'Deadline', width: '110px' },
        ]}
        rows={form.majorIssues}
        emptyRow={{ id: crypto.randomUUID(), issue: '', riskImpact: '', actionRequired: '', responsibleManager: '', deadline: '' }}
        readOnly={locked}
        onChange={rows => set('majorIssues', rows.map(r => ({ id: r.id || crypto.randomUUID(), issue: r.issue ?? '', riskImpact: r.riskImpact ?? '', actionRequired: r.actionRequired ?? '', responsibleManager: r.responsibleManager ?? '', deadline: r.deadline ?? '' })))}
      />
      <Form.Group className="mb-4 mt-2">
        <Form.Label className="fw-bold small mb-1">Major Issue of the Shift (summary)</Form.Label>
        <Form.Control as="textarea" rows={2} value={form.majorIssue} disabled={locked}
          onChange={e => set('majorIssue', e.target.value)} />
      </Form.Group>

      <SectionHeader number={8} title="CONTROL ROOM ACTION / PENDING REGISTER" />
      <PendingMattersSection
        items={form.pendingMatters} readOnly={locked}
        onChange={items => set('pendingMatters', items)}
      />

      <MotorcycleSection
        items={form.motorcycleReport} readOnly={locked}
        onChange={items => set('motorcycleReport', items)}
      />

      <SectionHeader number={11} title="CONTROLLER'S DECLARATION" />
      <div style={{
        background: '#F2F4F7', borderRadius: '0.5rem', padding: '16px 20px',
        marginBottom: 20, border: `2px solid ${NAVY}`,
      }}>
        <div className="fw-bold mb-3" style={{ color: NAVY }}>HANDOVER</div>
        <Row className="g-3">
          <Col md={4} xs={8}>
            <Form.Label className="small fw-bold mb-1">Outgoing Controller Name</Form.Label>
            <Form.Control value={form.outgoingControllerName} disabled={locked}
              onChange={e => set('outgoingControllerName', e.target.value)} />
          </Col>
          <Col md={2} xs={4}>
            <Form.Label className="small fw-bold mb-1">Time</Form.Label>
            <Form.Control type="time" value={form.outgoingTime} disabled={locked}
              onChange={e => set('outgoingTime', e.target.value)} />
          </Col>
          <Col md={4} xs={8}>
            <Form.Label className="small fw-bold mb-1">Incoming Controller Name</Form.Label>
            <Form.Control value={form.incomingControllerName} disabled={locked}
              onChange={e => set('incomingControllerName', e.target.value)} />
          </Col>
          <Col md={2} xs={4}>
            <Form.Label className="small fw-bold mb-1">Time</Form.Label>
            <Form.Control type="time" value={form.incomingTime} disabled={locked}
              onChange={e => set('incomingTime', e.target.value)} />
          </Col>
        </Row>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-4">
        {existing && (
          <Button
            variant="outline-warning"
            onClick={() => setShowForward(true)}
          >
            <i className="bi bi-send me-1" />Forward for Review
          </Button>
        )}
        {!locked && (
          <>
            <Button variant="outline-secondary" disabled={save.isPending}
              onClick={() => save.mutate('DRAFT')}>
              Save Draft
            </Button>
            <Button variant="primary" disabled={save.isPending}
              onClick={() => save.mutate('SUBMITTED')}>
              {save.isPending ? 'Submitting…' : 'Submit Report'}
            </Button>
          </>
        )}
        {existing && (
          <Button
            variant="outline-primary"
            onClick={() => shiftReportsApi.downloadPdf(
              existing.id, existing.systemId ?? `shift-report-${existing.id.slice(-6)}`,
            ).catch(() => showToast('Could not download the PDF.', 'danger'))}
          >
            Download PDF
          </Button>
        )}
        {existing?.status === 'SUBMITTED' && canAcknowledge && (
          <Button variant="success" disabled={acknowledge.isPending}
            onClick={() => acknowledge.mutate()}>
            {acknowledge.isPending ? 'Acknowledging…' : 'Acknowledge'}
          </Button>
        )}
        <Button variant="link" onClick={() => navigate('/control-room/shift-reports')}>
          Back to reports
        </Button>
      </div>
      <Modal show={showForward} onHide={() => setShowForward(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>Forward Shift Report for Review</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted">Forward this report to an administrator for review.</p>
          <Form.Group>
            <Form.Label className="small">Forward to</Form.Label>
            <Form.Select size="sm" value={forwardTo} onChange={(e) => setForwardTo(e.target.value)}>
              <option value="">All admins</option>
              {(adminUsers?.data ?? []).map((u: any) => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button size="sm" variant="outline-secondary" onClick={() => setShowForward(false)}>Cancel</Button>
          <Button size="sm" variant="primary" onClick={async () => {
            if (!existing) return;
            try {
              await shiftReportsApi.forward(existing.id, forwardTo || null);
              showToast('Report forwarded for review.', 'success');
              setShowForward(false);
            } catch (err: any) {
              showToast(err?.response?.data?.error ?? 'Failed to forward.', 'danger');
            }
          }}>Forward</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
