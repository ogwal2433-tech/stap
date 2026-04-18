import { useRef, useState } from 'react';
import { Badge, ListGroup, Overlay, Popover } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useUnreadCount, useNotifications, useMarkAsRead, useMarkAllAsRead } from '../../hooks/useNotifications';
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

const ENTITY_ROUTE: Record<string, string> = {
  complaint: '/complaints',
  invoice:   '/finance',
  guard:     '/guards',
  payroll:   '/finance',
};

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
    if (n.entityType && ENTITY_ROUTE[n.entityType]) {
      navigate(ENTITY_ROUTE[n.entityType]);
    }
  }

  return (
    <>
      <button
        ref={target}
        onClick={() => setShow(s => !s)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          position: 'relative', padding: '4px 8px', color: 'white',
        }}
        aria-label="Notifications"
      >
        <span style={{ fontSize: '1.4rem' }}>🔔</span>
        {count > 0 && (
          <Badge
            bg="danger"
            pill
            style={{
              position: 'absolute', top: 0, right: 0, fontSize: '0.6rem',
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
                      <span style={{ fontSize: '1.1rem' }}>{TYPE_ICON[n.type] ?? '🔔'}</span>
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
