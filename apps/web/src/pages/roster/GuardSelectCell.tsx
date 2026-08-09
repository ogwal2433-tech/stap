import { useMemo, useRef, useState } from 'react';
import type { GuardResponse } from '@stap/shared';

const CELL_INPUT: React.CSSProperties = {
  width:        '100%',
  padding:      '5px 8px',
  border:       '1px solid #ced4da',
  borderRadius: '0.375rem',
  fontSize:     '0.82rem',
};

interface Props {
  value:     string;
  guards:    GuardResponse[];
  invalid?:  boolean;
  onChange:  (guardId: string, guardName: string) => void;
}

/**
 * Type-to-filter guard picker for a single sheet row.
 *
 * A plain <select> is unusable once there are more than a few dozen guards, so
 * this keeps the spreadsheet feel — click the cell, type, pick.
 */
export default function GuardSelectCell({ value, guards, invalid, onChange }: Props) {
  const [search, setSearch] = useState('');
  const [open, setOpen]     = useState(false);
  const blurTimer           = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = guards.find(g => g.id === value);

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guards.slice(0, 50);
    return guards
      .filter(g =>
        g.fullName.toLowerCase().includes(q) ||
        (g.systemId ?? '').toLowerCase().includes(q) ||
        (g.rank ?? '').toLowerCase().includes(q))
      .slice(0, 50);
  }, [guards, search]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={open ? search : selected?.fullName ?? ''}
        placeholder="Search guard…"
        onFocus={() => { setOpen(true); setSearch(''); }}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
        onChange={e => setSearch(e.target.value)}
        style={{
          ...CELL_INPUT,
          background:  value ? '#F0FFF4' : 'white',
          borderColor: invalid ? '#dc3545' : '#ced4da',
        }}
      />

      {open && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
            background: 'white', border: '1px solid #ced4da',
            borderRadius: '0 0 0.375rem 0.375rem',
            maxHeight: '190px', overflowY: 'auto',
            boxShadow: '0 4px 10px rgba(0,0,0,0.12)',
          }}
        >
          {options.length === 0 ? (
            <div style={{ padding: '8px 10px', color: '#6c757d', fontSize: '0.8rem' }}>
              No matching guard
            </div>
          ) : (
            options.map(g => (
              <div
                key={g.id}
                role="button"
                tabIndex={-1}
                onMouseDown={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  onChange(g.id, g.fullName);
                  setOpen(false);
                  setSearch('');
                }}
                style={{
                  padding:      '6px 10px',
                  cursor:       'pointer',
                  background:   g.id === value ? '#D6E0F0' : 'white',
                  borderBottom: '1px solid #f2f2f2',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{g.fullName}</div>
                <div style={{ fontSize: '0.71rem', color: '#6c757d' }}>
                  {g.systemId ?? '—'}{g.rank ? ` · ${g.rank}` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
