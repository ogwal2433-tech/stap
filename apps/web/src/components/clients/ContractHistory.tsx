import { Spinner } from 'react-bootstrap';
import { useQuery } from '@tanstack/react-query';
import { amendmentTypeConfig } from '@stap/shared';
import { contractsApi } from '../../lib/contracts.api';

const ugx = (n: unknown) =>
  typeof n === 'number' ? `UGX ${n.toLocaleString('en-UG')}` : String(n ?? '—');

const fmtDate = (v: unknown) =>
  typeof v === 'string' && v.includes('-')
    ? new Date(v).toLocaleDateString('en-GB')
    : String(v ?? '—');

/** The handful of fields worth showing side by side, in a readable order. */
const FIELDS: { key: string; label: string; render: (v: unknown) => string }[] = [
  { key: 'guardsRequired',    label: 'Guards',        render: (v) => String(v ?? '—') },
  { key: 'totalMonthlyValue', label: 'Monthly value', render: ugx },
  { key: 'contractEnd',       label: 'Ends',          render: fmtDate },
  { key: 'status',            label: 'Status',        render: (v) => String(v ?? '—') },
];

function Side({ title, colour, background, values }: {
  title: string; colour: string; background: string; values: Record<string, unknown>;
}) {
  const rows = FIELDS.filter(f => values[f.key] !== undefined);
  return (
    <div style={{ background, borderRadius: '0.375rem', padding: '8px 10px', fontSize: '0.72rem' }}>
      <div className="fw-bold mb-1" style={{ color: colour }}>{title}</div>
      {rows.length === 0
        ? <div className="text-muted">unchanged</div>
        : rows.map(f => (
            <div key={f.key}>
              <span className="text-muted">{f.label}: </span>
              <strong>{f.render(values[f.key])}</strong>
            </div>
          ))}
    </div>
  );
}

/**
 * Every recorded change to a contract, newest first.
 *
 * Both sides of each change are shown because the terms a client originally
 * signed live only in the earliest "before" — the contract row itself carries
 * the current terms and nothing else.
 */
export default function ContractHistory({ contractId }: { contractId: string }) {
  const { data: amendments = [], isLoading } = useQuery({
    queryKey: ['contract-amendments', contractId],
    queryFn:  () => contractsApi.amendments(contractId),
  });

  if (isLoading) {
    return <div className="text-center py-4"><Spinner animation="border" size="sm" /></div>;
  }

  if (amendments.length === 0) {
    return (
      <div className="text-center text-muted py-4" style={{ fontSize: '0.85rem' }}>
        No amendments — this contract stands as it was signed.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', paddingTop: 4 }}>
      <div style={{ position: 'absolute', left: 19, top: 12, bottom: 12, width: 2, background: '#e9ecef' }} />

      {amendments.map((a) => {
        const type = amendmentTypeConfig(a.amendmentType);
        return (
          <div key={a.id} className="d-flex gap-3 mb-3" style={{ position: 'relative' }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', flexShrink: 0, zIndex: 1,
              background: `${type.colour}20`, border: `2px solid ${type.colour}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.05rem',
            }}>
              {type.icon}
            </div>

            <div style={{
              flex: 1, background: 'white', border: '1px solid #e9ecef',
              borderLeft: `3px solid ${type.colour}`, borderRadius: '0.5rem', padding: '10px 14px',
            }}>
              <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.86rem', color: type.colour }}>{type.label}</div>
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                    {a.systemId} · {a.amendedBy?.name ?? 'Unknown'} ·{' '}
                    {new Date(a.amendedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#1B3A6B' }}>
                  Effective {new Date(a.effectiveDate).toLocaleDateString('en-GB')}
                </div>
              </div>

              {a.changeSummary && (
                <div style={{
                  background: '#F2F4F7', borderRadius: '0.375rem', padding: '5px 9px',
                  fontSize: '0.78rem', fontWeight: 600, margin: '8px 0',
                }}>
                  {a.changeSummary}
                </div>
              )}

              <div style={{ fontSize: '0.78rem', color: '#4A5568' }}>
                <span className="text-muted">Reason: </span>{a.reason}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
                <Side title="Before" colour="#C0392B" background="#fdecea" values={a.previousValues} />
                <Side title="After"  colour="#1E8449" background="#d5f5e3" values={a.newValues} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
