import { useEffect, useMemo, useState } from 'react';
import { COMPANY_NAME_UPPER } from '../../lib/branding';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Badge, Button, Col, Form, Row, Spinner } from 'react-bootstrap';
import { useQuery, useMutation } from '@tanstack/react-query';
import { DEPLOYMENT_ROW_LABELS, GUN_EXTRA_ROWS } from '@stap/shared';
import type { MotorcycleReport, PendingMatter, ShiftReportInput } from '@stap/shared';
import { shiftReportsApi } from '../../lib/shiftReports.api';
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
  pendingMatters: PendingMatter[]; motorcycleReport: MotorcycleReport[];
  totalIncidents: number; totalClientCalls: number;
  totalAbsentees: number; totalReplacements: number;
  majorIssue: string;
  outgoingControllerName: string; outgoingTime: string;
  incomingControllerName: string; incomingTime: string;
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
    pendingMatters: [], motorcycleReport: [],
    totalIncidents: 0, totalClientCalls: 0, totalAbsentees: 0, totalReplacements: 0,
    majorIssue: '',
    outgoingControllerName: '', outgoingTime: '',
    incomingControllerName: '', incomingTime: '',
  };
}

/** A row counts as filled if anything other than its printed label was typed. */
const countFilled = (rows: Row[], keys: string[]) =>
  rows.filter(r => keys.some(k => (r[k] ?? '').trim() !== '')).length;

export default function ShiftHandoverPage({ readOnly = false }: { readOnly?: boolean }) {
  const reportTitle = useReportTitle('shift_handover_report');
  const { id }        = useParams<{ id: string }>();
  const navigate      = useNavigate();
  const { user }      = useAuth();
  const { showToast } = useToast();
  const canCreate     = useHasPermission('shift_report.create');
  const canAcknowledge = useHasPermission('shift_report.acknowledge');

  const [form, setForm] = useState<FormState>(blankForm);
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
        totalIncidents:    existing.totalIncidents,
        totalClientCalls:  existing.totalClientCalls,
        totalAbsentees:    existing.totalAbsentees,
        totalReplacements: existing.totalReplacements,
        majorIssue:             existing.majorIssue ?? '',
        outgoingControllerName: existing.outgoingControllerName ?? '',
        outgoingTime:           existing.outgoingTime ?? '',
        incomingControllerName: existing.incomingControllerName ?? '',
        incomingTime:           existing.incomingTime ?? '',
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
          {COMPANY_NAME_UPPER}
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: NAVY }}>
          {reportTitle.title}
        </div>
        {existing && (
          <div className="mt-2 d-flex gap-2 justify-content-center align-items-center">
            {existing.systemId && <code style={{ fontSize: '0.8rem' }}>{existing.systemId}</code>}
            <Badge bg={
              existing.status === 'ACKNOWLEDGED' ? 'success'
                : existing.status === 'SUBMITTED' ? 'warning' : 'secondary'
            }>
              {existing.status}
            </Badge>
          </div>
        )}
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

      <SectionHeader number={3} title="SUPERVISION REPORTS RECEIVED" />
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

      <SectionHeader number={4} title="CLIENT COMMUNICATIONS" />
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

      <SectionHeader number={5} title="GUNS DEPLOYED" />
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

      <SectionHeader number={6} title="GUARD DISCIPLINE ISSUES" />
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

      <SectionHeader number={7} title="SHIFT SUMMARY" />
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
      <Form.Group className="mb-4">
        <Form.Label className="fw-bold small mb-1">Major Issue of the Shift</Form.Label>
        <Form.Control as="textarea" rows={3} value={form.majorIssue} disabled={locked}
          onChange={e => set('majorIssue', e.target.value)} />
      </Form.Group>

      <PendingMattersSection
        items={form.pendingMatters} readOnly={locked}
        onChange={items => set('pendingMatters', items)}
      />

      <MotorcycleSection
        items={form.motorcycleReport} readOnly={locked}
        onChange={items => set('motorcycleReport', items)}
      />

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
    </div>
  );
}
