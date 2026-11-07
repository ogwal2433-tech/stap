import { Button, Col, Form, Row } from 'react-bootstrap';
import { PRIORITY_LEVELS, computeDuration } from '@security360/shared';
import type { LongParkedPeriod, MotorcycleReport, PendingMatter, UnreachablePeriod } from '@security360/shared';

export const NAVY = '#1B3A6B';
export const TEAL = '#0F7B6C';

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
                      <i className="bi bi-x-lg" />
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

/** Polyfilled for HTTP in main.tsx — the app is served over plain HTTP on site. */
const uid = () => crypto.randomUUID();

const priorityOf = (value: string) =>
  PRIORITY_LEVELS.find(p => p.value === value) ?? PRIORITY_LEVELS[1];

/**
 * Sections 8 and 9 are cards rather than tables: their rows are prose and
 * nested periods, which a fixed-width table column cannot hold legibly.
 */
function CardSection({
  colour, title, subtitle, onAdd, addLabel, children,
}: {
  colour:    string;
  title:     string;
  subtitle:  string;
  onAdd?:    () => void;
  addLabel:  string;
  children:  React.ReactNode;
}) {
  return (
    <div style={{
      background: 'white', borderRadius: '0.75rem', border: '1px solid #e9ecef',
      overflow: 'hidden', marginBottom: 20, marginTop: 20,
    }}>
      <div style={{
        background: colour, padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div style={{ fontWeight: 700, color: 'white', fontSize: '0.92rem' }}>{title}</div>
          <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>
            {subtitle}
          </div>
        </div>
        {onAdd && (
          <Button variant="outline-light" size="sm" onClick={onAdd}
            style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
            {addLabel}
          </Button>
        )}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      textAlign: 'center', color: '#6c757d', fontSize: '0.82rem', padding: 20,
      border: '2px dashed #ced4da', borderRadius: '0.5rem',
    }}>
      {children}
    </div>
  );
}

function RemoveButton({ label, onClick, size = '1rem' }: {
  label: string; onClick: () => void; size?: string;
}) {
  return (
    <button
      type="button" aria-label={label} onClick={onClick}
      style={{
        background: 'none', border: 'none', color: '#dc3545',
        cursor: 'pointer', fontSize: size, lineHeight: 1, padding: '0 4px',
      }}
    >
      <i className="bi bi-x-lg" />
    </button>
  );
}

/** Section 8 — what the outgoing shift could not close, and who owns it. */
export function PendingMattersSection({ items, onChange, readOnly }: {
  items:    PendingMatter[];
  onChange: (items: PendingMatter[]) => void;
  readOnly?: boolean;
}) {
  const update = (id: string, patch: Partial<PendingMatter>) =>
    onChange(items.map(m => (m.id === id ? { ...m, ...patch } : m)));

  const add = () => onChange([...items, {
    id: uid(), description: '', responsiblePerson: '',
    priority: 'MEDIUM', addedAt: new Date().toISOString(),
  }]);

  return (
    <CardSection
      colour={NAVY}
      title="8. PENDING MATTERS FOR NEXT SHIFT"
      subtitle="Items that require attention in the next shift"
      onAdd={readOnly ? undefined : add}
      addLabel="+ Add Item"
    >
      {items.length === 0 ? (
        <Empty>
          {readOnly ? 'Nothing recorded.' : 'No pending matters. Click "+ Add Item" to add one.'}
        </Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((m, i) => {
            const priority = priorityOf(m.priority);
            return (
              <div key={m.id} style={{
                border: '1px solid #e9ecef', borderRadius: '0.5rem', padding: '14px 16px',
                borderLeft: `4px solid ${priority.colour}`, background: priority.bg,
              }}>
                <div className="d-flex justify-content-between align-items-center" style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.80rem', color: NAVY }}>
                    Item {i + 1}
                  </div>
                  <div className="d-flex gap-2 align-items-center">
                    {readOnly ? (
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: priority.colour }}>
                        {priority.label} Priority
                      </span>
                    ) : (
                      <>
                        <Form.Select
                          size="sm"
                          aria-label={`Priority for item ${i + 1}`}
                          value={m.priority}
                          onChange={e => update(m.id, { priority: e.target.value as PendingMatter['priority'] })}
                          style={{
                            width: 'auto', fontSize: '0.72rem', fontWeight: 700,
                            color: priority.colour, border: `1px solid ${priority.colour}40`,
                          }}
                        >
                          {PRIORITY_LEVELS.map(p => (
                            <option key={p.value} value={p.value}>{p.label} Priority</option>
                          ))}
                        </Form.Select>
                        <RemoveButton
                          label={`Remove item ${i + 1}`}
                          onClick={() => onChange(items.filter(x => x.id !== m.id))}
                        />
                      </>
                    )}
                  </div>
                </div>

                {readOnly ? (
                  <>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: 4 }}>
                      {m.description || '—'}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>
                      Responsible: <strong>{m.responsiblePerson || '—'}</strong>
                    </div>
                  </>
                ) : (
                  <Row className="g-2">
                    <Col md={8}>
                      <Form.Label className="small fw-bold">Description</Form.Label>
                      <Form.Control
                        as="textarea" rows={2} size="sm" value={m.description}
                        onChange={e => update(m.id, { description: e.target.value })}
                        placeholder="What needs attention next shift"
                      />
                    </Col>
                    <Col md={4}>
                      <Form.Label className="small fw-bold">Responsible Person</Form.Label>
                      <Form.Control
                        size="sm" value={m.responsiblePerson}
                        onChange={e => update(m.id, { responsiblePerson: e.target.value })}
                        placeholder="Name of person responsible"
                      />
                    </Col>
                  </Row>
                )}
              </div>
            );
          })}
        </div>
      )}
    </CardSection>
  );
}

/** One period row of section 9, shared by the unreachable and parked lists. */
function PeriodRow({
  index, from, to, tail, tailLabel, tailPlaceholder, colour, bg, border,
  onChange, onRemove, readOnly, suffix,
}: {
  index: number; from: string; to: string; tail: string;
  tailLabel: string; tailPlaceholder: string;
  colour: string; bg: string; border: string;
  onChange: (patch: { from?: string; to?: string; tail?: string }) => void;
  onRemove: () => void;
  readOnly?: boolean;
  suffix?: string;
}) {
  const duration = from && to ? computeDuration(from, to) : '';

  if (readOnly) {
    return (
      <div style={{
        fontSize: '0.78rem', padding: '4px 8px', background: bg,
        borderRadius: 4, marginBottom: 4, color: colour,
      }}>
        {from || '—'} — {to || '—'}
        {duration && ` (${duration}${suffix ?? ''})`}
        {tail && ` · ${tail}`}
      </div>
    );
  }

  return (
    <div style={{ background: bg, borderRadius: '0.375rem', padding: '8px 12px', border: `1px solid ${border}` }}>
      <div className="d-flex justify-content-between" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: '0.72rem', color: colour, fontWeight: 600 }}>
          Period {index + 1}{duration && ` (${duration}${suffix ?? ''})`}
        </span>
        <RemoveButton label={`Remove period ${index + 1}`} onClick={onRemove} size="0.85rem" />
      </div>
      <Row className="g-2">
        <Col xs={3}>
          <Form.Label className="small">From</Form.Label>
          <Form.Control size="sm" type="time" value={from}
            onChange={e => onChange({ from: e.target.value })} />
        </Col>
        <Col xs={3}>
          <Form.Label className="small">To</Form.Label>
          <Form.Control size="sm" type="time" value={to}
            onChange={e => onChange({ to: e.target.value })} />
        </Col>
        <Col xs={6}>
          <Form.Label className="small">{tailLabel}</Form.Label>
          <Form.Control size="sm" value={tail} placeholder={tailPlaceholder}
            onChange={e => onChange({ tail: e.target.value })} />
        </Col>
      </Row>
    </div>
  );
}

function PeriodList({
  title, colour, bg, border, rows, readOnly, onAdd, children,
}: {
  title: string; colour: string; bg: string; border: string;
  rows: number; readOnly?: boolean; onAdd: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 16 }} role="group" aria-label={title}>
      <div className="d-flex justify-content-between align-items-center" style={{ marginBottom: 8 }}>
        <div style={{
          fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase',
          letterSpacing: '0.5px', color: colour,
        }}>
          {title}
        </div>
        {!readOnly && (
          <button
            type="button" onClick={onAdd}
            style={{
              fontSize: '0.72rem', color: colour, background: 'none',
              border: `1px solid ${colour}`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
            }}
          >
            + Add Period
          </button>
        )}
      </div>
      {rows === 0
        ? <div style={{ fontSize: '0.75rem', color: '#6c757d', fontStyle: 'italic', padding: '6px 0' }}>
            No {title.toLowerCase()} recorded
          </div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>}
    </div>
  );
}

/** Section 9 — one block per supervisor motorcycle, with its periods nested. */
export function MotorcycleSection({ items, onChange, readOnly }: {
  items:    MotorcycleReport[];
  onChange: (items: MotorcycleReport[]) => void;
  readOnly?: boolean;
}) {
  const update = (id: string, patch: Partial<MotorcycleReport>) =>
    onChange(items.map(m => (m.id === id ? { ...m, ...patch } : m)));

  const add = () => onChange([...items, {
    id: uid(), zone: '', motorcycleId: '', riderName: '',
    unreachablePeriods: [], longParkedPeriods: [],
  }]);

  return (
    <CardSection
      colour={TEAL}
      title="9. SUPERVISOR MOTORCYCLE REPORT"
      subtitle="Motorcycle activity, unreachable periods and long parking per zone"
      onAdd={readOnly ? undefined : add}
      addLabel="+ Add Motorcycle"
    >
      {items.length === 0 ? (
        <Empty>
          {readOnly ? 'Nothing recorded.' : 'No motorcycles added. Click "+ Add Motorcycle" to add one.'}
        </Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {items.map((mc, i) => {
            const header = [mc.zone, mc.motorcycleId, mc.riderName && `(${mc.riderName})`]
              .filter(Boolean).join(' — ');

            const setUnreachable = (rows: UnreachablePeriod[]) => update(mc.id, { unreachablePeriods: rows });
            const setParked      = (rows: LongParkedPeriod[])  => update(mc.id, { longParkedPeriods: rows });

            return (
              <div key={mc.id} style={{ border: '1px solid #A9DFBF', borderRadius: '0.5rem', overflow: 'hidden' }}>
                <div className="d-flex justify-content-between align-items-center" style={{
                  background: '#E8F8F5', padding: '12px 16px', borderBottom: '1px solid #A9DFBF',
                }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: TEAL }}>
                    {readOnly ? (header || `Motorcycle ${i + 1}`) : `Motorcycle ${i + 1}${mc.zone ? ` — ${mc.zone}` : ''}`}
                  </div>
                  {!readOnly && (
                    <RemoveButton
                      label={`Remove motorcycle ${i + 1}`}
                      onClick={() => onChange(items.filter(x => x.id !== mc.id))}
                    />
                  )}
                </div>

                <div style={{ padding: '14px 16px' }}>
                  {!readOnly && (
                    <Row className="g-2 mb-4">
                      <Col md={4}>
                        <Form.Label className="small fw-bold">Zone</Form.Label>
                        <Form.Control size="sm" value={mc.zone} placeholder="e.g. Zone 1"
                          onChange={e => update(mc.id, { zone: e.target.value })} />
                      </Col>
                      <Col md={4}>
                        <Form.Label className="small fw-bold">Motorcycle ID / Plate</Form.Label>
                        <Form.Control size="sm" value={mc.motorcycleId} placeholder="e.g. UBD 123X"
                          onChange={e => update(mc.id, { motorcycleId: e.target.value })} />
                      </Col>
                      <Col md={4}>
                        <Form.Label className="small fw-bold">Rider / Supervisor Name</Form.Label>
                        <Form.Control size="sm" value={mc.riderName} placeholder="Supervisor name"
                          onChange={e => update(mc.id, { riderName: e.target.value })} />
                      </Col>
                    </Row>
                  )}

                  <PeriodList
                    title="Unreachable Periods" colour="#C0392B" bg="#FDF2F2" border="#F5B7B1"
                    rows={mc.unreachablePeriods.length} readOnly={readOnly}
                    onAdd={() => setUnreachable([...mc.unreachablePeriods, { id: uid(), from: '', to: '', reason: '' }])}
                  >
                    {mc.unreachablePeriods.map((u, j) => (
                      <PeriodRow
                        key={u.id} index={j} from={u.from} to={u.to} tail={u.reason}
                        tailLabel="Reason" tailPlaceholder="e.g. Phone off, No response"
                        colour="#C0392B" bg="#FDF2F2" border="#F5B7B1" readOnly={readOnly}
                        onChange={patch => setUnreachable(mc.unreachablePeriods.map(x =>
                          x.id === u.id
                            ? { ...x, ...patch, ...(patch.tail !== undefined ? { reason: patch.tail } : {}) }
                            : x))}
                        onRemove={() => setUnreachable(mc.unreachablePeriods.filter(x => x.id !== u.id))}
                      />
                    ))}
                  </PeriodList>

                  <PeriodList
                    title="Long Parked Periods" colour="#856404" bg="#FEF9E7" border="#F9E79F"
                    rows={mc.longParkedPeriods.length} readOnly={readOnly}
                    onAdd={() => setParked([...mc.longParkedPeriods, { id: uid(), from: '', to: '', location: '', duration: '' }])}
                  >
                    {mc.longParkedPeriods.map((lp, j) => (
                      <PeriodRow
                        key={lp.id} index={j} from={lp.from} to={lp.to} tail={lp.location}
                        tailLabel="Parking Location" tailPlaceholder="e.g. Main gate, Zone 2 depot"
                        colour="#856404" bg="#FEF9E7" border="#F9E79F" readOnly={readOnly}
                        suffix=" parked"
                        onChange={patch => setParked(mc.longParkedPeriods.map(x => {
                          if (x.id !== lp.id) return x;
                          // duration is stored so the PDF and any later export read the
                          // same value the controller saw, without recomputing it.
                          const next = {
                            ...x, ...patch,
                            ...(patch.tail !== undefined ? { location: patch.tail } : {}),
                          };
                          return { ...next, duration: computeDuration(next.from, next.to) };
                        }))}
                        onRemove={() => setParked(mc.longParkedPeriods.filter(x => x.id !== lp.id))}
                      />
                    ))}
                  </PeriodList>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </CardSection>
  );
}
