import { useState } from 'react';
import { Badge, Button, Form, Spinner } from 'react-bootstrap';
import { ROLE_CONFIG, STAFF_ROLE_VALUES, ROLES } from '@stap/shared';
import { useStaffList } from '../../hooks/useStaff';
import { useAuth } from '../../context/AuthContext';
import { formatRelativeDate } from '../../lib/dateUtils';
import InitialsAvatar from '../../components/ui/InitialsAvatar';
import CreateStaffModal from '../../components/staff/CreateStaffModal';
import StaffProfileModal from '../../components/staff/StaffProfileModal';

type StatusFilter = 'active' | 'inactive' | 'all';

const STATUS_OPTIONS: StatusFilter[] = ['active', 'inactive', 'all'];

/** Roles allowed to add a staff account. Mirrors STAFF_MANAGER_ROLES on the API. */
const CAN_ADD_STAFF: string[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER, ROLES.ADMINISTRATOR];

const TABLE_HEADERS = [
  'Staff Member', 'Role', 'Department', 'Contact', 'Last Login', 'Status', 'Actions',
];

const CHIP_BASE: React.CSSProperties = {
  borderRadius: '0.5rem',
  padding:      '8px 14px',
  cursor:       'pointer',
  whiteSpace:   'nowrap',
  fontSize:     '0.8rem',
  fontWeight:   600,
  userSelect:   'none',
};

export default function StaffPage() {
  const { user } = useAuth();

  const [roleFilter, setRoleFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  // `search` is what the query runs on; `searchInput` is what is being typed.
  // Keeping them apart means the list refetches on Enter, not per keystroke.
  const [search, setSearch]             = useState('');
  const [searchInput, setSearchInput]   = useState('');
  const [page, setPage]                 = useState(1);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [profileId, setProfileId]             = useState<string | null>(null);

  const { data: staffData, isLoading, isError, refetch } = useStaffList({
    role:     roleFilter || undefined,
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'active',
    search:   search || undefined,
    page,
    limit:    20,
  });

  const canAddStaff  = CAN_ADD_STAFF.includes(user?.role ?? '');
  const countByRole  = staffData?.countByRole ?? {};
  const totalActive  = Object.values(countByRole).reduce((a, b) => a + b, 0);
  const hasFilters   = !!search || !!roleFilter || statusFilter !== 'active';

  const runSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setSearchInput('');
    setRoleFilter('');
    setStatusFilter('active');
    setPage(1);
  };

  return (
    <div className="p-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-4">
        <div>
          <h5 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>👥 Staff Management</h5>
          <div className="text-muted small">
            {staffData?.total ?? 0} in this view · {totalActive} active staff overall
          </div>
        </div>
        {canAddStaff && (
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            + Add Staff Member
          </Button>
        )}
      </div>

      {/* ── Role stat cards ────────────────────────────────────────────────── */}
      <div
        style={{
          display:       'flex',
          gap:           '8px',
          overflowX:     'auto',
          marginBottom:  '20px',
          paddingBottom: '4px',
        }}
      >
        <div
          role="button"
          onClick={() => { setRoleFilter(''); setPage(1); }}
          style={{
            ...CHIP_BASE,
            background: !roleFilter ? '#1B3A6B' : 'white',
            color:      !roleFilter ? 'white' : '#1A1A1A',
            border:     '2px solid #1B3A6B',
          }}
        >
          All Roles
          <span style={{ marginLeft: '6px', opacity: 0.8 }}>({totalActive})</span>
        </div>

        {STAFF_ROLE_VALUES.map(role => {
          const count = countByRole[role] ?? 0;
          // A role nobody holds is noise on a bar people scan for head-counts.
          if (count === 0) return null;
          const active = roleFilter === role;
          return (
            <div
              key={role}
              role="button"
              onClick={() => { setRoleFilter(active ? '' : role); setPage(1); }}
              style={{
                ...CHIP_BASE,
                fontWeight: active ? 600 : 500,
                background: active ? '#1B3A6B' : 'white',
                color:      active ? 'white' : '#1A1A1A',
                border:     `2px solid ${active ? '#1B3A6B' : '#e9ecef'}`,
              }}
            >
              {ROLE_CONFIG[role]?.icon} {ROLE_CONFIG[role]?.label ?? role}
              <span style={{ marginLeft: '6px', opacity: 0.7 }}>({count})</span>
            </div>
          );
        })}
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          background:   '#F2F4F7',
          borderRadius: '0.5rem',
          padding:      '12px 16px',
          marginBottom: '16px',
          display:      'flex',
          gap:          '10px',
          flexWrap:     'wrap',
          alignItems:   'center',
        }}
      >
        <div style={{ display: 'flex', gap: '6px', flex: 1, minWidth: '220px' }}>
          <Form.Control
            size="sm"
            placeholder="Search name, email, phone, department…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
          />
          <Button size="sm" variant="primary" onClick={runSearch}>Search</Button>
        </div>

        <div className="d-flex gap-1">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => { setStatusFilter(s); setPage(1); }}
              style={{
                padding:       '5px 12px',
                border:        '2px solid #ced4da',
                borderRadius:  '0.375rem',
                background:    statusFilter === s ? '#1B3A6B' : 'white',
                color:         statusFilter === s ? 'white' : '#4A5568',
                cursor:        'pointer',
                fontSize:      '0.78rem',
                fontWeight:    600,
                textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {hasFilters && (
          <Button size="sm" variant="outline-secondary" onClick={clearFilters}>Clear</Button>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="d-flex justify-content-center py-5">
          <Spinner animation="border" variant="primary" />
        </div>
      ) : isError ? (
        <div
          style={{
            border:       '2px dashed #F5C6CB',
            borderRadius: '0.5rem',
            padding:      '32px',
            textAlign:    'center',
            color:        '#C0392B',
          }}
        >
          <div className="fw-bold mb-2">The staff list could not be loaded.</div>
          <Button size="sm" variant="outline-danger" onClick={() => void refetch()}>Try again</Button>
        </div>
      ) : !staffData?.data.length ? (
        <div
          style={{
            border:       '2px dashed #ced4da',
            borderRadius: '0.5rem',
            padding:      '40px',
            textAlign:    'center',
            color:        '#6c757d',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '8px' }}>👥</div>
          <div className="fw-bold mb-1">No staff members found</div>
          <div style={{ fontSize: '0.82rem' }}>
            {hasFilters
              ? 'Nothing matches these filters — try clearing them.'
              : 'Click "+ Add Staff Member" to create the first account.'}
          </div>
        </div>
      ) : (
        <>
          <div style={{ border: '1px solid #e9ecef', borderRadius: '0.5rem', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ background: '#1B3A6B' }}>
                  {TABLE_HEADERS.map(h => (
                    <th
                      key={h}
                      style={{
                        padding:    '10px 12px',
                        color:      'white',
                        fontWeight: 700,
                        fontSize:   '0.78rem',
                        textAlign:  'left',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffData.data.map((s, i) => (
                  <tr
                    key={s.id}
                    style={{
                      // Deactivated rows are tinted and dimmed so they read as
                      // records rather than as people currently on the system.
                      background:   !s.isActive ? '#FEF9E7' : i % 2 === 0 ? '#fff' : '#F8F9FA',
                      borderBottom: '1px solid #e9ecef',
                      opacity:      s.isActive ? 1 : 0.75,
                    }}
                  >
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <InitialsAvatar name={s.name} size={36} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{s.name}</div>
                          <div style={{ fontSize: '0.72rem', color: '#6c757d' }}>{s.email}</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem' }}>
                        <span>{s.roleConfig?.icon}</span>
                        <span style={{ fontWeight: 600, color: '#1B3A6B' }}>
                          {s.roleConfig?.label ?? s.role.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '10px 12px', fontSize: '0.78rem', color: '#4A5568' }}>
                      <div>{s.department ?? '—'}</div>
                      {s.jobTitle && (
                        <div style={{ fontSize: '0.7rem', color: '#6c757d' }}>{s.jobTitle}</div>
                      )}
                    </td>

                    <td style={{ padding: '10px 12px', fontSize: '0.75rem', color: '#6c757d' }}>
                      {s.phone ?? '—'}
                    </td>

                    <td style={{ padding: '10px 12px', fontSize: '0.75rem', color: '#6c757d', whiteSpace: 'nowrap' }}>
                      {formatRelativeDate(s.lastLoginAt)}
                    </td>

                    <td style={{ padding: '10px 12px' }}>
                      <Badge bg={s.isActive ? 'success' : 'secondary'} style={{ fontSize: '0.68rem' }}>
                        {s.isActive ? '● Active' : '● Inactive'}
                      </Badge>
                    </td>

                    <td style={{ padding: '10px 12px' }}>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                        onClick={() => setProfileId(s.id)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {staffData.pages > 1 && (
            <div className="d-flex justify-content-between align-items-center mt-3">
              <div className="text-muted small">{staffData.total} staff members</div>
              <div className="d-flex gap-2 align-items-center">
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  ← Prev
                </Button>
                <span className="text-muted small">{page} / {staffData.pages}</span>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={page >= staffData.pages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next →
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showCreateModal && (
        <CreateStaffModal
          show
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => setShowCreateModal(false)}
        />
      )}

      {profileId && (
        <StaffProfileModal
          staffId={profileId}
          show
          onClose={() => setProfileId(null)}
        />
      )}
    </div>
  );
}
