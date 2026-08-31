import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import { useQuery, useMutation } from '@tanstack/react-query';
import { shiftReportsApi, type ShiftReportFilters } from '../../lib/shiftReports.api';
import { useHasPermission } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'secondary', SUBMITTED: 'warning', ACKNOWLEDGED: 'success',
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export default function ShiftReportsListPage() {
  const navigate       = useNavigate();
  const { showToast }  = useToast();
  const canCreate      = useHasPermission('shift_report.create');
  const canAcknowledge = useHasPermission('shift_report.acknowledge');

  const [filters, setFilters] = useState<ShiftReportFilters>({ page: 1, limit: 20 });
  const setFilter = (k: keyof ShiftReportFilters, v: string) =>
    setFilters(p => ({ ...p, [k]: v || undefined, page: 1 }));

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['shift-reports', filters],
    queryFn:  () => shiftReportsApi.list(filters),
  });

  const acknowledge = useMutation({
    mutationFn: (id: string) => shiftReportsApi.acknowledge(id),
    onSuccess:  () => { showToast('Report acknowledged.', 'success'); refetch(); },
    onError:    (err) => showToast(getApiErrorMessage(err, 'Could not acknowledge.'), 'danger'),
  });

  const rows = data?.data ?? [];

  return (
    <div className="p-3 p-md-4">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <div>
          <h5 className="mb-0">Shift Handover Reports</h5>
          <div className="text-muted small">What each Control Room shift handed over</div>
        </div>
        {canCreate && (
          <Button onClick={() => navigate('/control-room/shift-report/new')}>
            New Shift Report
          </Button>
        )}
      </div>

      <Card className="mb-3">
        <Card.Body className="py-3">
          <Row className="g-2 align-items-end">
            <Col md={3} sm={6}>
              <Form.Label className="small fw-semibold mb-1">From</Form.Label>
              <Form.Control type="date" size="sm" value={filters.dateFrom ?? ''}
                onChange={e => setFilter('dateFrom', e.target.value)} />
            </Col>
            <Col md={3} sm={6}>
              <Form.Label className="small fw-semibold mb-1">To</Form.Label>
              <Form.Control type="date" size="sm" value={filters.dateTo ?? ''}
                onChange={e => setFilter('dateTo', e.target.value)} />
            </Col>
            <Col md={2} sm={6}>
              <Form.Label className="small fw-semibold mb-1">Shift</Form.Label>
              <Form.Select size="sm" value={filters.shift ?? ''}
                onChange={e => setFilter('shift', e.target.value)}>
                <option value="">All</option>
                <option value="DAY">Day</option>
                <option value="NIGHT">Night</option>
              </Form.Select>
            </Col>
            <Col md={2} sm={6}>
              <Form.Label className="small fw-semibold mb-1">Status</Form.Label>
              <Form.Select size="sm" value={filters.status ?? ''}
                onChange={e => setFilter('status', e.target.value)}>
                <option value="">All</option>
                <option value="DRAFT">Draft</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
              </Form.Select>
            </Col>
            <Col md={2} sm={6}>
              <Button variant="outline-secondary" size="sm" className="w-100"
                onClick={() => setFilters({ page: 1, limit: 20 })}>
                Clear
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
      ) : isError ? (
        <Alert variant="warning">{getApiErrorMessage(error, 'Could not load reports.')}</Alert>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <Table striped hover responsive className="align-middle small">
              <thead className="table-dark">
                <tr>
                  <th>Report</th><th>Date</th><th>Shift</th><th>Controller</th>
                  <th className="text-center">Incidents</th>
                  <th className="text-center">Absentees</th>
                  <th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/control-room/shift-report/${r.id}`} className="fw-semibold">
                        {r.systemId ?? 'Draft'}
                      </Link>
                    </td>
                    <td>{fmtDate(r.date)}</td>
                    <td>{r.shift === 'NIGHT' ? 'Night' : 'Day'}</td>
                    <td>{r.controllerName}</td>
                    <td className="text-center">{r.totalIncidents}</td>
                    <td className="text-center">{r.totalAbsentees}</td>
                    <td>
                      <Badge bg={STATUS_BADGE[r.status] ?? 'secondary'}>{r.status}</Badge>
                    </td>
                    <td>
                      <div className="d-flex gap-1 flex-wrap">
                        <Button size="sm" variant="outline-secondary"
                          onClick={() => navigate(`/control-room/shift-report/${r.id}`)}>
                          View
                        </Button>
                        <Button size="sm" variant="outline-primary"
                          onClick={() => shiftReportsApi.downloadPdf(
                            r.id, r.systemId ?? `shift-report-${r.id.slice(-6)}`,
                          ).catch(() => showToast('Could not download the PDF.', 'danger'))}>
                          PDF
                        </Button>
                        {r.status === 'SUBMITTED' && canAcknowledge && (
                          <Button size="sm" variant="success"
                            disabled={acknowledge.isPending}
                            onClick={() => acknowledge.mutate(r.id)}>
                            Acknowledge
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center text-muted py-4">
                      No shift reports match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>

          {(data?.pages ?? 1) > 1 && (
            <div className="d-flex justify-content-between align-items-center">
              <span className="text-muted small">
                Page {data?.page} of {data?.pages} — {data?.total} report{data?.total === 1 ? '' : 's'}
              </span>
              <div className="d-flex gap-2">
                <Button size="sm" variant="outline-secondary"
                  disabled={(filters.page ?? 1) <= 1}
                  onClick={() => setFilters(p => ({ ...p, page: (p.page ?? 1) - 1 }))}>
                  Previous
                </Button>
                <Button size="sm" variant="outline-secondary"
                  disabled={(filters.page ?? 1) >= (data?.pages ?? 1)}
                  onClick={() => setFilters(p => ({ ...p, page: (p.page ?? 1) + 1 }))}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
