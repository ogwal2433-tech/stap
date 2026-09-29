import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Pagination, Spinner, Table } from 'react-bootstrap';
import { useClientDeployments } from '../../hooks/useClients';
import { useHasPermission } from '../../context/AuthContext';

interface ClientDeploymentsProps {
  clientId: string;
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Which guards work for this client, and where.
 *
 * One row per stint rather than per guard: a guard moved between this client's
 * sites shows once per site, which is what makes the start date meaningful —
 * it is the day that posting began, not the day the guard joined the company.
 * Rows with no end date are the live postings and sort first, so the top of the
 * list answers "who is there now" without a filter.
 */
export default function ClientDeployments({ clientId }: ClientDeploymentsProps) {
  const [page, setPage]     = useState(1);
  const [status, setStatus] = useState<'ALL' | 'CURRENT'>('ALL');
  const canOpenGuard = useHasPermission('guards.view');

  const { data, isLoading, isError } = useClientDeployments(clientId, page, status);
  const rows       = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;

  const switchStatus = (next: 'ALL' | 'CURRENT') => {
    setStatus(next);
    setPage(1);
  };

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pages: number[] = [];
    const start = Math.max(1, page - 2);
    const end   = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);

    return (
      <Pagination size="sm" className="mb-0 mt-3 justify-content-center">
        <Pagination.First onClick={() => setPage(1)} disabled={page === 1} />
        <Pagination.Prev onClick={() => setPage((p) => p - 1)} disabled={page === 1} />
        {pages.map((p) => (
          <Pagination.Item key={p} active={p === page} onClick={() => setPage(p)}>
            {p}
          </Pagination.Item>
        ))}
        <Pagination.Next onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} />
        <Pagination.Last onClick={() => setPage(totalPages)} disabled={page === totalPages} />
      </Pagination>
    );
  };

  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <div className="fw-bold text-navy">Deployments</div>
          {pagination && (
            <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
              {pagination.total} record{pagination.total === 1 ? '' : 's'}
              {status === 'ALL' && ' across this client’s sites'}
            </div>
          )}
        </div>
        <div className="d-flex gap-2">
          {(['CURRENT', 'ALL'] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={status === s ? 'primary' : 'outline-secondary'}
              style={{ fontSize: '0.75rem' }}
              onClick={() => switchStatus(s)}
            >
              {s === 'CURRENT' ? 'On post now' : 'All history'}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-4">
          <Spinner size="sm" className="me-2" />
          <span className="text-muted small">Loading deployments…</span>
        </div>
      ) : isError ? (
        <div className="text-muted small">Deployments could not be loaded.</div>
      ) : rows.length === 0 ? (
        <div className="text-muted small py-3">
          {status === 'CURRENT'
            ? 'No guard is posted at this client’s sites right now.'
            : 'No deployment recorded for this client yet.'}
        </div>
      ) : (
        <>
          <Table size="sm" hover responsive className="align-middle small">
            <thead className="table-light">
              <tr>
                <th>Guard</th>
                <th>Site</th>
                <th>Start Date</th>
                <th>Supervisor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    {canOpenGuard ? (
                      <Link to={`/guards/${d.guard.id}`} className="text-decoration-none fw-semibold">
                        {d.guard.fullName}
                      </Link>
                    ) : (
                      <span className="fw-semibold">{d.guard.fullName}</span>
                    )}
                    <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>
                      {[d.guard.systemId, d.guard.rank].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td>{d.site.siteName}</td>
                  <td className="text-nowrap">{fmtDay(d.startDate)}</td>
                  <td>{d.supervisor.name}</td>
                  <td>
                    {d.endDate ? (
                      <div>
                        <Badge bg="secondary">Ended</Badge>
                        <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>{fmtDay(d.endDate)}</div>
                      </div>
                    ) : (
                      <Badge bg="success">On post</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {renderPagination()}
        </>
      )}
    </>
  );
}
