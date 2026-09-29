import { useRef, useState } from 'react';
import { Button, Modal, Spinner } from 'react-bootstrap';
import {
  CLIENT_IMPORT_BILLING_TERMS,
  CLIENT_IMPORT_CONTACT_PLACEHOLDER,
  CLIENT_IMPORT_CONTRACT_MONTHS,
} from '@security360/shared';
import type { ClientImportPreview, ClientImportResult, ClientImportRow } from '@security360/shared';
import {
  useClientImportConfirm, useClientImportPreview, useClientImportTemplate,
} from '../../hooks/useClients';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

const NAVY   = '#1B3A6B';
const GREEN  = '#1E8449';
const RED    = '#C0392B';
const AMBER  = '#856404';
const MAX_SIZE = 5 * 1024 * 1024;

type Step = 'upload' | 'preview' | 'result';

const COLUMN_GUIDE: [string, string, string][] = [
  ['A', 'Client Name',            'Required'],
  ['B', 'Guns Deployed',          'Optional'],
  ['C', 'Location',               'Optional'],
  ['D', 'Contract Status',        'Optional'],
  ['E', 'No. of Guards Deployed', 'For a contract'],
  ['F', 'Start Date (DD/MM/YYYY)', 'Optional'],
  ['G', 'Amount — Monthly (UGX)', 'For a contract'],
];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const fmtMoney = (n: number | null) => (n === null ? '—' : `UGX ${n.toLocaleString()}`);

export default function ClientImportModal({
  show, onClose, onImported,
}: {
  show:     boolean;
  onClose:  () => void;
  onImported?: () => void;
}) {
  const { showToast } = useToast();
  const fileInputRef  = useRef<HTMLInputElement>(null);

  const [step, setStep]           = useState<Step>('upload');
  const [file, setFile]           = useState<File | null>(null);
  const [dragOver, setDragOver]   = useState(false);
  const [preview, setPreview]     = useState<ClientImportPreview | null>(null);
  const [result, setResult]       = useState<ClientImportResult | null>(null);
  const [selected, setSelected]   = useState<Set<number>>(new Set());

  const template = useClientImportTemplate();
  const parse    = useClientImportPreview();
  const confirm  = useClientImportConfirm();

  const reset = () => {
    setStep('upload'); setFile(null); setPreview(null); setResult(null);
    setSelected(new Set()); setDragOver(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const close = () => { reset(); onClose(); };

  const takeFile = (f: File) => {
    if (!/\.xlsx?$/i.test(f.name)) { showToast('Only .xlsx or .xls files are allowed', 'warning'); return; }
    if (f.size > MAX_SIZE)         { showToast('File exceeds the 5 MB limit', 'warning'); return; }
    setFile(f);
  };

  const handlePreview = async () => {
    if (!file) return;
    try {
      const data = await parse.mutateAsync(file);
      setPreview(data);
      // Valid rows start ticked; a row already on file is left out, since
      // importing it would only produce a "skipped" line in the results.
      setSelected(new Set(
        data.rows
          .filter((r) => r.isValid && !r.warnings.some((w) => w.includes('already on file')))
          .map((r) => r.rowNumber),
      ));
      setStep('preview');
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Could not read that file.'), 'danger');
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    const rows = preview.rows.filter((r) => r.isValid && selected.has(r.rowNumber));
    if (rows.length === 0) { showToast('No rows selected', 'warning'); return; }
    try {
      const data = await confirm.mutateAsync(rows);
      setResult(data);
      setStep('result');
      onImported?.();
    } catch (err) {
      showToast(getApiErrorMessage(err, 'Import failed.'), 'danger');
    }
  };

  const toggle = (rowNumber: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber); else next.add(rowNumber);
      return next;
    });

  const selectAllValid = () =>
    setSelected(new Set(preview?.rows.filter((r) => r.isValid).map((r) => r.rowNumber) ?? []));

  const busy = parse.isPending || confirm.isPending;

  // ── Step 1: upload ─────────────────────────────────────────────────────────

  const uploadStep = (
    <>
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) takeFile(f);
        }}
        style={{
          border: `2px dashed ${dragOver ? NAVY : '#ced4da'}`, borderRadius: '0.75rem',
          padding: '36px 20px', textAlign: 'center', cursor: 'pointer',
          background: file ? '#EBF5FB' : dragOver ? '#f0f4ff' : '#F8F9FA', transition: 'all 0.15s',
        }}
      >
        <input
          ref={fileInputRef} type="file" accept=".xlsx,.xls"
          aria-label="Excel file" style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) takeFile(f); }}
        />
        <div style={{ fontSize: '2.6rem', marginBottom: 10 }}>📊</div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 4, color: file ? NAVY : '#4A5568' }}>
          {file ? file.name : 'Drop your Excel file here, or click to browse'}
        </div>
        <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
          .xlsx or .xls, up to 5 MB
        </div>
      </div>

      <div style={{ marginTop: 14, textAlign: 'center', fontSize: '0.78rem', color: '#6c757d' }}>
        Don&apos;t have the template?{' '}
        <button
          type="button"
          onClick={() => template.mutate(undefined, {
            onError: () => showToast('Could not download the template.', 'danger'),
          })}
          disabled={template.isPending}
          style={{
            background: 'none', border: 'none', color: NAVY, textDecoration: 'underline',
            cursor: 'pointer', fontSize: '0.78rem', padding: 0,
          }}
        >
          {template.isPending ? 'Preparing…' : 'Download the Excel template'}
        </button>
      </div>

      <div style={{ marginTop: 16, background: '#F2F4F7', borderRadius: '0.5rem', padding: '12px 16px', fontSize: '0.75rem' }}>
        <div className="fw-bold mb-2" style={{ color: NAVY }}>Expected columns, in order:</div>
        {COLUMN_GUIDE.map(([col, name, need]) => (
          <div key={col} className="d-flex align-items-center" style={{ gap: 8, marginBottom: 3 }}>
            <span style={{
              background: NAVY, color: 'white', borderRadius: 3, padding: '1px 5px',
              fontSize: '0.68rem', fontWeight: 700, minWidth: 18, textAlign: 'center',
            }}>
              {col}
            </span>
            <span style={{ flex: 1 }}>{name}</span>
            <span style={{ color: need === 'Required' ? RED : '#6c757d', fontSize: '0.68rem' }}>{need}</span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, background: '#FEF9E7', borderRadius: '0.5rem', padding: '10px 14px', fontSize: '0.73rem', color: '#4A5568' }}>
        <div className="fw-bold mb-1" style={{ color: AMBER }}>What the import fills in for you</div>
        The spreadsheet has no column for these, so every imported client gets:
        contact person <strong>&ldquo;{CLIENT_IMPORT_CONTACT_PLACEHOLDER}&rdquo;</strong>,
        billing terms <strong>{CLIENT_IMPORT_BILLING_TERMS} days</strong>, and a contract ending{' '}
        <strong>{CLIENT_IMPORT_CONTRACT_MONTHS} months</strong> after its start date.
        The monthly amount is split evenly across the guards as a rate per guard.
      </div>
    </>
  );

  // ── Step 2: preview ────────────────────────────────────────────────────────

  const previewStep = preview && (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Rows found',      value: preview.totalRows,    colour: NAVY,  bg: '#EBF5FB' },
          { label: 'Ready to import', value: preview.validCount,   colour: GREEN, bg: '#E8F8F5' },
          { label: 'Have errors',     value: preview.invalidCount, colour: RED,   bg: '#FDEDEC' },
        ].map((s) => (
          <div key={s.label} style={{ background: s.bg, borderRadius: '0.5rem', padding: '10px 14px', borderLeft: `3px solid ${s.colour}` }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: s.colour }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="d-flex justify-content-between align-items-center" style={{ marginBottom: 8, fontSize: '0.78rem' }}>
        <div>
          <button type="button" onClick={selectAllValid}
            style={{ background: 'none', border: 'none', color: NAVY, cursor: 'pointer', fontWeight: 600, fontSize: '0.75rem' }}>
            Select all valid
          </button>
          {' · '}
          <button type="button" onClick={() => setSelected(new Set())}
            style={{ background: 'none', border: 'none', color: '#6c757d', cursor: 'pointer', fontSize: '0.75rem' }}>
            Deselect all
          </button>
        </div>
        <div style={{ color: '#6c757d' }}>{selected.size} row{selected.size === 1 ? '' : 's'} selected</div>
      </div>

      <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #e9ecef', borderRadius: '0.5rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ background: NAVY, color: 'white', position: 'sticky', top: 0 }}>
              <th style={{ padding: '8px 10px', width: 32 }} aria-label="Select" />
              <th style={{ padding: '8px 10px' }}>Row</th>
              <th style={{ padding: '8px 10px' }}>Client</th>
              <th style={{ padding: '8px 10px', textAlign: 'center' }}>Guards</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '8px 10px' }}>Start</th>
              <th style={{ padding: '8px 10px' }}>Status</th>
              <th style={{ padding: '8px 10px' }}>Contract</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row: ClientImportRow) => (
              <tr key={row.rowNumber} style={{
                background: !row.isValid ? '#FDF2F2' : selected.has(row.rowNumber) ? '#EBF5FB' : 'white',
                borderBottom: '1px solid #f0f0f0',
              }}>
                <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                  {row.isValid ? (
                    <input
                      type="checkbox"
                      aria-label={`Select row ${row.rowNumber}`}
                      checked={selected.has(row.rowNumber)}
                      onChange={() => toggle(row.rowNumber)}
                      style={{ accentColor: NAVY, cursor: 'pointer' }}
                    />
                  ) : (
                    <span style={{ color: RED, fontSize: '1rem' }} title="Cannot be imported">✕</span>
                  )}
                </td>
                <td style={{ padding: '6px 10px', color: '#6c757d' }}>{row.rowNumber}</td>
                <td style={{ padding: '6px 10px' }}>
                  <div style={{ fontWeight: row.isValid ? 500 : 400, color: row.isValid ? '#1a1a1a' : RED }}>
                    {row.clientName ?? <em style={{ color: RED }}>Missing</em>}
                  </div>
                  {row.errors.map((e) => (
                    <div key={e} style={{ fontSize: '0.68rem', color: RED, marginTop: 2 }}>{e}</div>
                  ))}
                  {row.warnings.map((w) => (
                    <div key={w} style={{ fontSize: '0.68rem', color: AMBER, marginTop: 2 }}>{w}</div>
                  ))}
                </td>
                <td style={{ padding: '6px 10px', textAlign: 'center' }}>{row.guardsDeployed ?? '—'}</td>
                <td style={{ padding: '6px 10px', textAlign: 'right' }}>{fmtMoney(row.amount)}</td>
                <td style={{ padding: '6px 10px' }}>{fmtDate(row.startDate)}</td>
                <td style={{ padding: '6px 10px' }}>{row.contractStatus ?? '—'}</td>
                <td style={{ padding: '6px 10px', color: row.willCreateContract ? GREEN : '#6c757d' }}>
                  {row.willCreateContract ? 'Yes' : 'Client only'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  // ── Step 3: result ─────────────────────────────────────────────────────────

  const resultStep = result && (
    <div style={{ padding: '10px 0' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 8 }}>{result.imported > 0 ? '✅' : '⚠️'}</div>
        <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>Import complete</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, margin: '18px 0' }}>
        {[
          { label: 'Imported',  value: result.imported,         colour: GREEN, bg: '#E8F8F5' },
          { label: 'Contracts', value: result.contractsCreated, colour: NAVY,  bg: '#EBF5FB' },
          { label: 'Skipped',   value: result.skipped,          colour: AMBER, bg: '#FEF9E7' },
          { label: 'Failed',    value: result.failed,           colour: RED,   bg: '#FDEDEC' },
        ].map((s) => (
          <div key={s.label} style={{ background: s.bg, borderRadius: '0.5rem', padding: 12, borderLeft: `3px solid ${s.colour}` }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: s.colour }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e9ecef', borderRadius: '0.5rem', fontSize: '0.75rem' }}>
        {result.rows.map((r) => (
          <div key={r.rowNumber} style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{
              color: r.status === 'IMPORTED' ? GREEN : r.status === 'SKIPPED' ? AMBER : RED,
              fontWeight: 700, marginRight: 8,
            }}>
              {r.status}
            </span>
            <strong>{r.name}</strong>
            <span style={{ color: '#6c757d' }}> — row {r.rowNumber}: {r.note}</span>
          </div>
        ))}
      </div>

      {result.imported > 0 && (
        <div style={{ marginTop: 12, background: '#FEF9E7', borderRadius: '0.5rem', padding: '10px 14px', fontSize: '0.73rem', color: '#4A5568' }}>
          Each imported client still needs a real contact person and phone number —
          they were saved as &ldquo;{CLIENT_IMPORT_CONTACT_PLACEHOLDER}&rdquo;.
        </div>
      )}
    </div>
  );

  return (
    <Modal show={show} onHide={close} size="xl" backdrop={busy ? 'static' : true}>
      <Modal.Header closeButton={!busy} style={{ background: NAVY, color: 'white' }}>
        <Modal.Title style={{ fontSize: '1rem' }}>
          📊 Import clients from Excel
          <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginLeft: 12 }}>
            {step === 'upload' ? 'Step 1 of 3 — choose a file'
              : step === 'preview' ? 'Step 2 of 3 — review and select'
              : 'Step 3 of 3 — results'}
          </span>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {step === 'upload'  && uploadStep}
        {step === 'preview' && previewStep}
        {step === 'result'  && resultStep}
      </Modal.Body>

      <Modal.Footer>
        {step === 'upload' && (
          <>
            <Button variant="outline-secondary" onClick={close}>Cancel</Button>
            <Button
              style={{ backgroundColor: NAVY, borderColor: NAVY }}
              disabled={!file || parse.isPending}
              onClick={handlePreview}
            >
              {parse.isPending
                ? <><Spinner size="sm" animation="border" className="me-2" />Reading…</>
                : 'Preview import'}
            </Button>
          </>
        )}

        {step === 'preview' && (
          <>
            <Button variant="outline-secondary" disabled={confirm.isPending} onClick={() => setStep('upload')}>
              Back
            </Button>
            <Button
              style={{ backgroundColor: NAVY, borderColor: NAVY }}
              disabled={selected.size === 0 || confirm.isPending}
              onClick={handleConfirm}
            >
              {confirm.isPending
                ? <><Spinner size="sm" animation="border" className="me-2" />Importing…</>
                : `Import ${selected.size} client${selected.size === 1 ? '' : 's'}`}
            </Button>
          </>
        )}

        {step === 'result' && (
          <>
            <Button variant="outline-secondary" onClick={reset}>Import another file</Button>
            <Button style={{ backgroundColor: NAVY, borderColor: NAVY }} onClick={close}>Close</Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
