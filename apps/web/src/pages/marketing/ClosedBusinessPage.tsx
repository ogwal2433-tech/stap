import { useMemo, useState } from 'react';
import { Badge, Button, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import { useProspects } from '../../hooks/useMarketing';
import { marketingApi } from '../../lib/marketing.api';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

const NAVY = '#1B3A6B';

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function ClosedBusinessPage() {
  const { showToast } = useToast();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useProspects({ status: 'WON' });
  const won = data?.data ?? [];

  const filtered = useMemo(() => won.filter((p) => {
    if (!p.wonDate) return false;
    const d = p.wonDate.slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo   && d > dateTo)   return false;
    return true;
  }), [won, dateFrom, dateTo]);

  const totalValue = filtered.reduce((sum, p) => sum + (p.estimatedValue ?? 0), 0);

  const exportExcel = async () => {
    setExporting(true);
    try {
      await marketingApi.exportReport('CLOSED_BUSINESS', {
        dateFrom: dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`).toISOString() : undefined,
        dateTo:   dateTo   ? new Date(`${dateTo}T23:59:59.999Z`).toISOString()   : undefined,
      });
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not export the report.'), 'danger');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <h5 className="fw-bold mb-0" style={{ color: NAVY }}>Closed Business</h5>
          <div className="text-muted small">
            {filtered.length} deal{filtered.length === 1 ? '' : 's'} won ·
            UGX {totalValue.toLocaleString()} monthly value
          </div>
        </div>
        <div className="d-flex gap-2 align-items-end flex-wrap">
          <div>
            <Form.Label className="small mb-0">From</Form.Label>
            <Form.Control size="sm" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <Form.Label className="small mb-0">To</Form.Label>
            <Form.Control size="sm" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <Button size="sm" variant="outline-success" onClick={exportExcel} disabled={exporting}>
            {exporting ? 'Exporting…' : '⬇ Export Excel'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table striped size="sm" className="small">
            <thead className="table-light">
              <tr>
                <th>Company</th><th>Date Won</th>
                <th className="text-end">Contract Value (UGX)</th>
                <th>Marketing Officer</th><th>Converted</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-muted py-4">
                  No business closed in this period.
                </td></tr>
              ) : filtered.map((p) => (
                <tr key={p.id}>
                  <td className="fw-semibold">{p.companyName}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(p.wonDate)}</td>
                  <td className="text-end">{(p.estimatedValue ?? 0).toLocaleString()}</td>
                  <td>{p.assignedTo?.name ?? '—'}</td>
                  <td>
                    {p.convertedClientId
                      ? <Badge bg="success">Client created</Badge>
                      : <Badge bg="warning" text="dark">Not yet converted</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      {filtered.length > 0 && (
        <Row className="mt-3">
          <Col md={4}>
            <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '12px 16px' }}>
              <div className="text-muted small">Total monthly contract value</div>
              <div className="fw-bold" style={{ color: NAVY, fontSize: '1.15rem' }}>
                UGX {totalValue.toLocaleString()}
              </div>
            </div>
          </Col>
        </Row>
      )}
    </div>
  );
}
