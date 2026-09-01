import { useState } from 'react';
import { Alert, Badge, Button, Col, Row, Spinner } from 'react-bootstrap';
import { useQuery, useMutation } from '@tanstack/react-query';
import { scheduledJobsApi, type ScheduledJobRow } from '../../lib/scheduledJobs.api';
import { useHasPermission } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

const CATEGORY: Record<string, { label: string; icon: string; colour: string }> = {
  invoices:    { label: 'Invoices',         icon: '📄', colour: '#1B3A6B' },
  payroll:     { label: 'Payroll & Salary', icon: '💰', colour: '#1E8449' },
  payments:    { label: 'Payments',         icon: '💳', colour: '#0F7B6C' },
  reports:     { label: 'Reports',          icon: '📊', colour: '#6C3483' },
  maintenance: { label: 'Maintenance',      icon: '🔧', colour: '#E8701A' },
};

const STATUS: Record<string, { colour: string; icon: string }> = {
  SUCCESS: { colour: '#1E8449', icon: '✅' },
  FAILED:  { colour: '#C0392B', icon: '❌' },
  RUNNING: { colour: '#B7791F', icon: '⏳' },
  SKIPPED: { colour: '#6c757d', icon: '⏭' },
};

const ms = (n: number | null) =>
  n === null ? '—' : n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`;

/** "in 4 hours" / "2 days ago" — the shape an operator actually reads. */
function relative(iso: string | null): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  const abs  = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const unit =
    mins < 1      ? 'just now'
    : mins < 60   ? `${mins} min`
    : abs < 864e5 ? `${Math.round(mins / 60)} hour${Math.round(mins / 60) === 1 ? '' : 's'}`
    : `${Math.round(abs / 864e5)} day${Math.round(abs / 864e5) === 1 ? '' : 's'}`;
  if (unit === 'just now') return unit;
  return diff > 0 ? `in ${unit}` : `${unit} ago`;
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });

function JobCard({ job, colour, onChanged }: {
  job: ScheduledJobRow; colour: string; onChanged: () => void;
}) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const canEdit = useHasPermission('settings.edit');

  const toggle = useMutation({
    mutationFn: () => scheduledJobsApi.setActive(job.key, !job.isActive),
    onSuccess:  () => {
      showToast(`${job.name} ${job.isActive ? 'paused' : 'resumed'}.`, 'success');
      onChanged();
    },
    onError: (e) => showToast(getApiErrorMessage(e, 'Could not update the job.'), 'danger'),
  });

  const trigger = useMutation({
    mutationFn: () => scheduledJobsApi.trigger(job.key),
    onSuccess:  (r) => {
      showToast(r.message, 'success');
      // The run is already under way; give it a moment before reading back.
      setTimeout(onChanged, 2500);
    },
    onError: (e) => showToast(getApiErrorMessage(e, 'Could not start the job.'), 'danger'),
  });

  const failed  = job.lastRunStatus === 'FAILED';
  const running = job.lastRunStatus === 'RUNNING';
  const dot     = !job.isActive ? '#6c757d' : failed ? '#C0392B' : running ? '#F2AA20' : '#1E8449';

  return (
    <div style={{
      border:       '1px solid #e9ecef',
      borderLeft:   `4px solid ${!job.isActive ? '#6c757d' : failed ? '#C0392B' : colour}`,
      borderRadius: '0.5rem',
      marginBottom: 10,
      overflow:     'hidden',
      opacity:      job.isActive ? 1 : 0.75,
      background:   'white',
    }}>
      <div className="d-flex align-items-center gap-3 flex-wrap"
        style={{ padding: '12px 16px', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}
      >
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flexShrink: 0 }} />

        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="d-flex align-items-center gap-2 flex-wrap"
            style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            {job.name}
            {!job.isActive && <Badge bg="secondary" style={{ fontSize: '0.65rem' }}>PAUSED</Badge>}
            {running       && <Badge bg="warning" text="dark" style={{ fontSize: '0.65rem' }}>RUNNING</Badge>}
            {failed        && <Badge bg="danger" style={{ fontSize: '0.65rem' }}>LAST RUN FAILED</Badge>}
            {!job.isRegistered && (
              <Badge bg="dark" style={{ fontSize: '0.65rem' }}>NOT IN THIS BUILD</Badge>
            )}
          </div>
          <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
            {job.cronHuman}
          </div>
        </div>

        <div className="text-muted" style={{ fontSize: '0.75rem', textAlign: 'right', minWidth: 150 }}>
          {job.lastRunAt
            ? <div>Last run {relative(job.lastRunAt)} · {ms(job.lastRunDuration)}</div>
            : <div>Never run</div>}
          {job.isActive && job.nextRunAt && (
            <div style={{ color: '#1B3A6B', fontWeight: 600 }}>Next {relative(job.nextRunAt)}</div>
          )}
        </div>

        <div className="d-flex gap-1" onClick={e => e.stopPropagation()}>
          {canEdit && (
            <>
              <Button
                size="sm"
                variant={job.isActive ? 'outline-secondary' : 'outline-success'}
                disabled={toggle.isPending}
                onClick={() => toggle.mutate()}
              >
                {job.isActive ? 'Pause' : 'Resume'}
              </Button>
              <Button
                size="sm" variant="outline-primary"
                disabled={trigger.isPending || running || !job.isRegistered}
                title={!job.isRegistered
                  ? 'This job has no implementation in this build'
                  : running ? 'Already running' : 'Run now'}
                onClick={() => trigger.mutate()}
              >
                {trigger.isPending ? 'Starting…' : 'Run now'}
              </Button>
            </>
          )}
          <Button size="sm" variant="outline-secondary" onClick={() => setOpen(o => !o)}>
            {open ? '▲' : '▼'}
          </Button>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid #e9ecef', padding: '14px 16px', background: '#F8F9FA' }}>
          <div className="d-flex flex-wrap gap-4 mb-3" style={{ fontSize: '0.78rem' }}>
            <div>
              <span className="text-muted">Cron: </span>
              <code style={{ background: '#e9ecef', padding: '2px 6px', borderRadius: 3 }}>
                {job.cronExpr}
              </code>
            </div>
            <div><span className="text-muted">Total runs: </span>{job.totalRuns}</div>
            <div>
              <span className="text-muted">Failed: </span>
              <span style={{ color: job.totalFailed > 0 ? '#C0392B' : '#1E8449' }}>
                {job.totalFailed}
              </span>
            </div>
            <div>
              <span className="text-muted">Success rate: </span>
              <strong>
                {job.totalRuns > 0
                  ? `${Math.round((1 - job.totalFailed / job.totalRuns) * 100)}%`
                  : '—'}
              </strong>
            </div>
          </div>

          {job.description && (
            <div style={{
              fontSize: '0.78rem', color: '#4A5568', marginBottom: 14,
              padding: '8px 12px', background: 'white',
              borderRadius: '0.375rem', border: '1px solid #e9ecef',
            }}>
              {job.description}
            </div>
          )}

          {job.lastRunError && (
            <Alert variant="danger" className="py-2" style={{ fontSize: '0.78rem' }}>
              <div className="fw-semibold mb-1">Last error</div>
              <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {job.lastRunError}
              </div>
            </Alert>
          )}

          <div className="fw-bold small mb-2">Recent runs</div>
          {job.logs.length === 0 ? (
            <div className="text-muted small">No runs recorded yet.</div>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e9ecef', borderRadius: '0.375rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: 560 }}>
                <thead>
                  <tr style={{ background: '#1B3A6B' }}>
                    {['Started', 'Status', 'Duration', 'Triggered by', 'Result'].map(h => (
                      <th key={h} style={{
                        padding: '6px 10px', color: 'white',
                        fontWeight: 700, fontSize: '0.72rem', textAlign: 'left',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {job.logs.map((log, i) => {
                    const st = STATUS[log.status] ?? STATUS.SKIPPED;
                    return (
                      <tr key={log.id} style={{
                        background: i % 2 === 0 ? 'white' : '#F8F9FA',
                        borderBottom: '1px solid #e9ecef',
                      }}>
                        <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>{stamp(log.startedAt)}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <span style={{ color: st.colour, fontWeight: 600 }}>
                            {st.icon} {log.status}
                          </span>
                        </td>
                        <td style={{ padding: '6px 10px', color: '#6c757d' }}>{ms(log.duration)}</td>
                        <td style={{ padding: '6px 10px' }}>{log.triggeredBy}</td>
                        <td style={{ padding: '6px 10px', maxWidth: 240 }}>
                          {log.error
                            ? <span style={{ color: '#C0392B' }}>{log.error.slice(0, 80)}</span>
                            : log.result
                              ? <span style={{ color: '#1E8449' }}>
                                  {JSON.stringify(log.result).slice(0, 80)}
                                </span>
                              : <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ScheduledJobsPage() {
  const { data: jobs = [], isLoading, isError, error, refetch } = useQuery({
    queryKey:        ['scheduled-jobs'],
    queryFn:         scheduledJobsApi.list,
    // A triggered job finishes while the page is open; without this the
    // operator would be looking at a stale RUNNING row.
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>;
  }
  if (isError) {
    return (
      <div className="p-4">
        <Alert variant="warning">{getApiErrorMessage(error, 'Could not load scheduled jobs.')}</Alert>
      </div>
    );
  }

  const failedCount = jobs.filter(j => j.lastRunStatus === 'FAILED').length;
  const grouped = jobs.reduce<Record<string, ScheduledJobRow[]>>((acc, j) => {
    (acc[j.category] ??= []).push(j);
    return acc;
  }, {});

  const summary = [
    { label: 'Total jobs',      value: jobs.length,                        colour: '#1B3A6B' },
    { label: 'Active',          value: jobs.filter(j => j.isActive).length, colour: '#1E8449' },
    { label: 'Paused',          value: jobs.filter(j => !j.isActive).length, colour: '#6c757d' },
    { label: 'Failed last run', value: failedCount,                        colour: '#C0392B' },
  ];

  return (
    <div className="p-3 p-md-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <div>
          <h5 className="mb-0">Scheduled Jobs</h5>
          <div className="text-muted small">
            Background work the system runs on its own — {jobs.length} registered
          </div>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <Badge bg={failedCount > 0 ? 'danger' : 'success'} style={{ fontSize: '0.82rem', padding: '6px 12px' }}>
            {failedCount > 0
              ? `${failedCount} failed on last run`
              : 'All healthy'}
          </Badge>
          <Button variant="outline-secondary" size="sm" onClick={() => refetch()}>Refresh</Button>
        </div>
      </div>

      <Row className="g-2 mb-4">
        {summary.map(s => (
          <Col key={s.label} md={3} sm={6}>
            <div style={{
              background: 'white', borderRadius: '0.75rem', padding: '14px 16px',
              border: `2px solid ${s.label === 'Failed last run' && s.value > 0 ? '#C0392B' : '#e9ecef'}`,
            }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.colour, lineHeight: 1 }}>
                {s.value}
              </div>
              <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>{s.label}</div>
            </div>
          </Col>
        ))}
      </Row>

      {Object.entries(grouped).map(([key, catJobs]) => {
        const cat = CATEGORY[key] ?? { label: key, icon: '⚙️', colour: '#6c757d' };
        return (
          <div key={key} className="mb-4">
            <div className="d-flex align-items-center gap-2 mb-3"
              style={{ paddingBottom: 8, borderBottom: `2px solid ${cat.colour}` }}>
              <span style={{ fontSize: '1.2rem' }}>{cat.icon}</span>
              <span style={{ fontWeight: 700, color: cat.colour }}>{cat.label}</span>
              <Badge bg="secondary" style={{ fontSize: '0.68rem' }}>
                {catJobs.length} job{catJobs.length === 1 ? '' : 's'}
              </Badge>
            </div>
            {catJobs.map(job => (
              <JobCard key={job.key} job={job} colour={cat.colour} onChanged={refetch} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
