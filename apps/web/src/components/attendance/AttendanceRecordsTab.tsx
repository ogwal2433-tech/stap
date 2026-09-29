import { useMemo, useState } from 'react';
import { Alert, Badge, Button, Col, Form, Pagination, Row, Spinner, Table } from 'react-bootstrap';
import {
  ATTENDANCE_STATUS_CONFIG, ATTENDANCE_STATUS_VALUES,
  type AttendanceStatusValue, type SiteResponse,
} from '@security360/shared';
import { useAttendance, useGuardAttendanceSummary } from '../../hooks/useAttendance';
import { useAllSites } from '../../hooks/useClients';
import { useToast } from '../../context/ToastContext';
import { exportAttendanceSummary } from '../../lib/exportToExcel';
import { getApiErrorMessage } from '../../lib/api';
import { useCompanyBranding } from '../../hooks/useCompanyBranding';

const iso = (d: Date) => d.toISOString().slice(0, 10);

const shiftDays = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
};

/** Preset ranges, matching how supervisors actually ask for the data. */
const QUICK_RANGES: { label: string; range: () => [string, string] }[] = [
  { label: 'Today',       range: () => [iso(new Date()), iso(new Date())] },
  { label: 'Yesterday',   range: () => [shiftDays(-1), shiftDays(-1)] },
  { label: 'Last 7 days', range: () => [shiftDays(-6), iso(new Date())] },
  { label: 'Last 30 days', range: () => [shiftDays(-29), iso(new Date())] },
  {
    label: 'This month',
    range: () => {
      const d = new Date();
      return [iso(new Date(d.getFullYear(), d.getMonth(), 1)), iso(new Date())];
    },
  },
  {
    label: 'Last month',
    range: () => {
      const d = new Date();
      return [
        iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)),
        iso(new Date(d.getFullYear(), d.getMonth(), 0)),
      ];
    },
  },
];

const PAGE_SIZE = 50;

export default function AttendanceRecordsTab() {
  const { showToast } = useToast();
  const { data: companyBranding } = useCompanyBranding();

  const defaultFrom = shiftDays(-6);
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo]     = useState(iso(new Date()));
  const [siteId, setSiteId]     = useState('');
  const [status, setStatus]     = useState<'' | AttendanceStatusValue>('');
  const [page, setPage]         = useState(1);
  const [exporting, setExporting] = useState(false);

  const rangeInvalid = dateFrom > dateTo;

  const { data: sites = [] } = useAllSites();

  const { data, isLoading, isError, error } = useAttendance(
    rangeInvalid ? undefined : {
      dateFrom, dateTo, page, limit: PAGE_SIZE,
      ...(siteId ? { siteId } : {}),
      ...(status ? { status } : {}),
    },
  );

  const records    = data?.data ?? [];
  const pagination = data?.pagination;

  const dayCount = useMemo(() => {
    if (rangeInvalid) return 0;
    return Math.round(
      (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86_400_000,
    ) + 1;
  }, [dateFrom, dateTo, rangeInvalid]);

  // Loaded lazily — only fetched when the range is valid, and reused by Export.
  const { data: summary, isFetching: summaryLoading } =
    useGuardAttendanceSummary(rangeInvalid ? '' : dateFrom, rangeInvalid ? '' : dateTo, siteId || undefined);

  const applyRange = (from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
    setPage(1);
  };

  const clearFilters = () => {
    applyRange(defaultFrom, iso(new Date()));
    setSiteId('');
    setStatus('');
  };

  const handleExport = () => {
    if (rangeInvalid) {
      showToast('The end date cannot be before the start date.', 'danger');
      return;
    }
    if (!summary) {
      showToast('The summary is still loading — try again in a moment.', 'danger');
      return;
    }
    setExporting(true);
    try {
      exportAttendanceSummary(summary, companyBranding.company_name);
      showToast(`Exported ${summary.guardCount} guard(s) for the selected period.`, 'success');
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not build the Excel file.'), 'danger');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      {/* Header + export */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <div className="fw-bold" style={{ color: '#1B3A6B' }}>Attendance Records</div>
          <div className="text-muted small">Deployment attendance across a date range</div>
        </div>
        <Button
          variant="success"
          size="sm"
          onClick={handleExport}
          disabled={exporting || summaryLoading || rangeInvalid}
        >
          {exporting || summaryLoading
            ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Preparing…</>
            : 'Export to Excel'}
        </Button>
      </div>

      {/* Filters */}
      <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '12px 16px', marginBottom: '16px' }}>
        <div className="d-flex flex-wrap gap-1 mb-3">
          {QUICK_RANGES.map(q => {
            const [f, t] = q.range();
            const active = f === dateFrom && t === dateTo;
            return (
              <button
                key={q.label}
                type="button"
                onClick={() => applyRange(f, t)}
                style={{
                  padding: '4px 12px', borderRadius: '999px', cursor: 'pointer',
                  fontSize: '0.78rem', fontWeight: 500,
                  border: `1px solid ${active ? '#1B3A6B' : '#ced4da'}`,
                  background: active ? '#1B3A6B' : '#fff',
                  color: active ? '#fff' : '#1B3A6B',
                }}
              >
                {q.label}
              </button>
            );
          })}
        </div>

        <Row className="g-2 align-items-end">
          <Col md={2} sm={6}>
            <Form.Label className="fw-bold small mb-1">From date</Form.Label>
            <Form.Control
              type="date" size="sm" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }}
              isInvalid={rangeInvalid}
            />
          </Col>
          <Col md={2} sm={6}>
            <Form.Label className="fw-bold small mb-1">To date</Form.Label>
            <Form.Control
              type="date" size="sm" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }}
              isInvalid={rangeInvalid}
            />
          </Col>
          <Col md={3} sm={6}>
            <Form.Label className="fw-bold small mb-1">Site</Form.Label>
            <Form.Select size="sm" value={siteId} onChange={e => { setSiteId(e.target.value); setPage(1); }}>
              <option value="">All sites</option>
              {sites.map((s: SiteResponse) => <option key={s.id} value={s.id}>{s.siteName}</option>)}
            </Form.Select>
          </Col>
          <Col md={2} sm={6}>
            <Form.Label className="fw-bold small mb-1">Status</Form.Label>
            <Form.Select
              size="sm" value={status}
              onChange={e => { setStatus(e.target.value as '' | AttendanceStatusValue); setPage(1); }}
            >
              <option value="">All statuses</option>
              {ATTENDANCE_STATUS_VALUES.map(s => (
                <option key={s} value={s}>
                  {ATTENDANCE_STATUS_CONFIG[s].icon} {ATTENDANCE_STATUS_CONFIG[s].label}
                </option>
              ))}
            </Form.Select>
          </Col>
          <Col md={2}>
            <Button size="sm" variant="outline-secondary" onClick={clearFilters}>Clear</Button>
          </Col>
        </Row>

        <div className="mt-2 small text-muted">
          {rangeInvalid ? (
            <span className="text-danger fw-semibold">The end date is before the start date.</span>
          ) : (
            <>
              Showing <strong>{new Date(dateFrom).toLocaleDateString('en-GB')} → {new Date(dateTo).toLocaleDateString('en-GB')}</strong>
              {' '}· {dayCount} day{dayCount === 1 ? '' : 's'}
              {pagination ? ` · ${pagination.total} record${pagination.total === 1 ? '' : 's'}` : ''}
            </>
          )}
        </div>
      </div>

      {/* Period totals — from the summary, so they cover the whole range not just this page */}
      {summary && !rangeInvalid && (
        <Row className="g-2 mb-3">
          {ATTENDANCE_STATUS_VALUES.map(s => {
            const key = `${s.toLowerCase().replace('_', '')}Days` as const;
            const total = summary.summary.reduce((acc, g) => {
              const map: Record<AttendanceStatusValue, number> = {
                PRESENT: g.presentDays, LATE: g.lateDays, SICK: g.sickDays,
                ON_LEAVE: g.onLeaveDays, ABSENT: g.absentDays, AWOL: g.awolDays,
              };
              return acc + map[s];
            }, 0);
            void key;
            return (
              <Col key={s} xs={6} md={2}>
                <div style={{
                  background: '#fff', border: '1px solid #e9ecef',
                  borderLeft: `3px solid ${ATTENDANCE_STATUS_CONFIG[s].bg}`,
                  borderRadius: '0.5rem', padding: '8px 12px',
                }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1B3A6B' }}>
                    {ATTENDANCE_STATUS_CONFIG[s].icon} {total}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.74rem' }}>
                    {ATTENDANCE_STATUS_CONFIG[s].label} days
                  </div>
                </div>
              </Col>
            );
          })}
        </Row>
      )}

      {/* Records */}
      {rangeInvalid ? null : isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
      ) : isError ? (
        <Alert variant="danger" className="py-2 small">
          {getApiErrorMessage(error, 'Could not load attendance records.')}
        </Alert>
      ) : records.length === 0 ? (
        <Alert variant="light">No attendance recorded for this period.</Alert>
      ) : (
        <>
          <Table size="sm" hover responsive className="align-middle small">
            <thead className="table-light">
              <tr>
                <th>Date</th>
                <th>Guard</th>
                <th>Site</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => {
                const cfg = ATTENDANCE_STATUS_CONFIG[r.status];
                return (
                  <tr key={r.id}>
                    <td className="fw-semibold">
                      {new Date(r.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </td>
                    <td>
                      <div className="fw-semibold">{r.guard.fullName}</div>
                    </td>
                    <td>{r.site.siteName}</td>
                    <td>
                      <Badge
                        bg="light"
                        text="dark"
                        style={{ background: cfg?.bg ?? '#e9ecef', border: '1px solid rgba(0,0,0,0.06)' }}
                      >
                        {cfg ? `${cfg.icon} ${cfg.label}` : r.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          {pagination && pagination.totalPages > 1 && (
            <Pagination size="sm" className="justify-content-center">
              <Pagination.Prev disabled={!pagination.hasPrev} onClick={() => setPage(p => p - 1)} />
              <Pagination.Item active>{pagination.page} of {pagination.totalPages}</Pagination.Item>
              <Pagination.Next disabled={!pagination.hasNext} onClick={() => setPage(p => p + 1)} />
            </Pagination>
          )}
        </>
      )}
    </div>
  );
}
