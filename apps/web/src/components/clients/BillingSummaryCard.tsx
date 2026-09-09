import type { BillingSummary } from '@stap/shared';
import { useClientBillingSummary } from '../../hooks/useClients';

/**
 * What a client is being billed, at the top of their record.
 *
 * The headline is the monthly figure rather than the outstanding balance: it is
 * the question asked most often about a client, and it is stable — the balance
 * moves with every invoice and payment. The amounts owed sit underneath, where
 * overdue money is the one thing allowed to shout.
 */

const NAVY = '#1B3A6B';
const GOLD = '#F2AA20';
const RED  = '#FF6B6B';

const ugx = (n: number) => `UGX ${n.toLocaleString()}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const shell: React.CSSProperties = {
  background:   NAVY,
  borderRadius: '0.75rem',
  padding:      '20px 24px',
  marginBottom: '20px',
  color:        'white',
  position:     'relative',
  overflow:     'hidden',
};

const capsLabel: React.CSSProperties = {
  fontSize:      '0.72rem',
  color:         'rgba(255,255,255,0.65)',
  textTransform: 'uppercase',
  letterSpacing: '1px',
  fontWeight:    600,
};

const statLabel: React.CSSProperties = {
  fontSize:     '0.68rem',
  color:        'rgba(255,255,255,0.5)',
  marginBottom: '4px',
};

const statNote: React.CSSProperties = {
  fontSize: '0.68rem',
  color:    'rgba(255,255,255,0.4)',
};

function Stat({
  label, value, colour, note,
}: { label: string; value: React.ReactNode; colour: string; note: React.ReactNode }) {
  return (
    <div>
      <div style={statLabel}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: colour }}>{value}</div>
      <div style={statNote}>{note}</div>
    </div>
  );
}

/** Placeholder bars while the figures load — never a zero, which reads as fact. */
function Skeleton() {
  return (
    <div style={shell} aria-busy="true" aria-label="Loading billing summary">
      {[
        { w: '40%', h: '14px', mb: '10px' },
        { w: '60%', h: '38px', mb: '6px' },
        { w: '50%', h: '14px', mb: '0' },
      ].map((s) => (
        <div
          key={s.w + s.h}
          style={{
            width:        s.w,
            height:       s.h,
            background:   'rgba(255,255,255,0.1)',
            borderRadius: '4px',
            marginBottom: s.mb,
            animation:    'billingPulse 1.5s ease-in-out infinite',
          }}
        />
      ))}
    </div>
  );
}

interface BillingSummaryCardProps {
  clientId: string;
  /** Whether the viewer may see money at all. Gates the request, not just the card. */
  canView:  boolean;
}

export default function BillingSummaryCard({ clientId, canView }: BillingSummaryCardProps) {
  const { data, isLoading, isError } = useClientBillingSummary(clientId, canView);

  if (!canView) return null;
  if (isLoading) return <Skeleton />;
  // Silent rather than an error banner: this is a summary beside the record it
  // describes, and the rest of the page is still usable without it.
  if (isError || !data) return null;

  const b: BillingSummary = data;
  const nothingBilled = b.activeContractCount === 0;

  return (
    <div style={shell}>
      {/* Decoration only — kept out of the accessibility tree. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', top: '-20px', right: '-20px',
          width: '120px', height: '120px', borderRadius: '50%',
          background: 'rgba(242,170,32,0.15)', pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden
        style={{
          position: 'absolute', bottom: '-30px', right: '80px',
          width: '80px', height: '80px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.05)', pointerEvents: 'none',
        }}
      />

      <div style={{ ...capsLabel, marginBottom: '8px' }}>Current Monthly Billing</div>

      <div
        style={{
          fontSize:      '2.4rem',
          fontWeight:    900,
          color:         GOLD,
          lineHeight:    1.1,
          marginBottom:  '4px',
          letterSpacing: '-1px',
        }}
      >
        {ugx(b.totalMonthlyBilling)}
      </div>

      <div
        style={{
          fontSize:     '0.78rem',
          color:        'rgba(255,255,255,0.65)',
          marginBottom: '20px',
        }}
      >
        {nothingBilled
          ? 'No active contracts — this client is not currently being billed.'
          : `per month across ${plural(b.activeContractCount, 'active contract')} · ` +
            `${plural(b.totalGuardsDeployed, 'guard')} deployed`}
      </div>

      <div
        style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap:                 '16px',
          paddingTop:          '16px',
          borderTop:           '1px solid rgba(255,255,255,0.15)',
        }}
      >
        <Stat
          label="Outstanding"
          value={ugx(b.totalOutstanding)}
          colour={b.totalOutstanding > 0 ? GOLD : 'rgba(255,255,255,0.9)'}
          note={plural(b.outstandingInvoiceCount, 'invoice')}
        />
        <Stat
          label="Overdue"
          value={ugx(b.totalOverdue)}
          colour={b.totalOverdue > 0 ? RED : 'rgba(255,255,255,0.9)'}
          note={plural(b.overdueCount, 'invoice')}
        />
        <Stat
          label="Last Payment"
          value={
            b.lastPayment
              ? ugx(b.lastPayment.amount)
              : <span style={{ fontSize: '0.82rem', fontWeight: 400, fontStyle: 'italic', color: 'rgba(255,255,255,0.4)' }}>
                  No payments yet
                </span>
          }
          colour="#4CAF50"
          note={
            b.lastPayment
              ? new Date(b.lastPayment.paidAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })
              : ''
          }
        />
      </div>

      {b.totalOverdue > 0 && (
        <div
          style={{
            marginTop:    '14px',
            background:   'rgba(255,107,107,0.15)',
            borderRadius: '0.375rem',
            padding:      '8px 12px',
            fontSize:     '0.75rem',
            color:        RED,
            borderLeft:   `3px solid ${RED}`,
          }}
        >
          <strong>{plural(b.overdueCount, 'overdue invoice')}</strong> — {ugx(b.totalOverdue)} past
          its due date.
        </div>
      )}
    </div>
  );
}
