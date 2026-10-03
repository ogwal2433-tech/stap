import { describe, expect, it } from 'vitest';
import { ARAgingQuerySchema, InvoiceListQuerySchema } from '@security360/shared';

/**
 * The queries behind GET /finance/invoices and GET /finance/invoices/aging are
 * the contract between the shared filter panel and the database: whatever they
 * let through is handed to a Prisma `where`. So both halves are pinned — the
 * range a user can actually type in, and the values that must be refused with a
 * 400 rather than answered with an empty list or a DATABASE_ERROR.
 */
describe('InvoiceListQuerySchema', () => {
  it('defaults the paging, so a bare call still lists invoices', () => {
    expect(InvoiceListQuerySchema.parse({})).toMatchObject({ page: 1, limit: 20 });
  });

  it('accepts the day range and customer the filter panel sends', () => {
    const query = InvoiceListQuerySchema.parse({
      from: '2026-10-01', to: '2026-10-31', clientId: 'client-1',
    });
    expect(query).toMatchObject({ from: '2026-10-01', to: '2026-10-31', clientId: 'client-1' });
  });

  it('coerces the paging a query string carries as text', () => {
    expect(InvoiceListQuerySchema.parse({ page: '3', limit: '100' })).toMatchObject({ page: 3, limit: 100 });
  });

  it('refuses a range that ends before it starts', () => {
    expect(InvoiceListQuerySchema.safeParse({ from: '2026-10-31', to: '2026-10-01' }).success).toBe(false);
  });

  it('refuses a date the database could not read', () => {
    expect(InvoiceListQuerySchema.safeParse({ from: '31/10/2026' }).success).toBe(false);
  });

  it('refuses a status no invoice ever holds', () => {
    expect(InvoiceListQuerySchema.safeParse({ status: 'SETTLED' }).success).toBe(false);
    expect(InvoiceListQuerySchema.safeParse({ status: 'PARTIALLY_PAID' }).success).toBe(true);
  });

  it('caps the page size, since the filtered set is asked for in one call', () => {
    expect(InvoiceListQuerySchema.safeParse({ limit: 501 }).success).toBe(false);
  });
});

// The aging report offers the same panel, so it has to accept exactly the same
// narrowing — a range that works on one screen and 400s on the other would be
// the sort of drift the shared schema exists to prevent.
describe('ARAgingQuerySchema', () => {
  it('accepts a bare call, since the report starts out unfiltered', () => {
    expect(ARAgingQuerySchema.parse({})).toEqual({});
  });

  it('accepts the day range and customer the filter panel sends', () => {
    expect(
      ARAgingQuerySchema.parse({ from: '2026-10-01', to: '2026-10-31', clientId: 'client-1' }),
    ).toMatchObject({ from: '2026-10-01', to: '2026-10-31', clientId: 'client-1' });
  });

  it('takes a whole day at both ends, so one date can name a single day', () => {
    expect(ARAgingQuerySchema.safeParse({ from: '2026-10-02', to: '2026-10-02' }).success).toBe(true);
  });

  it('refuses a range that ends before it starts', () => {
    const result = ARAgingQuerySchema.safeParse({ from: '2026-10-31', to: '2026-10-01' });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0].path).toEqual(['from']);
  });

  it('refuses a date the database could not read', () => {
    expect(ARAgingQuerySchema.safeParse({ to: '31/10/2026' }).success).toBe(false);
  });

  it('refuses an empty customer id rather than matching nothing', () => {
    expect(ARAgingQuerySchema.safeParse({ clientId: '' }).success).toBe(false);
  });

  it('takes no paging or status, since the report buckets every outstanding invoice', () => {
    const parsed = ARAgingQuerySchema.parse({ from: '2026-10-01' });
    expect(parsed).not.toHaveProperty('page');
    expect(parsed).not.toHaveProperty('limit');
    expect(parsed).not.toHaveProperty('status');
  });
});
