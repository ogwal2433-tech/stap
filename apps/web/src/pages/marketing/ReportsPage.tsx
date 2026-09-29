import { useState } from 'react';
import { Alert, Button, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import { MARKETING_REPORT_TYPES, type MarketingReportType } from '@security360/shared';
import { useMarketingReport } from '../../hooks/useMarketing';
import { marketingApi } from '../../lib/marketing.api';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

const NAVY = '#1B3A6B';

export default function ReportsPage() {
  const { showToast } = useToast();
  const [type, setType]         = useState<MarketingReportType>('PIPELINE');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [exporting, setExporting] = useState(false);

  const params = {
    dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`).toISOString() : undefined,
    dateTo:   dateTo   ? new Date(`${dateTo}T23:59:59.999Z`).toISOString()   : undefined,
  };

  const { data: report, isLoading, error } = useMarketingReport(type, params);

  const exportExcel = async () => {
    setExporting(true);
    try {
      await marketingApi.exportReport(type, params);
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not export the report.'), 'danger');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h5 className="fw-bold mb-3" style={{ color: NAVY }}>Reports</h5>

      <div className="d-flex gap-2 flex-wrap mb-3">
        {MARKETING_REPORT_TYPES.map((r) => (
          <Button
            key={r.value}
            size="sm"
            variant={type === r.value ? 'primary' : 'outline-primary'}
            style={type === r.value ? { background: NAVY, borderColor: NAVY } : undefined}
            onClick={() => setType(r.value)}
          >
            {r.label}
          </Button>
        ))}
      </div>

      <Row className="g-2 align-items-end mb-3">
        <Col xs={6} sm={3}>
          <Form.Label className="small mb-0">From</Form.Label>
          <Form.Control size="sm" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Col>
        <Col xs={6} sm={3}>
          <Form.Label className="small mb-0">To</Form.Label>
          <Form.Control size="sm" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Col>
        <Col xs="auto">
          <Button size="sm" variant="outline-secondary" onClick={() => { setDateFrom(''); setDateTo(''); }}>
            Clear
          </Button>
        </Col>
        <Col xs="auto">
          <Button size="sm" variant="outline-success" onClick={exportExcel} disabled={exporting || !report}>
            {exporting ? 'Exporting…' : '⬇ Export Excel'}
          </Button>
        </Col>
      </Row>

      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : error ? (
        <Alert variant="danger" className="py-2 small">
          {getApiErrorMessage(error, 'Could not load the report.')}
        </Alert>
      ) : !report ? null : (
        <>
          <div className="d-flex align-items-baseline gap-3 flex-wrap mb-2">
            <div className="fw-bold" style={{ color: NAVY }}>{report.title}</div>
            {report.summary.map((s) => (
              <span key={s.label} className="small">
                <span className="text-muted">{s.label}:</span> <strong>{s.value}</strong>
              </span>
            ))}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <Table striped bordered size="sm" className="small">
              <thead>
                <tr style={{ background: NAVY }}>
                  {report.columns.map((c, i) => (
                    <th key={c} style={{
                      color: 'white', fontWeight: 700, fontSize: '0.74rem',
                      padding: '7px 9px', whiteSpace: 'nowrap',
                      textAlign: i === 0 ? 'left' : 'right',
                    }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.rows.length === 0 ? (
                  <tr>
                    <td colSpan={report.columns.length} className="text-center text-muted py-4">
                      Nothing to report for this period.
                    </td>
                  </tr>
                ) : report.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ textAlign: ci === 0 ? 'left' : 'right', whiteSpace: 'nowrap' }}>
                        {typeof cell === 'number' ? cell.toLocaleString() : cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>

          <div className="text-muted" style={{ fontSize: '0.72rem' }}>
            Generated {new Date(report.generatedAt).toLocaleString('en-GB')}
          </div>
        </>
      )}
    </div>
  );
}
