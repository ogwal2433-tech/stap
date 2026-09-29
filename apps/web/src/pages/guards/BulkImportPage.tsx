import { useState, useRef, useCallback } from 'react';
import { APP_NAME } from '../../lib/branding';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import {
  Alert, Badge, Breadcrumb, Button, Card, Col,
  ProgressBar, Row, Spinner, Table,
} from 'react-bootstrap';
import { useDownloadTemplate, useBulkImport } from '../../hooks/useGuards';
import { useToast } from '../../context/ToastContext';
import type { BulkImportResult } from '@security360/shared';

const NAVY = '#1B3A6B';
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const STATUS_BADGE: Record<string, string> = {
  SUCCESS: 'success',
  ERROR:   'danger',
  SKIPPED: 'warning',
};

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function BulkImportPage() {
  const navigate   = useNavigate();
  const { showToast } = useToast();

  const [templateDone, setTemplateDone]   = useState(false);
  const [file, setFile]                   = useState<File | null>(null);
  const [preview, setPreview]             = useState<string[][]>([]);
  const [dragOver, setDragOver]           = useState(false);
  const [result, setResult]               = useState<BulkImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = useDownloadTemplate();
  const bulkImport       = useBulkImport();

  // ── File handling ────────────────────────────────────────────────────────────

  const handleFile = useCallback((f: File) => {
    if (!f.name.match(/\.xlsx?$/i)) {
      showToast('Only .xlsx or .xls files are allowed', 'warning');
      return;
    }
    if (f.size > MAX_SIZE) {
      showToast('File exceeds 10 MB limit', 'warning');
      return;
    }
    setFile(f);

    // Client-side preview of first 5 data rows
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
          header: 1,
          range:  2,
          defval: '',
        }) as string[][];
        setPreview(rows.slice(0, 5));
      } catch {
        showToast('Could not parse file for preview', 'warning');
      }
    };
    reader.readAsArrayBuffer(f);
  }, [showToast]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleDownload = async () => {
    try {
      await downloadTemplate.mutateAsync();
      setTemplateDone(true);
    } catch {
      showToast('Failed to download template', 'danger');
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    try {
      const data = await bulkImport.mutateAsync(file);
      setResult(data);
    } catch {
      showToast('Upload failed. Please try again.', 'danger');
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="py-4 px-3" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Breadcrumb */}
      <Breadcrumb className="mb-3 small">
        <Breadcrumb.Item onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer' }}>
          Dashboard
        </Breadcrumb.Item>
        <Breadcrumb.Item onClick={() => navigate('/guards')} style={{ cursor: 'pointer' }}>
          Guards
        </Breadcrumb.Item>
        <Breadcrumb.Item active>Bulk Import</Breadcrumb.Item>
      </Breadcrumb>

      <h4 className="fw-bold mb-4" style={{ color: NAVY }}>Bulk Guard Import</h4>

      {result ? (
        /* ── Step 3: Results ─────────────────────────────────────────────────── */
        <>
          <Row className="g-3 mb-4">
            {[
              { label: 'Total Rows',  value: result.totalRows,   bg: 'primary' },
              { label: 'Successful',  value: result.successful,  bg: 'success' },
              { label: 'Failed',      value: result.failed,      bg: 'danger'  },
              { label: 'Skipped',     value: result.skipped,     bg: 'warning' },
            ].map(({ label, value, bg }) => (
              <Col xs={6} md={3} key={label}>
                <Card className="text-center border-0 shadow-sm h-100">
                  <Card.Body>
                    <div className="fs-2 fw-bold">
                      <Badge bg={bg} className="px-3 py-2">{value}</Badge>
                    </div>
                    <div className="small text-muted mt-1">{label}</div>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>

          {result.successful > 0 && (
            <Alert variant="success" className="mb-3">
              ✅ {result.successful} guard{result.successful !== 1 ? 's' : ''} imported successfully.
            </Alert>
          )}

          {result.failed > 0 && (
            <Alert variant="danger" className="mb-3">
              ❌ {result.failed} row{result.failed !== 1 ? 's' : ''} had errors and were not imported.
            </Alert>
          )}

          {result.results.length > 0 && (
            <Card className="border-0 shadow-sm mb-4">
              <Card.Header className="bg-white fw-semibold">Row Details</Card.Header>
              <div style={{ overflowX: 'auto' }}>
                <Table striped size="sm" className="mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Row #</th>
                      <th>Name</th>
                      <th>National ID</th>
                      <th>Status</th>
                      <th>Errors / Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((r) => (
                      <tr key={r.rowNumber}>
                        <td>{r.rowNumber}</td>
                        <td>{r.guardName ?? '—'}</td>
                        <td className="text-monospace small">{String(r.data.nationalId ?? '—')}</td>
                        <td>
                          <Badge bg={STATUS_BADGE[r.status] ?? 'secondary'}>
                            {r.status}
                          </Badge>
                        </td>
                        <td className="small text-muted">
                          {r.errors.join('; ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              {result.downloadUrl && (
                <Card.Footer className="bg-white">
                  <Button
                    size="sm"
                    variant="outline-danger"
                    href={result.downloadUrl}
                    target="_blank"
                  >
                    Download Error Report
                  </Button>
                </Card.Footer>
              )}
            </Card>
          )}

          <div className="d-flex gap-2">
            <Button variant="outline-primary" onClick={handleReset}>
              Import More Guards
            </Button>
            <Button
              style={{ backgroundColor: NAVY, borderColor: NAVY }}
              onClick={() => navigate('/guards')}
            >
              View All Guards
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* ── Step 1: Download template ───────────────────────────────────── */}
          <Card className="border-0 shadow-sm mb-4">
            <Card.Body className="p-4">
              <div className="d-flex align-items-start gap-3">
                <span style={{ fontSize: '2.5rem' }}>📥</span>
                <div className="flex-grow-1">
                  <h5 className="fw-bold mb-1">Step 1 — Download the Import Template</h5>
                  <p className="text-muted small mb-3">
                    Download the official {APP_NAME} Excel template. Fill in guard details — one guard per row.
                    Do not change column headers or their order.
                  </p>

                  <Alert variant="info" className="small mb-3">
                    <strong>Required:</strong> First Name, Last Name, National ID, Phone, Date of Birth,
                    Next of Kin Name, Next of Kin Phone, Monthly Salary, Contract Start
                    <br />
                    <strong>Optional:</strong> Other Names, Bank Name, Account Number, Contract End, PSO Certificate
                    <br />
                    <strong>Date format:</strong> DD/MM/YYYY &nbsp;|&nbsp; <strong>Phone:</strong> +256XXXXXXXXX
                  </Alert>

                  <Button
                    style={{ backgroundColor: NAVY, borderColor: NAVY }}
                    onClick={handleDownload}
                    disabled={downloadTemplate.isPending}
                  >
                    {downloadTemplate.isPending ? (
                      <><Spinner size="sm" animation="border" className="me-2" />Downloading…</>
                    ) : templateDone ? (
                      '✅ Template Downloaded — proceed to Step 2'
                    ) : (
                      'Download Template'
                    )}
                  </Button>
                </div>
              </div>
            </Card.Body>
          </Card>

          {/* ── Step 2: Upload ─────────────────────────────────────────────── */}
          <Card className={`border-0 shadow-sm ${!templateDone ? 'opacity-75' : ''}`}>
            <Card.Body className="p-4">
              <div className="d-flex align-items-start gap-3">
                <span style={{ fontSize: '2.5rem' }}>📤</span>
                <div className="flex-grow-1">
                  <h5 className="fw-bold mb-1">Step 2 — Upload Filled Template</h5>
                  <p className="text-muted small mb-3">
                    Upload your completed Excel file. We'll validate each row and report any errors.
                  </p>

                  {/* Drop zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    style={{
                      border:        `2px dashed ${dragOver ? NAVY : '#ced4da'}`,
                      borderRadius:  8,
                      padding:       '2rem',
                      textAlign:     'center',
                      cursor:        'pointer',
                      background:    dragOver ? '#f0f4ff' : '#fafafa',
                      transition:    'all 0.15s',
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      style={{ display: 'none' }}
                      onChange={onInputChange}
                    />
                    {file ? (
                      <div>
                        <div className="fw-semibold">{file.name}</div>
                        <div className="text-muted small">{formatBytes(file.size)}</div>
                        <Button
                          size="sm"
                          variant="link"
                          className="text-danger p-0 mt-1"
                          onClick={(e) => { e.stopPropagation(); handleReset(); }}
                        >
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <div className="text-muted">
                        <div className="mb-1">Drag & drop your filled Excel file here</div>
                        <div className="small">or click to browse (.xlsx, .xls — max 10 MB)</div>
                      </div>
                    )}
                  </div>

                  {/* Preview table */}
                  {preview.length > 0 && (
                    <div className="mt-3">
                      <div className="small text-muted mb-1">
                        Showing first {preview.length} data row{preview.length !== 1 ? 's' : ''}:
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <Table size="sm" bordered className="small">
                          <tbody>
                            {preview.map((row, i) => (
                              <tr key={i}>
                                {(row as unknown as (string | number)[]).slice(0, 6).map((cell, j) => (
                                  <td key={j}>{String(cell)}</td>
                                ))}
                                {row.length > 6 && <td className="text-muted">…</td>}
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                    </div>
                  )}

                  {bulkImport.isPending && (
                    <ProgressBar
                      animated
                      striped
                      now={100}
                      label="Uploading & validating…"
                      className="mt-3"
                      style={{ height: 24 }}
                    />
                  )}

                  <Button
                    className="mt-3"
                    style={{ backgroundColor: NAVY, borderColor: NAVY }}
                    disabled={!file || bulkImport.isPending}
                    onClick={handleUpload}
                  >
                    {bulkImport.isPending
                      ? <><Spinner size="sm" animation="border" className="me-2" />Validating…</>
                      : 'Upload & Validate'}
                  </Button>
                </div>
              </div>
            </Card.Body>
          </Card>
        </>
      )}
    </div>
  );
}

export { timeAgo };
