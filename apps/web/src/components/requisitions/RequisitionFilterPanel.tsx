import { Button, Col, Form, Row } from 'react-bootstrap';
import { useStaffUsers } from '../../hooks/useUsers';
import { SearchableSelect } from '../ui/SearchableSelect';

/**
 * The two narrowings both requisition tabs offer: the days a requisition was
 * dated, and who raised it.
 *
 * One panel rather than two copies so the My Requisitions and Manage tabs word
 * and bound the same filter identically — two tables disagreeing about what
 * "last week" or "raised by X" means would be two tools nobody trusts.
 */

export interface RequisitionFilters {
  /**
   * One status, a comma list (the KPI tiles link to "approved at any stage"),
   * or '' for all. Mirrors the API's `status` param exactly.
   */
  status: string;
  dateFrom: string;
  dateTo: string;
  requestedById: string;
  /**
   * The picked requester's name, held beside its id. The list is a client-side
   * staff search, so once the search moves on the choice may no longer be among
   * the visible options — without this the field would go blank while still
   * filtering.
   */
  requestedByName: string;
  /** Only requisitions with a non-cancelled PO past its expected delivery. */
  overdue: boolean;
}

export const EMPTY_REQUISITION_FILTERS: RequisitionFilters = {
  status:         '',
  dateFrom:        '',
  dateTo:          '',
  requestedById:   '',
  requestedByName: '',
  overdue:         false,
};

/** Anything on the panel actually narrowing the list? */
export const areRequisitionFiltersActive = (f: RequisitionFilters): boolean =>
  !!(f.status || f.dateFrom || f.dateTo || f.requestedById || f.overdue);

/** Date inputs give YYYY-MM-DD, so comparing them as text compares them as days. */
export const isRequisitionDateRangeInverted = (f: RequisitionFilters): boolean =>
  !!(f.dateFrom && f.dateTo && f.dateFrom > f.dateTo);

/**
 * The query the panel's choices turn into. Empty parts are left out rather than
 * sent as blanks, and an inverted range sends no dates at all: that is a slip of
 * the hand, not an empty answer, and the panel says so above the table rather
 * than letting the list come back with nothing in it.
 */
export const requisitionFiltersQuery = (
  f: RequisitionFilters,
): { status?: string; requestedById?: string; from?: string; to?: string; overdue?: 'true' } => {
  const inverted = isRequisitionDateRangeInverted(f);
  return {
    status:        f.status || undefined,
    requestedById: f.requestedById || undefined,
    from:          inverted ? undefined : f.dateFrom || undefined,
    to:            inverted ? undefined : f.dateTo   || undefined,
    overdue:       f.overdue ? 'true' : undefined,
  };
};

/**
 * The status choices, in the order an approver meets them. "Approved (any
 * stage)" is the comma list the KPI tiles link to — an approved requisition
 * moves on to assignment and completion, and hiding those would make the
 * filter disagree with the tile that led here.
 */
export const REQUISITION_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '',                                              label: 'Any status' },
  { value: 'PENDING,SUBMITTED',                             label: 'Pending approval' },
  { value: 'APPROVED,ASSIGNED,IN_PROGRESS,COMPLETED',      label: 'Approved (any stage)' },
  { value: 'ASSIGNED,IN_PROGRESS,COMPLETED',                label: 'Assigned & completed' },
  { value: 'APPROVED',                                      label: 'Approved, not yet assigned' },
  { value: 'ASSIGNED',                                      label: 'Assigned' },
  { value: 'IN_PROGRESS',                                   label: 'In progress' },
  { value: 'COMPLETED',                                     label: 'Completed' },
  { value: 'REJECTED',                                      label: 'Rejected' },
  { value: 'CANCELLED',                                     label: 'Cancelled' },
];

interface Props {
  value:    RequisitionFilters;
  onChange: (next: RequisitionFilters) => void;
  /**
   * Hide the requester picker. The My Requisitions tab drops it for non-admins,
   * whose list the API already scopes to their own submissions — a filter that
   * could only ever match themselves would just be noise.
   */
  showRequester?: boolean;
}

export default function RequisitionFilterPanel({ value, onChange, showRequester = true }: Props) {
  // Staff rarely changes and useStaffUsers is cached, so a plain client-side
  // searchable list is enough — no server paging needed as the customer picker does.
  const { data: staffUsers = [], isLoading: staffLoading } = useStaffUsers();
  const staffOptions = staffUsers.map((u) => ({
    value:    u.id,
    label:    u.name,
    sublabel: u.role.replace(/_/g, ' '),
  }));

  const inverted = isRequisitionDateRangeInverted(value);
  const set = (patch: Partial<RequisitionFilters>) => onChange({ ...value, ...patch });

  return (
    <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '12px 14px', marginBottom: 16 }}>
      <Row className="g-2">
        <Col md={2} sm={6}>
          <Form.Label className="small text-muted mb-1">Status</Form.Label>
          <Form.Select
            size="sm" value={value.status}
            onChange={(e) => set({ status: e.target.value })}
            aria-label="Filter requisitions by status"
          >
            {REQUISITION_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Form.Select>
        </Col>
        <Col md={2} sm={6}>
          <Form.Label className="small text-muted mb-1">Dated from</Form.Label>
          <Form.Control
            type="date" size="sm" value={value.dateFrom} max={value.dateTo || undefined}
            isInvalid={inverted} onChange={(e) => set({ dateFrom: e.target.value })}
          />
        </Col>
        <Col md={2} sm={6}>
          <Form.Label className="small text-muted mb-1">Dated to</Form.Label>
          <Form.Control
            type="date" size="sm" value={value.dateTo} min={value.dateFrom || undefined}
            isInvalid={inverted} onChange={(e) => set({ dateTo: e.target.value })}
          />
        </Col>
        {showRequester && (
          <Col md={3} sm={12}>
            <Form.Label className="small text-muted mb-1">Requested by</Form.Label>
            <SearchableSelect
              options={staffOptions}
              value={value.requestedById}
              selectedLabel={value.requestedByName}
              onChange={(id) => set({
                requestedById:   id,
                requestedByName: id ? staffUsers.find((u) => u.id === id)?.name ?? '' : '',
              })}
              isLoading={staffLoading}
              clearable
              placeholder="Anyone"
              emptyText="No staff member matches that name"
              ariaLabel="Filter requisitions by requester"
            />
          </Col>
        )}
        <Col md={showRequester ? 3 : 6} sm={12} className="d-flex align-items-end gap-3">
          <Form.Check
            type="checkbox"
            label="Overdue delivery only"
            checked={value.overdue}
            onChange={(e) => set({ overdue: e.target.checked })}
            className="small text-muted mb-0"
          />
          <Button
            size="sm" variant="outline-secondary" className="ms-auto"
            disabled={!areRequisitionFiltersActive(value)}
            onClick={() => onChange(EMPTY_REQUISITION_FILTERS)}
          >
            Clear filters
          </Button>
        </Col>
      </Row>
      {inverted && (
        <div className="text-danger small mt-2">The from date must be on or before the to date.</div>
      )}
    </div>
  );
}
