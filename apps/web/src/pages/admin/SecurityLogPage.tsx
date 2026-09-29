import { useState } from 'react';
import { Alert, Badge, Button, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { SECURITY_ACTIONS, SECURITY_ACTION_LABELS, type SecurityAction } from '@security360/shared';
import { auditLogsApi, type SecurityLogFilters } from '../../lib/auditLogs.api';
import { useRoles } from '../../hooks/useRoles';
import { getApiErrorMessage } from '../../lib/api';

const NAVY = '#1B3A6B';
const RED  = '#C0392B';

/** Denials in red, token trouble in amber, the rest neutral. */
function eventVariant(action: string): string {
  if (/DENIED/.test(action) && !/^LOGIN/.test(action)) return 'danger';
  if (action === 'INVALID_TOKEN') return 'warning';
  if (/^LOGIN/.test(action)) return 'dark';
  return 'secondary';
}

const label = (action: string) => SECURITY_ACTION_LABELS[action as SecurityAction] ?? action.replace(/_/g, ' ');
const pretty = (role: string | null) => (role ? role.replace(/_/g, ' ') : 'Not signed in');
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/**
 * Who tried to reach what they may not, and who failed to sign in — each row
 * with the role at the time and the permission or role it lacked. Refreshes
 * itself every 30 seconds.
 */
export default function SecurityLogPage() {
  const [filters, setFilters] = useState<SecurityLogFilters>({ page: 1 });
  const set = (patch: Partial<SecurityLogFilters>) =>
    setFilters((p) => ({ ...p, ...patch, page: patch.page ?? 1 }));

  const { data: roles = [] } = useRoles();
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey:        ['security-log', filters],
    queryFn:         () => auditLogsApi.security(filters),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const page = filters.page ?? 1;

  return (
    <div className="p-3 p-md-4">
      <div className="d-flex justify-content-between align-items-start mb-3 gap-2">
        <div>
          <h4 className="fw-bold mb-1" style={{ color: NAVY }}>Security Log</h4>
          <div className="text-muted small">
            Refused requests and failed sign-ins — who, when, from which role, and what they lacked.
            Repeats of the same event are recorded once a minute.
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          {isFetching && <Spinner animation="border" size="sm" />}
          <Badge bg="danger" style={{ fontSize: '0.78rem' }}>{data?.total ?? 0} events</Badge>
        </div>
      </div>

      {data && (
        <>
          <div className="small text-muted mb-2">Denials by role, last {data.summary.days} days</div>
          <Row className="g-3 mb-3">
            {data.summary.byRole.length === 0 && (
              <Col><div className="small text-muted">No denials in that time.</div></Col>
            )}
            {data.summary.byRole.map((r) => (
              <Col key={r.role ?? 'none'} md={3} sm={6}>
                <div style={{
                  background: 'white', borderRadius: '0.5rem', padding: '12px 16px',
                  border: '1px solid #e9ecef', borderLeft: `3px solid ${RED}`,
                }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: RED }}>{r.count}</div>
                  <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>{pretty(r.role)}</div>
                </div>
              </Col>
            ))}
          </Row>
          {data.summary.byAction.length > 0 && (
            <div className="d-flex flex-wrap gap-2 mb-3">
              {data.summary.byAction.map((a) => (
                <Badge key={a.action} bg={eventVariant(a.action)} className="fw-normal">
                  {label(a.action)}: {a.count}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}

      <div className="d-flex flex-wrap gap-2 mb-3">
        <Form.Select size="sm" style={{ width: 'auto' }} aria-label="Event"
          value={filters.action ?? ''} onChange={(e) => set({ action: e.target.value || undefined })}>
          <option value="">All events</option>
          {SECURITY_ACTIONS.map((a) => <option key={a} value={a}>{label(a)}</option>)}
        </Form.Select>
        <Form.Select size="sm" style={{ width: 'auto' }} aria-label="Role"
          value={filters.role ?? ''} onChange={(e) => set({ role: e.target.value || undefined })}>
          <option value="">All roles</option>
          {roles.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
        </Form.Select>
        <Form.Control size="sm" type="date" style={{ width: 'auto' }} aria-label="From"
          value={filters.dateFrom ?? ''} onChange={(e) => set({ dateFrom: e.target.value || undefined })} />
        <Form.Control size="sm" type="date" style={{ width: 'auto' }} aria-label="To"
          value={filters.dateTo ?? ''} onChange={(e) => set({ dateTo: e.target.value || undefined })} />
        <Button size="sm" variant="outline-secondary" onClick={() => setFilters({ page: 1 })}>Clear</Button>
      </div>

      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : isError ? (
        <Alert variant="warning">{getApiErrorMessage(error, 'Could not load the security log.')}</Alert>
      ) : (
        <div style={{ overflowX: 'auto', background: 'white', borderRadius: '0.75rem', border: '1px solid #e9ecef' }}>
          <Table hover size="sm" className="align-middle mb-0" style={{ fontSize: '0.78rem' }}>
            <thead style={{ background: NAVY }}>
              <tr>
                {['Time', 'Event', 'User', 'Role', 'Lacked', 'Request', 'IP address'].map((h) => (
                  <th key={h} style={{ background: NAVY, color: 'white', padding: '10px 12px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.data.length === 0 && (
                <tr><td colSpan={7} className="text-center text-muted py-4">No security events match these filters.</td></tr>
              )}
              {data?.data.map((e) => (
                <tr key={e.id}>
                  <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{when(e.createdAt)}</td>
                  <td><Badge bg={eventVariant(e.action)} className="fw-semibold">{label(e.action)}</Badge></td>
                  <td>
                    {e.user ? (
                      <>
                        <div className="fw-semibold">{e.user.name}</div>
                        <div className="text-muted" style={{ fontSize: '0.68rem' }}>{e.user.email}</div>
                      </>
                    ) : (
                      <span className="text-muted fst-italic">Not signed in</span>
                    )}
                  </td>
                  <td>{e.role ? pretty(e.role) : '—'}</td>
                  <td style={{ fontFamily: 'monospace', color: RED }} title={e.reason ?? undefined}>
                    {e.required ?? e.reason ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'monospace' }}>
                    {e.method && <span className="fw-bold me-1" style={{ color: NAVY }}>{e.method}</span>}
                    {e.path ?? '—'}
                  </td>
                  <td style={{ fontFamily: 'monospace' }} className="text-muted">{e.ipAddress ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="d-flex justify-content-center align-items-center gap-2 mt-3">
          <Button size="sm" variant="outline-secondary" disabled={page <= 1} onClick={() => set({ page: page - 1 })}>← Previous</Button>
          <span className="small text-muted">Page {page} of {data.pages}</span>
          <Button size="sm" variant="outline-secondary" disabled={page >= data.pages} onClick={() => set({ page: page + 1 })}>Next →</Button>
        </div>
      )}
    </div>
  );
}
