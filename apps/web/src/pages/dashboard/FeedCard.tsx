import type { ReactNode } from 'react';
import { Badge } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import type { DashboardFeedItem } from '@security360/shared';

interface FeedCardProps {
  title:     string;
  icon:      string | ReactNode;
  items:     DashboardFeedItem[];
  emptyText: string;
  linkTo:    string;
  /** Builds the per-row link. Omitted when individual rows aren't navigable. */
  itemLink?: (item: DashboardFeedItem) => string;
}

export default function FeedCard({ title, icon, items, emptyText, linkTo, itemLink }: FeedCardProps) {
  return (
    <div style={{ border: '1px solid #e9ecef', borderRadius: '0.75rem', overflow: 'hidden', height: '100%' }}>
      <div
        style={{
          background: '#1B3A6B', padding: '9px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <div style={{ color: 'white', fontWeight: 700, fontSize: '0.85rem' }}>{icon} {title}</div>
        <Link to={linkTo} style={{ color: '#F2AA20', fontSize: '0.74rem', textDecoration: 'none' }}>
          View all →
        </Link>
      </div>

      <div style={{ background: 'white' }}>
        {items.length === 0 ? (
          <div style={{ padding: '18px 14px', textAlign: 'center', color: '#6c757d', fontSize: '0.8rem' }}>
            {emptyText}
          </div>
        ) : (
          items.map((item, i) => {
            const row = (
              <div
                style={{
                  padding:      '9px 14px',
                  borderBottom: i < items.length - 1 ? '1px solid #f0f0f0' : 'none',
                  display:      'flex',
                  alignItems:   'center',
                  justifyContent: 'space-between',
                  gap:          '8px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.82rem', fontWeight: 600, color: '#1A1A1A',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    {item.primary}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>{item.secondary}</div>
                </div>
                {item.badge && (
                  <Badge bg="secondary" style={{ fontSize: '0.62rem', flexShrink: 0 }}>
                    {item.badge.replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>
            );

            return itemLink
              ? <Link key={item.id} to={itemLink(item)} style={{ textDecoration: 'none', display: 'block' }}>{row}</Link>
              : <div key={item.id}>{row}</div>;
          })
        )}
      </div>
    </div>
  );
}
