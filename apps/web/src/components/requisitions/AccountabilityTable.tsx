import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Form, Spinner } from 'react-bootstrap';
import {
  ACCOUNTABILITY_STAGES, ROLES,
  type AccountabilityResponse, type AccountabilityStatus, type UserRole,
} from '@security360/shared';
import { useReviewAccountability } from '../../hooks/useRequisitions';
import { useToast } from '../../context/ToastContext';
import { getApiErrorMessage } from '../../lib/api';

const NAVY = '#1B3A6B';

const TH: React.CSSProperties = {
  padding: '8px 10px', color: 'white', fontWeight: 700,
  fontSize: '0.75rem', textAlign: 'left', whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = { padding: '7px 10px', verticalAlign: 'middle' };

const ugx = (n: number) => `UGX ${n.toLocaleString()}`;
const stageIdx = (s: string) => ACCOUNTABILITY_STAGES.indexOf(s as AccountabilityStatus);

/** Which stage this user could act on, given their role. */
function stageForRole(role: UserRole | undefined): 'admin' | 'hr' | 'director' | null {
  if (!role) return null;
  if (role === ROLES.DIRECTOR) return 'director';
  if (role === ROLES.ASSISTANT_MANAGER) return 'hr';
  if (role === ROLES.ADMINISTRATOR) return 'admin';
  return null;
}

const STAGE_META = {
  admin:    { needs: 'SUBMITTED',      column: 'adminAmount',    label: 'Submit Admin review' },
  hr:       { needs: 'ADMIN_REVIEWED', column: 'hrAmount',       label: 'Submit HR review' },
  director: { needs: 'HR_REVIEWED',    column: 'directorAmount', label: 'Approve & close' },
} as const;

function AmountCell({ value, compareTo, bold }: {
  value: number | null; compareTo: number | null; bold?: boolean;
}) {
  if (value === null || value === undefined) {
    return <span style={{ color: '#adb5bd', fontSize: '0.78rem' }}>Pending</span>;
  }
  const diff = compareTo !== null && compareTo !== undefined ? value - compareTo : null;
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontWeight: bold ? 700 : 600, color: bold ? NAVY : '#0F7B6C', fontSize: '0.83rem' }}>
        {ugx(value)}
      </div>
      {diff !== null && diff !== 0 && (
        <div style={{ fontSize: '0.68rem', color: diff > 0 ? '#C0392B' : '#1E8449' }}>
          {diff > 0 ? '▲' : '▼'} {ugx(Math.abs(diff))}
        </div>
      )}
    </div>
  );
}

interface Props {
  accountability: AccountabilityResponse;
  requisitionId:  string;
  userRole:       UserRole | undefined;
  onUpdated:      () => void;
}

export default function AccountabilityTable({ accountability, requisitionId, userRole, onUpdated }: Props) {
  const { showToast } = useToast();
  const myStage = stageForRole(userRole);

  // A reviewer acts only when the accountability is sitting at their step.
  const canReview = !!myStage && accountability.status === STAGE_META[myStage].needs;

  const [amounts, setAmounts] = useState<Record<string, number | ''>>({});
  const [notes, setNotes]     = useState('');
  const [error, setError]     = useState('');

  const review = useReviewAccountability(requisitionId, myStage ?? 'admin');

  // Seed each reviewer's inputs from the previous column, which is what they
  // are agreeing to or adjusting.
  useEffect(() => {
    if (!canReview || !myStage) return;
    const seed: Record<string, number | ''> = {};
    for (const item of accountability.items) {
      seed[item.id] =
        myStage === 'admin'    ? item.totalCost
        : myStage === 'hr'     ? item.adminAmount ?? item.totalCost
        :                        item.hrAmount ?? item.adminAmount ?? item.totalCost;
    }
    setAmounts(seed);
  }, [canReview, myStage, accountability.items]);

  const submitReview = () => {
    if (!myStage) return;
    const rows = accountability.items.map(i => ({ id: i.id, amount: amounts[i.id] }));
    if (rows.some(r => r.amount === '' || r.amount === undefined)) {
      setError('Enter an amount for every line.');
      return;
    }
    setError('');
    review.mutate(
      { items: rows.map(r => ({ id: r.id, amount: Number(r.amount) })), notes: notes.trim() || null },
      {
        onSuccess: () => { onUpdated(); showToast('Accountability updated', 'success'); setNotes(''); },
        onError:   (err) => setError(getApiErrorMessage(err, 'Could not save the review.')),
      },
    );
  };

  const varianceKnown = accountability.status === 'DIRECTOR_APPROVED';
  const v = accountability.variance;

  return (
    <div>
      {/* Progress through the four stages */}
      <div className="d-flex align-items-center gap-1 mb-3">
        {ACCOUNTABILITY_STAGES.map((s, i) => {
          const done = stageIdx(accountability.status) >= i;
          return (
            <div key={s} className="d-flex align-items-center" style={{ flex: i < 3 ? 1 : '0 0 auto' }}>
              <span style={{
                padding: '3px 10px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 600,
                whiteSpace: 'nowrap', background: done ? NAVY : '#e9ecef', color: done ? '#fff' : '#6c757d',
              }}>
                {s.replace(/_/g, ' ')}
              </span>
              {i < 3 && <div style={{ flex: 1, height: 2, background: done ? NAVY : '#e9ecef', margin: '0 4px' }} />}
            </div>
          );
        })}
      </div>

      {error && <Alert variant="danger" className="py-2 small">{error}</Alert>}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
          <thead>
            <tr style={{ background: NAVY }}>
              <th style={{ ...TH, textAlign: 'center', width: 36 }}>#</th>
              <th style={TH}>Requisition Item</th>
              <th style={TH}>Category</th>
              <th style={{ ...TH, textAlign: 'center' }}>Qty</th>
              <th style={{ ...TH, textAlign: 'right' }}>Rate</th>
              <th style={{ ...TH, textAlign: 'right' }}>Admin Amount</th>
              <th style={{ ...TH, textAlign: 'right' }}>HR Amount</th>
              <th style={{ ...TH, textAlign: 'right' }}>Director Amount</th>
            </tr>
          </thead>
          <tbody>
            {accountability.items.map((item, idx) => (
              <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#F8F9FA', borderBottom: '1px solid #e9ecef' }}>
                <td style={{ ...TD, textAlign: 'center', color: '#6c757d', fontSize: '0.75rem' }}>{item.itemNumber}</td>
                <td style={{ ...TD, fontWeight: 500 }}>{item.requisitionItem}</td>
                <td style={TD}>{item.category}</td>
                <td style={{ ...TD, textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ ...TD, textAlign: 'right' }}>
                  {item.rate.toLocaleString()}
                  <div style={{ fontSize: '0.68rem', color: '#6c757d' }}>= {item.totalCost.toLocaleString()}</div>
                </td>

                {(['admin', 'hr', 'director'] as const).map(stage => (
                  <td key={stage} style={{ ...TD, minWidth: 120 }}>
                    {canReview && myStage === stage ? (
                      <Form.Control
                        type="number"
                        min={0}
                        size="sm"
                        value={amounts[item.id] ?? ''}
                        onChange={e => {
                          const raw = e.target.value;
                          setAmounts(p => ({ ...p, [item.id]: raw === '' ? '' : Math.max(0, Number(raw)) }));
                          setError('');
                        }}
                        style={{ textAlign: 'right', fontSize: '0.82rem' }}
                      />
                    ) : (
                      <AmountCell
                        value={item[STAGE_META[stage].column]}
                        compareTo={
                          stage === 'admin' ? item.totalCost
                          : stage === 'hr'  ? item.adminAmount
                          :                   item.hrAmount
                        }
                        bold={stage === 'director'}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr style={{ background: '#F2F4F7', borderTop: `2px solid ${NAVY}` }}>
              <td colSpan={4} style={{ ...TD, fontWeight: 700, color: NAVY }}>TOTALS</td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: 600, color: NAVY }}>
                {ugx(accountability.totalSubmitted)}
                <div style={{ fontSize: '0.68rem', color: '#6c757d', fontWeight: 400 }}>Submitted</div>
              </td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: 600, color: '#0F7B6C' }}>
                {accountability.totalAdminAmount > 0 ? ugx(accountability.totalAdminAmount) : '—'}
              </td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: 600, color: '#0F7B6C' }}>
                {accountability.totalHRAmount > 0 ? ugx(accountability.totalHRAmount) : '—'}
              </td>
              <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: NAVY }}>
                {accountability.totalDirectorAmount > 0 ? ugx(accountability.totalDirectorAmount) : '—'}
              </td>
            </tr>

            <tr>
              <td colSpan={6} style={{ ...TD, textAlign: 'right', fontSize: '0.82rem', color: '#6c757d' }}>
                Requisitioned
              </td>
              <td colSpan={2} style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>
                {ugx(accountability.originalAmount)}
              </td>
            </tr>

            {varianceKnown && (
              <tr>
                <td colSpan={6} style={{ ...TD, textAlign: 'right', fontWeight: 700 }}>
                  {v > 0 ? 'Overspend' : v < 0 ? 'Surplus to return' : 'Balanced'}
                </td>
                <td colSpan={2} style={{
                  ...TD, textAlign: 'right', fontWeight: 700,
                  color: v > 0 ? '#C0392B' : v < 0 ? '#1E8449' : NAVY,
                }}>
                  {v !== 0 && (v > 0 ? '+ ' : '− ')}{ugx(Math.abs(v))}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>

      {/* Reviewer notes so far */}
      {(accountability.adminNotes || accountability.hrNotes || accountability.directorNotes) && (
        <div className="mt-3 small">
          {accountability.adminNotes && (
            <div><strong>Admin:</strong> <span className="text-muted">{accountability.adminNotes}</span></div>
          )}
          {accountability.hrNotes && (
            <div><strong>HR:</strong> <span className="text-muted">{accountability.hrNotes}</span></div>
          )}
          {accountability.directorNotes && (
            <div><strong>Director:</strong> <span className="text-muted">{accountability.directorNotes}</span></div>
          )}
        </div>
      )}

      <div className="mt-3 d-flex gap-2 align-items-center flex-wrap">
        {canReview && myStage && (
          <>
            <Form.Control
              size="sm"
              placeholder="Notes (optional)"
              value={notes}
              maxLength={1000}
              onChange={e => setNotes(e.target.value)}
              style={{ maxWidth: 320 }}
            />
            <Button
              size="sm"
              variant={myStage === 'director' ? 'success' : 'primary'}
              onClick={submitReview}
              disabled={review.isPending}
            >
              {review.isPending
                ? <><Spinner as="span" size="sm" animation="border" className="me-1" /> Saving…</>
                : STAGE_META[myStage].label}
            </Button>
          </>
        )}

        <Badge
          bg={
            accountability.status === 'DIRECTOR_APPROVED' ? 'success'
            : accountability.status === 'HR_REVIEWED'     ? 'primary'
            : accountability.status === 'ADMIN_REVIEWED'  ? 'info'
            : 'warning'
          }
          text={['SUBMITTED', 'ADMIN_REVIEWED'].includes(accountability.status) ? 'dark' : undefined}
          style={{ alignSelf: 'center', fontSize: '0.72rem' }}
        >
          {accountability.status.replace(/_/g, ' ')}
        </Badge>

        {!canReview && myStage && accountability.status !== 'DIRECTOR_APPROVED' && (
          <span className="text-muted small">
            Waiting on {ACCOUNTABILITY_STAGES[stageIdx(accountability.status) + 1]?.replace(/_/g, ' ').toLowerCase()}.
          </span>
        )}
      </div>
    </div>
  );
}
