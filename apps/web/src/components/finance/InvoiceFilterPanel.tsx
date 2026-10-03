import { useState } from 'react';
import { Button, Col, Form, Row } from 'react-bootstrap';
import { useClientList } from '../../hooks/useClients';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { SearchableSelect } from '../ui/SearchableSelect';

/**
 * The two narrowings both invoice screens offer: the days an invoice was raised,
 * and the customer it was raised for.
 *
 * One panel rather than two copies because an invoice list and an aging report
 * that worded the same filter differently, or bounded the same range differently,
 * would be two tools nobody trusts to agree.
 */

export interface InvoiceFilters {
  raisedFrom: string;
  raisedTo:   string;
  clientId:   string;
  /**
   * The picked customer's name, held beside its id. The customer is searched on
   * the server, so once the search moves on the choice is no longer among the
   * options — without this the field would go blank while still filtering.
   */
  clientName: string;
}

export const EMPTY_INVOICE_FILTERS: InvoiceFilters = {
  raisedFrom: '',
  raisedTo:   '',
  clientId:   '',
  clientName: '',
};

/** Anything on the panel actually narrowing the list? */
export const areInvoiceFiltersActive = (f: InvoiceFilters): boolean =>
  !!(f.raisedFrom || f.raisedTo || f.clientId);

/** Date inputs give YYYY-MM-DD, so comparing them as text compares them as days. */
export const isRaisedRangeInverted = (f: InvoiceFilters): boolean =>
  !!(f.raisedFrom && f.raisedTo && f.raisedFrom > f.raisedTo);

/**
 * The query the panel's choices turn into. Empty parts are left out rather than
 * sent as blanks, and an inverted range sends no dates at all: that is a slip of
 * the hand, not an empty answer, and the panel says so above the table rather
 * than letting a report come back with nothing in it.
 */
export const raisedRangeQuery = (
  f: InvoiceFilters,
): { clientId?: string; from?: string; to?: string } => {
  const inverted = isRaisedRangeInverted(f);
  return {
    clientId: f.clientId || undefined,
    from:     inverted ? undefined : f.raisedFrom || undefined,
    to:       inverted ? undefined : f.raisedTo   || undefined,
  };
};

interface Props {
  value:    InvoiceFilters;
  onChange: (next: InvoiceFilters) => void;
}

export default function InvoiceFilterPanel({ value, onChange }: Props) {
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim(), 250);
  // Searched on the server, as in the generate-invoice form — a fixed list of
  // the first twenty customers would leave everyone else impossible to filter for.
  const { data: matches, isLoading } = useClientList({
    search:    term || undefined,
    limit:     20,
    sortBy:    'clientName',
    sortOrder: 'asc',
  });
  const clients = matches?.data ?? [];

  const inverted = isRaisedRangeInverted(value);
  const set = (patch: Partial<InvoiceFilters>) => onChange({ ...value, ...patch });

  return (
    <div style={{ background: '#F2F4F7', borderRadius: '0.5rem', padding: '12px 14px', marginBottom: 16 }}>
      <Row className="g-2">
        <Col md={3} sm={6}>
          <Form.Label className="small text-muted mb-1">Raised from</Form.Label>
          <Form.Control
            type="date" size="sm" value={value.raisedFrom} max={value.raisedTo || undefined}
            isInvalid={inverted} onChange={(e) => set({ raisedFrom: e.target.value })}
          />
        </Col>
        <Col md={3} sm={6}>
          <Form.Label className="small text-muted mb-1">Raised to</Form.Label>
          <Form.Control
            type="date" size="sm" value={value.raisedTo} min={value.raisedFrom || undefined}
            isInvalid={inverted} onChange={(e) => set({ raisedTo: e.target.value })}
          />
        </Col>
        <Col md={4} sm={12}>
          <Form.Label className="small text-muted mb-1">Customer</Form.Label>
          <SearchableSelect
            options={clients.map((c) => ({
              value:    c.id,
              label:    c.clientName,
              sublabel: c.systemId ?? undefined,
            }))}
            value={value.clientId}
            selectedLabel={value.clientName}
            onChange={(id) => set({
              clientId:   id,
              clientName: id ? clients.find((c) => c.id === id)?.clientName ?? '' : '',
            })}
            onSearchChange={setSearch}
            isLoading={isLoading}
            clearable
            placeholder="All customers"
            emptyText="No customer matches that name"
            ariaLabel="Filter invoices by customer"
          />
        </Col>
        <Col md={2} sm={12} className="d-flex align-items-end">
          <Button
            size="sm" variant="outline-secondary"
            disabled={!areInvoiceFiltersActive(value)}
            onClick={() => { setSearch(''); onChange(EMPTY_INVOICE_FILTERS); }}
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
