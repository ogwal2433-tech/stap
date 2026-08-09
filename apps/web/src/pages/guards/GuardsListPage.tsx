import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Badge, Button, ButtonGroup, Col, Dropdown, Form,
  Pagination, Row, Spinner, Table,
} from 'react-bootstrap';
import { useGuardList, useUpdateGuardStatus } from '../../hooks/useGuards';
import RoleGuard from '../../components/RoleGuard';
import InitialsAvatar from '../../components/ui/InitialsAvatar';
import StatusChangeModal from '../../components/guards/StatusChangeModal';
import { useToast } from '../../context/ToastContext';
import {
  ROLES, GUARD_CONTRACT_TYPES, GUARD_WRITE_ROLES, FINANCE_ROLES, type UserRole,
} from '@stap/shared';
import { GUARD_STATUS_CONFIG, guardStatusLabel, type GuardEmploymentStatus } from '@stap/shared';
import type { GuardResponse } from '@stap/shared';
import { useGuardRanks } from '../../hooks/useSettings';

const STATUS_BADGE: Record<string, string> = Object.fromEntries(
  Object.entries(GUARD_STATUS_CONFIG).map(([value, cfg]) => [value, cfg.colour]),
);

/** Bootstrap's warning/info fills are light — they need dark text to stay legible. */
const DARK_TEXT_BADGES = ['warning', 'info'];

/** Status transitions offered on the row menu, phrased as the action not the state. */
const STATUS_ACTIONS: { value: GuardEmploymentStatus; action: string; icon: string; danger?: boolean }[] = [
  { value: 'ACTIVE',     action: 'Activate',    icon: '✅' },
  { value: 'ON_LEAVE',   action: 'Set on leave', icon: '🌴' },
  { value: 'SUSPENDED',  action: 'Suspend',     icon: '⚠️' },
  { value: 'RESIGNED',   action: 'Mark resigned', icon: '📄', danger: true },
  { value: 'TERMINATED', action: 'Terminate',   icon: '⛔', danger: true },
];

const RANK_BADGE_COLORS = ['secondary', 'info', 'primary', 'warning', 'dark'];

function contractExpiringSoon(contractEnd: string | null): boolean {
  if (!contractEnd) return false;
  const days = (new Date(contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 30;
}

interface StatusModal {
  guard: GuardResponse;
  targetStatus: GuardEmploymentStatus;
}

export default function GuardsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: ranks = [] } = useGuardRanks(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [rank, setRank] = useState('');
  const [contractType, setContractType] = useState('');
  const [probationStatus, setProbationStatus] = useState('');
  const [nidFilter, setNidFilter] = useState('');   // '' | 'true'
  const [onLeave, setOnLeave] = useState('');        // '' | 'true'
  const [sortBy, setSortBy] = useState<'firstName' | 'lastName' | 'createdAt' | 'salaryRate'>('createdAt');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [statusModal, setStatusModal] = useState<StatusModal | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isError, error, refetch } = useGuardList({
    page,
    limit,
    search:          debouncedSearch || undefined,
    status:          (status as GuardEmploymentStatus | '') || undefined,
    rank:            rank || undefined,
    contractType:    contractType as 'TEMPORARY' | 'PERMANENT' | undefined || undefined,
    probationStatus: probationStatus as 'ON_PROBATION' | 'CONFIRMED' | undefined || undefined,
    isIncompleteNID: nidFilter === 'true' ? true : undefined,
    onLeave:         onLeave === 'true' ? true : undefined,
    sortBy,
    sortOrder: 'desc',
  });

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  }, []);

  const clearAllFilters = () => {
    setSearch('');
    setStatus('');
    setRank('');
    setContractType('');
    setProbationStatus('');
    setNidFilter('');
    setOnLeave('');
    setPage(1);
  };

  const hasAnyFilter = !!(debouncedSearch || status || rank || contractType || probationStatus || nidFilter || onLeave);

  const activeFilterBadges: { label: string; clear: () => void }[] = [
    ...(status ? [{ label: guardStatusLabel(status), clear: () => { setStatus(''); setPage(1); } }] : []),
    ...(rank ? [{ label: rank, clear: () => { setRank(''); setPage(1); } }] : []),
    ...(contractType ? [{ label: GUARD_CONTRACT_TYPES[contractType] ?? contractType, clear: () => { setContractType(''); setPage(1); } }] : []),
    ...(probationStatus ? [{ label: probationStatus === 'ON_PROBATION' ? 'On Probation' : 'Confirmed', clear: () => { setProbationStatus(''); setPage(1); } }] : []),
    ...(nidFilter ? [{ label: 'NID Pending', clear: () => { setNidFilter(''); setPage(1); } }] : []),
    ...(onLeave ? [{ label: 'Currently on Leave', clear: () => { setOnLeave(''); setPage(1); } }] : []),
  ];

  const guards = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    const pages: number[] = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + 4);
    for (let i = start; i <= end; i++) pages.push(i);

    return (
      <Pagination size="sm" className="mb-0 mt-3 justify-content-center">
        <Pagination.First onClick={() => setPage(1)} disabled={page === 1} />
        <Pagination.Prev onClick={() => setPage((p) => p - 1)} disabled={page === 1} />
        {pages.map((p) => (
          <Pagination.Item key={p} active={p === page} onClick={() => setPage(p)}>
            {p}
          </Pagination.Item>
        ))}
        <Pagination.Next onClick={() => setPage((p) => p + 1)} disabled={page === totalPages} />
        <Pagination.Last onClick={() => setPage(totalPages)} disabled={page === totalPages} />
      </Pagination>
    );
  };

  return (
    <div>
      {/* Header row */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h4 className="fw-bold mb-0" style={{ color: '#1B3A6B' }}>Guards</h4>
        <div className="d-flex gap-2">
          <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => navigate('/guards/import')}
            >
              📥 Import
            </Button>
          </RoleGuard>
          <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
            <Button
              style={{ backgroundColor: '#1B3A6B', borderColor: '#1B3A6B' }}
              onClick={() => navigate('/guards/new')}
            >
              + Add Guard
            </Button>
          </RoleGuard>
        </div>
      </div>

      {/* Filter row 1: Search + Status + Sort + Limit */}
      <Row className="g-2 mb-2">
        <Col md={5}>
          <Form.Control
            placeholder="Search by name, NIN, phone, or SSLG number…"
            value={search}
            onChange={handleSearchChange}
          />
        </Col>
        <Col md={2}>
          <Form.Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            {Object.entries(GUARD_STATUS_CONFIG).map(([value, cfg]) => (
              <option key={value} value={value}>{cfg.label}</option>
            ))}
          </Form.Select>
        </Col>
        <Col md={2}>
          <Form.Select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="createdAt">Date Added</option>
            <option value="firstName">First Name</option>
            <option value="lastName">Last Name</option>
            <option value="salaryRate">Salary</option>
          </Form.Select>
        </Col>
        <Col md={2}>
          <Form.Select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
            <option value={10}>10 per page</option>
            <option value={20}>20 per page</option>
            <option value={50}>50 per page</option>
          </Form.Select>
        </Col>
        <Col md={1} className="d-flex align-items-center">
          {hasAnyFilter && (
            <Button variant="link" size="sm" className="text-decoration-none p-0 text-muted" onClick={clearAllFilters}>
              Clear Filters
            </Button>
          )}
        </Col>
      </Row>

      {/* Filter row 2: Rank + Contract + Probation + NID + On Leave */}
      <Row className="g-2 mb-3">
        <Col md={2}>
          <Form.Select value={rank} onChange={(e) => { setRank(e.target.value); setPage(1); }}>
            <option value="">All Ranks</option>
            {ranks.map((r) => (
              <option key={r.id} value={r.name}>{r.name}</option>
            ))}
          </Form.Select>
        </Col>
        <Col md={2}>
          <Form.Select value={contractType} onChange={(e) => { setContractType(e.target.value); setPage(1); }}>
            <option value="">All Contracts</option>
            <option value="PERMANENT">Permanent</option>
            <option value="TEMPORARY">Temporary</option>
          </Form.Select>
        </Col>
        <Col md={2}>
          <Form.Select value={probationStatus} onChange={(e) => { setProbationStatus(e.target.value); setPage(1); }}>
            <option value="">All Probation</option>
            <option value="ON_PROBATION">On Probation</option>
            <option value="CONFIRMED">Confirmed</option>
          </Form.Select>
        </Col>
        <Col md={2}>
          <Form.Select value={nidFilter} onChange={(e) => { setNidFilter(e.target.value); setPage(1); }}>
            <option value="">All NID Status</option>
            <option value="true">NID Pending</option>
          </Form.Select>
        </Col>
        <Col md={2}>
          <Form.Select value={onLeave} onChange={(e) => { setOnLeave(e.target.value); setPage(1); }}>
            <option value="">All Leave Status</option>
            <option value="true">Currently on Leave</option>
          </Form.Select>
        </Col>
      </Row>

      {/* Active filter badges */}
      {activeFilterBadges.length > 0 && (
        <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
          <span className="text-muted small">Showing:</span>
          {activeFilterBadges.map(({ label, clear }) => (
            <Badge
              key={label}
              bg="secondary"
              as="button"
              className="border-0 d-inline-flex align-items-center gap-1"
              style={{ fontSize: '0.78rem', cursor: 'pointer' }}
              onClick={clear}
            >
              {label} <span aria-hidden>X</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Results summary */}
      {pagination && (
        <p className="text-muted small mb-2">
          Showing{' '}
          {pagination.total === 0
            ? 0
            : (page - 1) * limit + 1}
          -{Math.min(page * limit, pagination.total)} of {pagination.total} guards
        </p>
      )}

      {/* Error state */}
      {isError && (
        <Alert variant="danger">
          Failed to load guards. {(error as Error)?.message}
          <Button size="sm" variant="outline-danger" className="ms-3" onClick={() => refetch()}>
            Retry
          </Button>
        </Alert>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <Table striped hover responsive className="align-middle">
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 7 }).map((__, j) => (
                  <td key={j}>
                    <p className="placeholder-glow mb-0">
                      <span className="placeholder col-10 rounded" />
                    </p>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {/* Table */}
      {!isLoading && !isError && (
        <>
          {guards.length === 0 ? (
            <Alert variant="info">
              {hasAnyFilter
                ? 'No guards match your filters. Try adjusting or clearing them.'
                : "No guards have been added yet. Click 'Add Guard' to get started."}
            </Alert>
          ) : (
            <Table striped hover responsive className="align-middle small">
              <thead className="table-dark">
                <tr>
                  <th>Photo</th>
                  <th>Name / NIN</th>
                  <th>Rank</th>
                  <th>Contract Type</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Contract</th>
                  <RoleGuard allowedRoles={FINANCE_ROLES as UserRole[]}>
                    <th>Salary</th>
                  </RoleGuard>
                  <th>Docs</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {guards.map((g) => (
                  <tr key={g.id}>
                    <td>
                      {g.photoUrl ? (
                        <img
                          src={g.photoUrl}
                          alt={g.fullName}
                          width={40}
                          height={40}
                          className="rounded-circle object-fit-cover"
                        />
                      ) : (
                        <InitialsAvatar name={g.fullName} size={40} />
                      )}
                    </td>
                    <td>
                      <div className="fw-semibold">
                        {g.fullName}
                        {g.probationStatus === 'ON_PROBATION' && (
                          <span
                            className="ms-1"
                            style={{ cursor: 'help', fontSize: '0.85rem' }}
                            title={'On probation until ' + (g.probationEndDate ? new Date(g.probationEndDate).toLocaleDateString('en-GB') : 'N/A')}
                          >
                            ⏰
                          </span>
                        )}
                        {g.isIncompleteNID && (
                          <Badge bg="warning" text="dark" className="ms-1" style={{ fontSize: '0.65rem' }}>
                            NID PENDING
                          </Badge>
                        )}
                      </div>
                      <div className="text-muted">{g.nationalId ?? '—'}</div>
                      {g.systemId && (
                        <div style={{ fontSize: '0.72rem', color: '#1B3A6B', fontFamily: 'monospace', fontWeight: 600, marginTop: 1 }}>
                          {g.systemId}
                        </div>
                      )}
                    </td>
                    <td>
                      <Badge
                        bg={RANK_BADGE_COLORS[((ranks.find((r) => r.name === g.rank)?.displayOrder ?? 1) - 1) % RANK_BADGE_COLORS.length]}
                      >
                        {g.rank}
                      </Badge>
                    </td>
                    <td>
                      <Badge
                        bg={g.contractType === 'PERMANENT' ? 'success' : 'warning'}
                        text={g.contractType === 'TEMPORARY' ? 'dark' : undefined}
                        style={{ fontSize: '0.7rem' }}
                      >
                        {GUARD_CONTRACT_TYPES[g.contractType] ?? g.contractType}
                      </Badge>
                    </td>
                    <td>{g.phone}</td>
                    <td>
                      <Badge
                        bg={STATUS_BADGE[g.employmentStatus] ?? 'secondary'}
                        text={DARK_TEXT_BADGES.includes(STATUS_BADGE[g.employmentStatus]) ? 'dark' : undefined}
                      >
                        {guardStatusLabel(g.employmentStatus)}
                      </Badge>
                    </td>
                    <td>
                      <div>{new Date(g.contractStart).toLocaleDateString()}</div>
                      {g.contractEnd && (
                        <div
                          className={`small ${
                            contractExpiringSoon(g.contractEnd) ? 'text-danger fw-semibold' : 'text-muted'
                          }`}
                        >
                          Expires: {new Date(g.contractEnd).toLocaleDateString()}
                        </div>
                      )}
                    </td>
                    <RoleGuard allowedRoles={FINANCE_ROLES as UserRole[]}>
                      <td>UGX {g.salaryRate.toLocaleString()}</td>
                    </RoleGuard>
                    <td>
                      <Badge bg="secondary">{g._count?.documents ?? 0} docs</Badge>
                    </td>
                    <td>
                      <ButtonGroup size="sm">
                        <Button variant="outline-primary" onClick={() => navigate(`/guards/${g.id}`)}>
                          View
                        </Button>
                        <RoleGuard allowedRoles={GUARD_WRITE_ROLES as UserRole[]}>
                          <Button
                            variant="outline-secondary"
                            onClick={() => navigate(`/guards/${g.id}/edit`)}
                          >
                            Edit
                          </Button>
                        </RoleGuard>
                        <RoleGuard allowedRoles={[ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER]}>
                          <Dropdown as={ButtonGroup}>
                            <Dropdown.Toggle
                              split
                              variant="outline-secondary"
                              id={`status-${g.id}`}
                            />
                            <Dropdown.Menu>
                              {STATUS_ACTIONS.filter(a => a.value !== g.employmentStatus).map(a => (
                                <Dropdown.Item
                                  key={a.value}
                                  className={a.danger ? 'text-danger' : undefined}
                                  onClick={() => setStatusModal({ guard: g, targetStatus: a.value })}
                                >
                                  {a.icon} {a.action}
                                </Dropdown.Item>
                              ))}
                            </Dropdown.Menu>
                          </Dropdown>
                        </RoleGuard>
                      </ButtonGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {renderPagination()}
        </>
      )}

      {/* Status change modal */}
      {statusModal && (
        <StatusChangeModal
          guardId={statusModal.guard.id}
          guardName={statusModal.guard.fullName}
          currentStatus={statusModal.guard.employmentStatus}
          targetStatus={statusModal.targetStatus}
          onClose={() => setStatusModal(null)}
          onSuccess={() => {
            showToast('Guard status updated', 'success');
            refetch();
          }}
        />
      )}
    </div>
  );
}
