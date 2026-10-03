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
}

export const EMPTY_REQUISITION_FILTERS: RequisitionFilters = {
  dateFrom:        '',
  dateTo:          '',
  requestedById:   '',
  requestedByName: '',
};

/** Anything on the panel actually narrowing the list? */
export const areRequisitionFiltersActive = (f: RequisitionFilters): boolean =>
  !!(f.dateFrom || f.dateTo || f.requestedById);

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
): { requestedById?: string; from?: string; to?: string } => {
  const inverted = isRequisitionDateRangeInverted(f);
  return {
    requestedById: f.requestedById || undefined,
    from:          inverted ? undefined : f.dateFrom || undefined,
    to:            inverted ? undefined : f.dateTo   || undefined,
  };
};

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
        <Col md={showRequester ? 3 : 4} sm={6}>
          <Form.Label className="small text-muted mb-1">Dated from</Form.Label>
          <Form.Control
            type="date" size="sm" value={value.dateFrom} max={value.dateTo || undefined}
            isInvalid={inverted} onChange={(e) => set({ dateFrom: e.target.value })}
          />
        </Col>
        <Col md={showRequester ? 3 : 4} sm={6}>
          <Form.Label className="small text-muted mb-1">Dated to</Form.Label>
          <Form.Control
            type="date" size="sm" value={value.dateTo} min={value.dateFrom || undefined}
            isInvalid={inverted} onChange={(e) => set({ dateTo: e.target.value })}
          />
        </Col>
        {showRequester && (
          <Col md={4} sm={12}>
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
        <Col md={showRequester ? 2 : 4} sm={12} className="d-flex align-items-end">
          <Button
            size="sm" variant="outline-secondary"
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
