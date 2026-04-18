import { useState } from 'react';
import { Alert, Badge, Button, Card, Col, Container, Row, Spinner } from 'react-bootstrap';
import { useNotifications, useMarkAsRead, useMarkAllAsRead } from '../../hooks/useNotifications';
import type { NotificationResponse } from '@stap/shared';

const TYPE_ICON: Record<string, string> = {
  ATTENDANCE_ALERT:  '🚨',
  PAYMENT_RECEIVED:  '💰',
  COMPLAINT_ASSIGNED:'📋',
  APPROVAL_REQUIRED: '✅',
  CONTRACT_EXPIRING: '⚠️',
  INCIDENT_REPORTED: '🔴',
  PAYROLL_APPROVED:  '💼',
  INVOICE_OVERDUE:   '📄',
  SYSTEM:            '🔔',
};

const TYPE_BG: Record<string, string> = {
  ATTENDANCE_ALERT:  '#fef2f2',
  PAYMENT_RECEIVED:  '#f0fdf4',
  COMPLAINT_ASSIGNED:'#fff7ed',
  APPROVAL_REQUIRED: '#f0fdf4',
  CONTRACT_EXPIRING: '#fefce8',
  INCIDENT_REPORTED: '#fef2f2',
  PAYROLL_APPROVED:  '#eff6ff',
  INVOICE_OVERDUE:   '#fef2f2',
  SYSTEM:            '#f8fafc',
};

export default function NotificationsPage() {
  const [filterRead, setFilterRead] = useState<boolean | undefined>(undefined);
  const [page, setPage]             = useState(1);

  const { data, isLoading }  = useNotifications({ isRead: filterRead, page, limit: 20 });
  const markRead              = useMarkAsRead();
  const markAllRead           = useMarkAllAsRead();

  const items      = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <Container className="py-4">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h4 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>Notifications</h4>
        <Button size="sm" variant="outline-primary" onClick={() => markAllRead.mutate()}>
          Mark All as Read
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="d-flex gap-2 mb-3">
        {([['All', undefined], ['Unread', false], ['Read', true]] as [string, boolean | undefined][]).map(([label, val]) => (
          <Button
            key={label}
            size="sm"
            variant={filterRead === val ? 'primary' : 'outline-secondary'}
            onClick={() => { setFilterRead(val); setPage(1); }}
          >
            {label}
          </Button>
        ))}
      </div>

      {isLoading && (
        <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
      )}

      {!isLoading && items.length === 0 && (
        <Alert variant="light" className="text-center text-muted">No notifications yet</Alert>
      )}

      <div className="d-flex flex-column gap-2">
        {items.map(n => (
          <NotificationCard key={n.id} n={n} onRead={id => markRead.mutate(id)} />
        ))}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="d-flex justify-content-center gap-2 mt-4">
          <Button size="sm" variant="outline-secondary" disabled={!pagination.hasPrev} onClick={() => setPage(p => p - 1)}>← Prev</Button>
          <span className="small align-self-center text-muted">Page {page} of {pagination.totalPages}</span>
          <Button size="sm" variant="outline-secondary" disabled={!pagination.hasNext} onClick={() => setPage(p => p + 1)}>Next →</Button>
        </div>
      )}
    </Container>
  );
}

function NotificationCard({ n, onRead }: { n: NotificationResponse; onRead: (id: string) => void }) {
  return (
    <Card
      className="border-0 shadow-sm"
      style={{ background: n.isRead ? '#fff' : TYPE_BG[n.type] ?? '#f8fafc', borderLeft: n.isRead ? undefined : '4px solid #1B3A6B' }}
    >
      <Card.Body className="py-2 px-3 d-flex gap-3 align-items-start">
        <div
          style={{
            width: 40, height: 40, borderRadius: '50%',
            background: '#1B3A6B20', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '1.2rem', flexShrink: 0,
          }}
        >
          {TYPE_ICON[n.type] ?? '🔔'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className={`small ${n.isRead ? 'text-muted' : 'fw-semibold'}`}>{n.title}</div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>{n.message}</div>
          <div className="text-muted" style={{ fontSize: '0.72rem' }}>{n.timeAgo}</div>
        </div>
        {!n.isRead && (
          <div className="d-flex align-items-center gap-2">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1B3A6B', display: 'inline-block' }} />
            <Button size="sm" variant="link" className="p-0 text-decoration-none small" onClick={() => onRead(n.id)}>
              Mark read
            </Button>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
