import { useRef, useState } from 'react';
import { Badge, ListGroup, Overlay, Popover } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useUnreadCount, useNotifications, useMarkAsRead, useMarkAllAsRead } from '../../hooks/useNotifications';
import type { NotificationResponse } from '@security360/shared';

const TYPE_ICON: Record<string, string> = {
  ATTENDANCE_ALERT:  'bi-person-exclamation',
  PAYMENT_RECEIVED:  'bi-cash-stack',
  COMPLAINT_ASSIGNED:'bi-megaphone',
  APPROVAL_REQUIRED: 'bi-clipboard-check',
  CONTRACT_EXPIRING: 'bi-file-earmark-clock',
  INCIDENT_REPORTED: 'bi-shield-exclamation',
  PAYROLL_APPROVED:  'bi-briefcase',
  INVOICE_OVERDUE:   'bi-file-earmark-x',
  SYSTEM:            'bi-gear',
};

const ENTITY_ROUTE: Record<string, string> = {
  complaint: '/complaints',
  invoice:   '/finance',
  payroll:   '/finance',
  payrollShare: '/finance',
};

// Guard notifications (e.g. a letter awaiting approval) link to that specific
// guard's profile rather than the generic list.
function entityRoute(entityType: string | null, entityId: string | null): string | null {
  if (entityType === 'guard' && entityId) return `/guards/${entityId}`;
  return entityType ? ENTITY_ROUTE[entityType] ?? null : null;
}

export default function NotificationBell() {
  const navigate   = useNavigate();
  const [show, setShow] = useState(false);
  const target     = useRef<HTMLButtonElement>(null);

  const { data: countData } = useUnreadCount();
  const { data: notifData } = useNotifications({ limit: 10 });
  const markRead            = useMarkAsRead();
  const markAllRead         = useMarkAllAsRead();

  const count  = countData?.count ?? 0;
  const items  = notifData?.data ?? [];

  function handleItemClick(n: NotificationResponse) {
    markRead.mutate(n.id);
    setShow(false);
    const route = entityRoute(n.entityType, n.entityId);
    if (route) navigate(route);
  }

  return (
    <>
      <button
        ref={target}
        onClick={() => setShow(s => !s)}
        style={{
          background: '#1B3A6B', border: 'none', cursor: 'pointer',
          position: 'relative', color: 'white',
          width: 34, height: 34, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
        }}
        aria-label="Notifications"
      >
        <i className="bi bi-bell-fill" style={{ fontSize: '1.35rem' }} />
        {count > 0 && (
          <Badge
            bg="danger"
            pill
            style={{
              position: 'absolute', top: -3, right: -3, fontSize: '0.6rem',
              animation: 'pulse 1.5s infinite',
            }}
          >
            {count > 99 ? '99+' : count}
          </Badge>
        )}
      </button>

      <Overlay target={target.current} show={show} placement="bottom-end" rootClose onHide={() => setShow(false)}>
        <Popover style={{ minWidth: 360, maxWidth: 420, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
          <Popover.Header className="d-flex justify-content-between align-items-center py-2">
            <strong>Notifications</strong>
            {count > 0 && (
              <button
                className="btn btn-link btn-sm p-0 text-decoration-none"
                onClick={() => markAllRead.mutate()}
                style={{ fontSize: '0.75rem' }}
              >
                Mark all as read
              </button>
            )}
          </Popover.Header>
          <Popover.Body className="p-0" style={{ maxHeight: 400, overflowY: 'auto' }}>
            {items.length === 0 ? (
              <div className="text-center text-muted small py-4">No notifications yet</div>
            ) : (
              <ListGroup variant="flush">
                {items.map(n => (
                  <ListGroup.Item
                    key={n.id}
                    action
                    onClick={() => handleItemClick(n)}
                    style={{
                      borderLeft: n.isRead ? 'none' : '3px solid #1B3A6B',
                      background: n.isRead ? undefined : '#f0f4ff',
                      cursor: 'pointer',
                    }}
                    className="py-2 px-3"
                  >
                    <div className="d-flex gap-2 align-items-start">
                      <i className={`bi ${TYPE_ICON[n.type] ?? 'bi-bell'} text-secondary`} style={{ fontSize: '1.1rem', marginTop: 2 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className={`small ${n.isRead ? '' : 'fw-semibold'}`} style={{ lineHeight: 1.3 }}>
                          {n.title}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.message.length > 60 ? n.message.slice(0, 60) + '…' : n.message}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.68rem' }}>{n.timeAgo}</div>
                      </div>
                    </div>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </Popover.Body>
          <div className="text-center py-2 border-top">
            <button
              className="btn btn-link btn-sm text-decoration-none small"
              onClick={() => { setShow(false); navigate('/notifications'); }}
            >
              View all notifications →
            </button>
          </div>
        </Popover>
      </Overlay>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
      `}</style>
    </>
  );
}
