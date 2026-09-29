import { useState } from 'react';
import { Badge, Button, Col, Container, Form, Row, Spinner } from 'react-bootstrap';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import type { AuditLogEntry } from '@security360/shared';
import { auditLogsApi } from '../../lib/auditLogs.api';
import { settingsApi } from '../../lib/settings.api';
import AuditLogDetailModal from '../../components/system/AuditLogDetailModal';

const PAGE_SIZE = 50;

const TH: React.CSSProperties = {
  padding: '10px 12px', color: 'white', fontWeight: 700,
  fontSize: '0.78rem', textAlign: 'left', whiteSpace: 'nowrap',
};

/**
 * Colour by what the action does, not by which module it came from — an
 * eighty-value lookup would go stale the moment someone adds an action.
 */
function actionColour(action: string): string {
  if (/(_DELETED|_DEACTIVATED|_CANCELLED|_REJECTED|FAILURE|_WITHDRAWN)$/.test(action)) return '#C0392B';
  if (/(_APPROVED|_COMPLETED|_RESOLVED|_SUCCESS|_CONFIRMED|_VERIFIED)$/.test(action)) return '#1E8449';
  if (/(_CREATED|_SUBMITTED|_REGISTERED|_GENERATED|_SENT|_ISSUED)$/.test(action))     return '#1B3A6B';
  if (/(_UPDATED|_EDITED|_CHANGED|_ADJUSTED|_SET)$/.test(action))                     return '#E8701A';
  if (/(_TRANSFERRED|_DISPATCHED|_DEPLOYED|_MOVED|_COPIED|_CONVERTED)$/.test(action)) return '#0F7B6C';
  if (/(LOGIN|TOKEN|PASSWORD|AUTH)/.test(action))                                     return '#6C3483';
  return '#6c757d';
}

const fmtDay  = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Chronological record of every action the system recorded. */
export default function AuditLogPage() {
  const [action,      setAction]      = useState('');
  const [entity,      setEntity]      = useState('');
  const [userId,      setUserId]      = useState('');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [search,      setSearch]      = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page,        setPage]        = useState(1);
  const [selected,    setSelected]    = useState<AuditLogEntry | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['audit-logs', { action, entity, userId, dateFrom, dateTo, search, page }],
    queryFn:  () => auditLogsApi.list({
      ...(action   ? { action }   : {}),
      ...(entity   ? { entity }   : {}),
      ...(userId   ? { userId }   : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo   ? { dateTo }   : {}),
      ...(search   ? { search }   : {}),
      page,
      limit: PAGE_SIZE,
    }),
    // Keeps the table on screen while a new page loads instead of flashing empty.
    placeholderData: keepPreviousData,
  });

  const { data: usersRes } = useQuery({
    queryKey: ['audit-log-users'],
    queryFn:  () => settingsApi.listUsers({ limit: 200 }),
    staleTime: 5 * 60_000,
  });
  const users = usersRes?.data ?? [];

  const logs      = data?.data ?? [];
  const filtered  = !!(action || entity || userId || dateFrom || dateTo || search);
  const firstRow  = data && data.total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastRow   = Math.min(page * PAGE_SIZE, data?.total ?? 0);

  const applySearch = () => { setSearch(searchInput.trim()); setPage(1); };
  const clearAll = () => {
    setAction(''); setEntity(''); setUserId('');
    setDateFrom(''); setDateTo(''); setSearch(''); setSearchInput(''); setPage(1);
  };

  return (
    <Container fluid className="py-4">
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <h5 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>🔍 Audit Log</h5>
          <div className="text-muted small">Who did what, when, and to which record</div>
        </div>
        {data && (
          <div className="text-muted small">
            {data.total.toLocaleString()} {filtered ? 'matching' : 'total'} entr{data.total === 1 ? 'y' : 'ies'}
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '14px 16px', marginBottom: 16 }}>
        <div className="d-flex gap-2 mb-2">
          <Form.Control
            size="sm"
            placeholder="Search by action, entity or record ID…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applySearch(); }}
          />
          <Button size="sm" variant="primary" onClick={applySearch}>Search</Button>
          <Button size="sm" variant="outline-secondary" disabled={!filtered} onClick={clearAll}>Clear</Button>
        </div>

        <Row className="g-2">
          <Col md={3} sm={6}>
            <Form.Select size="sm" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
              <option value="">All actions</option>
              {data?.actionTypes.map((a) => (
                <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
              ))}
            </Form.Select>
          </Col>
          <Col md={3} sm={6}>
            <Form.Select size="sm" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
              <option value="">All entities</option>
              {data?.entityTypes.map((e) => (
                <option key={e} value={e}>{e.replace(/_/g, ' ')}</option>
              ))}
            </Form.Select>
          </Col>
          <Col md={2} sm={6}>
            <Form.Select size="sm" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }}>
              <option value="">All users</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Form.Select>
          </Col>
          <Col md={2} sm={6}>
            <Form.Control type="date" size="sm" value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
          </Col>
          <Col md={2} sm={6}>
            <Form.Control type="date" size="sm" value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
          </Col>
        </Row>
      </div>

      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
      ) : logs.length === 0 ? (
        <div style={{
          border: '2px dashed #ced4da', borderRadius: '0.5rem',
          padding: '40px', textAlign: 'center', color: '#6c757d',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
          <div className="fw-bold mb-1">No audit entries found</div>
          <div style={{ fontSize: '0.82rem' }}>
            {filtered ? 'Nothing matches these filters — try clearing them.' : 'Nothing has been recorded yet.'}
          </div>
        </div>
      ) : (
        <>
          <div style={{
            border: '1px solid #e9ecef', borderRadius: '0.5rem', overflowX: 'auto',
            opacity: isFetching ? 0.6 : 1, transition: 'opacity 0.15s ease',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#1B3A6B' }}>
                  <th style={TH}>When</th>
                  <th style={TH}>Action</th>
                  <th style={TH}>Entity</th>
                  <th style={TH}>Record</th>
                  <th style={TH}>Performed by</th>
                  <th style={{ ...TH, width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const colour = actionColour(log.action);
                  return (
                    <tr key={log.id} style={{
                      background: i % 2 === 0 ? '#fff' : '#F8F9FA',
                      borderBottom: '1px solid #e9ecef',
                    }}>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                        <div style={{ color: '#4A5568' }}>{fmtDay(log.createdAt)}</div>
                        <div style={{ color: '#adb5bd' }}>{fmtTime(log.createdAt)}</div>
                      </td>

                      <td style={{ padding: '9px 12px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          background: `${colour}18`, border: `1px solid ${colour}40`,
                          borderRadius: '0.375rem', padding: '3px 8px',
                        }}>
                          <span style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: colour, flexShrink: 0,
                          }} />
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: colour, whiteSpace: 'nowrap' }}>
                            {log.action.replace(/_/g, ' ')}
                          </span>
                        </span>
                      </td>

                      <td style={{ padding: '9px 12px', fontSize: '0.78rem', color: '#4A5568', fontWeight: 500 }}>
                        {log.entity?.replace(/_/g, ' ') ?? '—'}
                      </td>

                      <td style={{ padding: '9px 12px' }}>
                        {log.entityId ? (
                          <code
                            title={log.entityId}
                            style={{
                              background: '#F2F4F7', padding: '2px 6px',
                              borderRadius: 3, fontSize: '0.72rem', color: '#1B3A6B',
                            }}
                          >
                            {log.entityId.slice(0, 10)}…
                          </code>
                        ) : <span style={{ color: '#adb5bd' }}>—</span>}
                      </td>

                      <td style={{ padding: '9px 12px' }}>
                        {log.performedBy ? (
                          <>
                            <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>{log.performedBy.name}</div>
                            <div className="text-muted" style={{ fontSize: '0.68rem' }}>
                              {log.performedBy.role.replace(/_/g, ' ')}
                            </div>
                          </>
                        ) : (
                          <Badge bg="light" text="dark" style={{ fontSize: '0.68rem', fontWeight: 500 }}>
                            System
                          </Badge>
                        )}
                      </td>

                      <td style={{ padding: '9px 12px' }}>
                        <Button
                          size="sm"
                          variant="outline-secondary"
                          style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                          onClick={() => setSelected(log)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
            <div className="text-muted small">
              Showing {firstRow.toLocaleString()}–{lastRow.toLocaleString()} of {(data?.total ?? 0).toLocaleString()}
            </div>
            <div className="d-flex gap-2 align-items-center">
              <Button size="sm" variant="outline-secondary" disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}>← Prev</Button>
              <span className="text-muted small">Page {page} of {data?.pages ?? 1}</span>
              <Button size="sm" variant="outline-secondary" disabled={page >= (data?.pages ?? 1)}
                onClick={() => setPage((p) => p + 1)}>Next →</Button>
            </div>
          </div>
        </>
      )}

      {selected && (
        <AuditLogDetailModal show log={selected} onClose={() => setSelected(null)} />
      )}
    </Container>
  );
}
