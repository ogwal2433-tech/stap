import { Button, Form } from 'react-bootstrap';

export const NAVY = '#1B3A6B';

export const TH: React.CSSProperties = {
  padding:    '8px 10px',
  color:      'white',
  fontWeight: 700,
  fontSize:   '0.78rem',
  textAlign:  'left',
};

export function SectionHeader({ number, title }: { number: number; title: string }) {
  return (
    <div style={{
      background:    NAVY,
      color:         'white',
      padding:       '8px 16px',
      borderRadius:  '0.375rem',
      fontWeight:    700,
      fontSize:      '0.88rem',
      letterSpacing: '0.5px',
      marginBottom:  '10px',
      marginTop:     '20px',
    }}>
      {number}. {title}
    </div>
  );
}

export interface Column { key: string; label: string; width?: string }

/**
 * A table whose rows the controller adds and removes — incidents, client calls
 * and discipline issues, where the number of entries is whatever the shift
 * produced. The fixed-row tables (deployment, zones, guns) are laid out
 * separately since their rows are printed on the form and cannot be removed.
 */
export function DynamicTable({
  columns, rows, onChange, emptyRow, readOnly,
}: {
  columns:  Column[];
  rows:     Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
  emptyRow: Record<string, string>;
  readOnly?: boolean;
}) {
  const update = (i: number, key: string, val: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [key]: val };
    onChange(next);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', minWidth: 640 }}>
          <thead>
            <tr style={{ background: NAVY }}>
              {columns.map(c => (
                <th key={c.key} style={{ ...TH, width: c.width ?? 'auto' }}>{c.label}</th>
              ))}
              {!readOnly && <th style={{ ...TH, width: 44 }} aria-label="Remove row" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (readOnly ? 0 : 1)}
                  className="text-muted text-center py-3"
                  style={{ fontSize: '0.8rem', border: '1px solid #e9ecef' }}
                >
                  Nothing recorded.
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} style={{
                background:   i % 2 === 0 ? 'white' : '#F8F9FA',
                borderBottom: '1px solid #e9ecef',
              }}>
                {columns.map(c => (
                  <td key={c.key} style={{ padding: '4px 6px' }}>
                    {readOnly
                      ? <span style={{ fontSize: '0.82rem' }}>{row[c.key] || '—'}</span>
                      : <Form.Control
                          size="sm"
                          value={row[c.key] ?? ''}
                          onChange={e => update(i, c.key, e.target.value)}
                        />}
                  </td>
                ))}
                {!readOnly && (
                  <td style={{ padding: 4, textAlign: 'center' }}>
                    <button
                      type="button"
                      aria-label={`Remove row ${i + 1}`}
                      onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                      style={{
                        background: 'none', border: 'none', color: '#dc3545',
                        cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && (
        <Button
          variant="outline-secondary" size="sm" className="mt-2"
          onClick={() => onChange([...rows, { ...emptyRow }])}
        >
          + Add Row
        </Button>
      )}
    </div>
  );
}

/**
 * A table whose rows are fixed by the paper form — the nine deployment lines,
 * the zones, the gun rows. The first column is the printed label; the rest are
 * filled in.
 */
export function FixedTable({
  headers, rows, fields, onChange, readOnly, highlightRow,
}: {
  headers:  Column[];
  rows:     Record<string, string>[];
  fields:   { key: string; numeric?: boolean; width?: string }[];
  onChange: (rows: Record<string, string>[]) => void;
  readOnly?: boolean;
  /** Value of the label column that should be emphasised, e.g. the TOTAL line. */
  highlightRow?: string;
}) {
  const update = (i: number, key: string, val: string) => {
    const next = [...rows];
    next[i] = { ...next[i], [key]: val };
    onChange(next);
  };
  const labelKey = headers[0].key;

  return (
    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: 640 }}>
        <thead>
          <tr style={{ background: NAVY }}>
            {headers.map(h => (
              <th key={h.key} style={{ ...TH, width: h.width ?? 'auto' }}>{h.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isTotal = highlightRow !== undefined && row[labelKey] === highlightRow;
            return (
              <tr key={i} style={{
                background:   isTotal ? '#D6E0F0' : i % 2 === 0 ? 'white' : '#F8F9FA',
                borderBottom: '1px solid #e9ecef',
                fontWeight:   isTotal ? 700 : 400,
              }}>
                <td style={{ padding: '6px 10px', fontWeight: 600, fontSize: '0.82rem' }}>
                  {row[labelKey]}
                </td>
                {fields.map(f => (
                  <td key={f.key} style={{ padding: '4px 6px' }}>
                    {readOnly
                      ? <span style={{ fontSize: '0.82rem' }}>{row[f.key] || '—'}</span>
                      : <Form.Control
                          size="sm"
                          type={f.numeric ? 'number' : 'text'}
                          min={f.numeric ? 0 : undefined}
                          value={row[f.key] ?? ''}
                          onChange={e => update(i, f.key, e.target.value)}
                          style={f.numeric ? { textAlign: 'center' } : undefined}
                        />}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
