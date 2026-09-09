import { Badge, Col, Row, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import type { ContractResponse } from '@stap/shared';
import { useContractExpiryAlerts } from '../../hooks/useContracts';

/**
 * The two ends of the contract calendar, side by side.
 *
 * Kept as one panel each rather than a single merged list, because they call
 * for different actions: an expiring contract is a renewal conversation that
 * can still happen before the date, an expired one is guards already on a site
 * with nothing in force covering them. A single list sorted by date buries the
 * second kind under the first.
 */

const DATE = { day: 'numeric', month: 'short', year: 'numeric' } as const;
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', DATE);

/** "3d left" / "Today" / "Tomorrow" — the shape people read at a glance. */
function remainingLabel(days: number): string {
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `${days}d left`;
}

function elapsedLabel(days: number | null): string {
  if (days === null || days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

interface PanelProps {
  title:    string;
  contracts: ContractResponse[];
  empty:    string;
  loading:  boolean;
  tone: {
    headerBg:     string;
    headerBorder: string;
    headerText:   string;
    badge:        string;
    badgeText?:   'dark';
    link:         string;
  };
  renderMeta:  (c: ContractResponse) => string;
  renderBadge: (c: ContractResponse) => React.ReactNode;
  footer?:     React.ReactNode;
}

function Panel({
  title, contracts, empty, loading, tone, renderMeta, renderBadge, footer,
}: PanelProps) {
  return (
    <div
      style={{
        background:   'white',
        borderRadius: '0.75rem',
        border:       '1px solid #e9ecef',
        overflow:     'hidden',
        height:       '100%',
        display:      'flex',
        flexDirection:'column',
      }}
    >
      <div
        style={{
          background:     tone.headerBg,
          borderBottom:   `1px solid ${tone.headerBorder}`,
          padding:        '12px 16px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            '8px',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: tone.headerText }}>
          {title}
        </div>
        <Badge bg={tone.badge} text={tone.badgeText} style={{ fontSize: '0.70rem' }}>
          {contracts.length} contract{contracts.length === 1 ? '' : 's'}
        </Badge>
      </div>

      <div style={{ maxHeight: '300px', overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <Spinner size="sm" animation="border" />
          </div>
        ) : contracts.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#6c757d', fontSize: '0.82rem' }}>
            {empty}
          </div>
        ) : (
          contracts.map((c) => (
            <div
              key={c.id}
              style={{
                padding:        '10px 16px',
                borderBottom:   '1px solid #f8f9fa',
                display:        'flex',
                justifyContent: 'space-between',
                alignItems:     'center',
                gap:            '10px',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                  <Link
                    to={`/clients/${c.client.id}`}
                    style={{ color: tone.link, textDecoration: 'none' }}
                  >
                    {c.client.clientName}
                  </Link>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#6c757d', marginTop: '2px' }}>
                  {renderMeta(c)}
                </div>
              </div>
              {renderBadge(c)}
            </div>
          ))
        )}
      </div>

      {footer}
    </div>
  );
}

export default function ContractExpiryPanels() {
  const { data, isLoading } = useContractExpiryAlerts();
  const expiring = data?.expiring ?? [];
  const expired  = data?.expired  ?? [];

  const guards = (c: ContractResponse) =>
    `${c.guardsRequired} guard${c.guardsRequired === 1 ? '' : 's'}`;

  return (
    <Row className="g-3 mb-4">
      <Col lg={6}>
        <Panel
          title="Expiring Soon"
          contracts={expiring}
          loading={isLoading}
          empty="No contracts expiring in the next 30 days"
          tone={{
            headerBg:     '#FEF9E7',
            headerBorder: '#F9E79F',
            headerText:   '#856404',
            badge:        'warning',
            badgeText:    'dark',
            link:         '#1B3A6B',
          }}
          renderMeta={(c) => `${guards(c)} · Ends ${fmt(c.contractEnd)}`}
          renderBadge={(c) => (
            <Badge
              // The last week is a different conversation from the last month,
              // so it stops reading as amber before the date arrives.
              bg={c.daysRemaining <= 7 ? 'danger' : 'warning'}
              text={c.daysRemaining <= 7 ? undefined : 'dark'}
              style={{ fontSize: '0.70rem', whiteSpace: 'nowrap' }}
            >
              {remainingLabel(c.daysRemaining)}
            </Badge>
          )}
        />
      </Col>

      <Col lg={6}>
        <Panel
          title="Expired Contracts"
          contracts={expired}
          loading={isLoading}
          empty="No expired contracts"
          tone={{
            headerBg:     '#FDEDEC',
            headerBorder: '#F5B7B1',
            headerText:   '#922B21',
            badge:        'danger',
            link:         '#922B21',
          }}
          renderMeta={(c) => `${guards(c)} · Expired ${fmt(c.contractEnd)}`}
          renderBadge={(c) => (
            <div style={{ textAlign: 'right' }}>
              <Badge
                bg="danger"
                style={{ fontSize: '0.70rem', whiteSpace: 'nowrap', display: 'block', marginBottom: '4px' }}
              >
                {elapsedLabel(c.daysSinceExpiry)}
              </Badge>
              <Link
                to={`/clients/${c.client.id}`}
                style={{ fontSize: '0.68rem', color: '#922B21', textDecoration: 'underline' }}
              >
                Renew
              </Link>
            </div>
          )}
          footer={
            expired.length > 0 ? (
              <div
                style={{
                  padding:    '10px 16px',
                  background: '#FDF2F2',
                  borderTop:  '1px solid #F5B7B1',
                  fontSize:   '0.72rem',
                  color:      '#922B21',
                  textAlign:  'center',
                }}
              >
                These contracts need renewal or termination.{' '}
                <Link
                  to="/clients?contractFilter=expired"
                  style={{ color: '#922B21', fontWeight: 700, textDecoration: 'underline' }}
                >
                  View all expired
                </Link>
              </div>
            ) : undefined
          }
        />
      </Col>
    </Row>
  );
}
