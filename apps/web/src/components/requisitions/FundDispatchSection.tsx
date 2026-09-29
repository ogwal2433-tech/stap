import { useState } from 'react';
import { Badge, Button, Spinner } from 'react-bootstrap';
import {
  ROLES, dispatchChannelLabel,
  type RequisitionResponse, type UserRole,
} from '@security360/shared';
import { useFundDispatches } from '../../hooks/useRequisitions';
import RecordDispatchModal from './RecordDispatchModal';

const NAVY = '#1B3A6B';

/** Requisition states where the money has been released — mirrors the API. */
const DISPATCHABLE_STATUSES = ['APPROVED', 'ASSIGNED', 'IN_PROGRESS'];

const FINANCE_ROLES: string[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ACCOUNTS_OFFICER];

/** Left edge colour per channel, so a payment's route reads at a glance. */
const CHANNEL_COLOUR: Record<string, string> = {
  E_TRANSACT:    '#1B3A6B',
  CASH:          '#1E8449',
  BANK_TRANSFER: '#0F7B6C',
  MOBILE_MONEY:  '#E8701A',
  CHEQUE:        '#6C3483',
  OTHER:         '#6c757d',
};

const EMPTY_BOX: React.CSSProperties = {
  border: '2px dashed #ced4da', borderRadius: '0.5rem',
  padding: '16px', textAlign: 'center', color: '#6c757d', fontSize: '0.82rem',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Props {
  requisition: RequisitionResponse;
  userRole?:   UserRole;
}

export default function FundDispatchSection({ requisition, userRole }: Props) {
  const [showModal, setShowModal] = useState(false);

  const isApproved    = DISPATCHABLE_STATUSES.includes(requisition.status);
  const isFinanceRole = !!userRole && FINANCE_ROLES.includes(userRole);

  // Only Finance and Admin may read the history, and only once funds are released.
  const canRead = isApproved && (isFinanceRole || userRole === ROLES.ADMINISTRATOR);
  const { data: dispatches = [], isLoading } = useFundDispatches(requisition.id, canRead);

  // Derived from the rows rather than the requisition prop, which is a snapshot
  // taken when the detail modal opened and does not refresh underneath it.
  const totalDispatched = dispatches.reduce((sum, d) => sum + d.amount, 0);
  const approved  = requisition.amount;
  const remaining = Math.max(0, approved - totalDispatched);
  const pct       = approved > 0 ? Math.min(100, (totalDispatched / approved) * 100) : 0;
  const fully     = approved > 0 && totalDispatched >= approved;
  const dispatchStatus = fully ? 'FULLY_DISPATCHED' : totalDispatched > 0 ? 'PARTIAL' : 'PENDING';

  return (
    <div className="mt-2">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <div className="fw-bold" style={{ color: NAVY }}>💵 Fund Dispatch</div>
          <div className="text-muted" style={{ fontSize: '0.78rem' }}>
            Track how approved funds were sent
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <Badge
            bg={fully ? 'success' : totalDispatched > 0 ? 'warning' : 'secondary'}
            text={dispatchStatus === 'PARTIAL' ? 'dark' : undefined}
          >
            {dispatchStatus.replace(/_/g, ' ')}
          </Badge>
          {isFinanceRole && isApproved && !fully && (
            <Button size="sm" style={{ background: NAVY, borderColor: NAVY }} onClick={() => setShowModal(true)}>
              + Record Dispatch
            </Button>
          )}
        </div>
      </div>

      {canRead && (
        <div className="mb-3">
          <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.78rem' }}>
            <span className="text-muted">Dispatched</span>
            <span className="fw-bold">
              UGX {totalDispatched.toLocaleString()} of UGX {approved.toLocaleString()}
            </span>
          </div>
          <div style={{ background: '#e9ecef', borderRadius: '10rem', height: '8px', overflow: 'hidden' }}>
            <div
              style={{
                width:        `${pct}%`,
                height:       '100%',
                background:   fully ? '#1E8449' : '#F2AA20',
                borderRadius: '10rem',
                transition:   'width 0.3s',
              }}
            />
          </div>
          <div style={{ fontSize: '0.72rem', color: '#6c757d', marginTop: '4px', textAlign: 'right' }}>
            {Math.round(pct)}% dispatched
            {!fully && (
              <span className="ms-2" style={{ color: '#E8701A' }}>
                · UGX {remaining.toLocaleString()} remaining
              </span>
            )}
          </div>
        </div>
      )}

      {!isApproved ? (
        <div style={EMPTY_BOX}>Requisition must be approved before funds can be dispatched.</div>
      ) : !canRead ? (
        <div style={EMPTY_BOX}>Only Finance and Administration can view the dispatch record.</div>
      ) : isLoading ? (
        <div className="text-center py-3"><Spinner animation="border" size="sm" /></div>
      ) : dispatches.length === 0 ? (
        <div style={EMPTY_BOX}>
          No fund dispatches recorded yet.
          {isFinanceRole && ' Click “+ Record Dispatch” to log a payment.'}
        </div>
      ) : (
        <div>
          {dispatches.map((d) => (
            <div
              key={d.id}
              style={{
                border:       '1px solid #e9ecef',
                borderRadius: '0.5rem',
                padding:      '12px 16px',
                marginBottom: '8px',
                borderLeft:   `4px solid ${CHANNEL_COLOUR[d.channel] ?? '#6c757d'}`,
              }}
            >
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <div className="d-flex align-items-center gap-2">
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: NAVY }}>
                      UGX {d.amount.toLocaleString()}
                    </span>
                    <Badge bg="secondary" style={{ fontSize: '0.7rem' }}>
                      {dispatchChannelLabel(d.channel)}
                    </Badge>
                  </div>

                  {d.reference && (
                    <div className="text-muted small mt-1">
                      Ref:{' '}
                      <code style={{ background: '#F2F4F7', padding: '1px 6px', borderRadius: '3px' }}>
                        {d.reference}
                      </code>
                    </div>
                  )}
                  {d.recipientName && (
                    <div className="text-muted small">
                      To: {d.recipientName}
                      {d.recipientAccount && ` (${d.recipientAccount})`}
                    </div>
                  )}
                  {d.notes && (
                    <div className="text-muted small fst-italic mt-1">{d.notes}</div>
                  )}
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.78rem', color: '#6c757d' }}>{formatDate(d.dispatchDate)}</div>
                  <div style={{ fontSize: '0.72rem', color: '#adb5bd' }}>by {d.dispatchedBy.name}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <RecordDispatchModal
          requisition={requisition}
          alreadyDispatched={totalDispatched}
          onClose={() => setShowModal(false)}
          onSuccess={() => { /* the mutation invalidates the dispatch list */ }}
        />
      )}
    </div>
  );
}
