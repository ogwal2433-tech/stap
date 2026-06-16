import { Badge, Button } from 'react-bootstrap';
import type { ComplaintResponse } from '@stap/shared';
import { COMPLAINT_SEVERITY_COLORS, COMPLAINT_STATUS_COLORS } from '@stap/shared';

const BORDER_COLORS: Record<string, string> = {
  OPEN:                '#6c757d',
  UNDER_INVESTIGATION: '#ffc107',
  RESOLVED:            '#1E8449',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-UG', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

interface ComplaintCardProps {
  complaint:  ComplaintResponse;
  onViewMore: () => void;
}

export default function ComplaintCard({ complaint, onViewMore }: ComplaintCardProps) {
  const borderColor = BORDER_COLORS[complaint.status] ?? '#ced4da';

  return (
    <div
      style={{
        border:       '1px solid #e9ecef',
        borderRadius: '0.5rem',
        padding:      '14px 16px',
        marginBottom: '10px',
        borderLeft:   `4px solid ${borderColor}`,
        background:   '#fff',
        transition:   'box-shadow 0.1s',
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
      onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.boxShadow = 'none')}
    >
      {/* Top row: subject + badges */}
      <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1A1A1A', flex: 1, minWidth: 0 }}>
          {complaint.subject}
        </div>
        <div className="d-flex gap-1 flex-shrink-0">
          <Badge
            bg={COMPLAINT_SEVERITY_COLORS[complaint.severity]}
            text={complaint.severity === 'MEDIUM' ? 'dark' : undefined}
            style={{ fontSize: '0.68rem' }}
          >
            {complaint.severity}
          </Badge>
          <Badge
            bg={COMPLAINT_STATUS_COLORS[complaint.status]}
            text={complaint.status === 'UNDER_INVESTIGATION' ? 'dark' : undefined}
            style={{ fontSize: '0.68rem' }}
          >
            {complaint.status.replace('_', ' ')}
          </Badge>
        </div>
      </div>

      {/* Description preview */}
      <div
        style={{
          fontSize:        '0.82rem',
          color:           '#4A5568',
          lineHeight:      1.5,
          marginBottom:    '10px',
          overflow:        'hidden',
          display:         '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {complaint.description}
      </div>

      {/* Bottom row: meta + view more */}
      <div className="d-flex align-items-center justify-content-between">
        <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
          {complaint.category.replace(/_/g, ' ')}
          {' · '}
          {formatDate(complaint.createdAt)}
          {complaint.daysOpen > 0 && (
            <> · <span style={{ color: complaint.daysOpen > 7 ? '#dc3545' : undefined }}>{complaint.daysOpen}d open</span></>
          )}
        </div>
        <Button
          size="sm"
          variant="outline-primary"
          onClick={onViewMore}
          style={{ fontSize: '0.75rem', padding: '3px 10px' }}
        >
          View More →
        </Button>
      </div>

      {/* Assigned indicator */}
      {complaint.assignedTo && (
        <div style={{ fontSize: '0.72rem', color: '#6c757d', marginTop: '4px' }}>
          👤 Assigned to <strong>{complaint.assignedTo.name}</strong>
        </div>
      )}

      {/* Resolution preview */}
      {complaint.resolution && complaint.status !== 'OPEN' && (
        <div
          style={{
            marginTop:  '8px',
            paddingTop: '8px',
            borderTop:  '1px solid #e9ecef',
            fontSize:   '0.75rem',
            color:      '#1E8449',
          }}
        >
          ✅ Resolution:{' '}
          <span style={{ color: '#4A5568', fontStyle: 'italic' }}>
            {complaint.resolution.length > 80
              ? `${complaint.resolution.substring(0, 80)}…`
              : complaint.resolution}
          </span>
        </div>
      )}
    </div>
  );
}
