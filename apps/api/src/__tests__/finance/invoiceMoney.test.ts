import { describe, it, expect } from 'vitest';
import {
  AddFeeIncrementSchema,
  CreateInvoiceSchema,
  GenerateInvoiceSchema,
  RecordPaymentSchema,
  UpdateInvoiceSchema,
  formatUgx,
  isTwoDpOrWhole,
  roundMoney,
} from '@security360/shared';

/**
 * An invoice line's rate is a daily figure, and the one that matters — a
 * contract's monthly rate divided by 30 — is rarely a whole shilling. These pin
 * the money granularity rule at the boundary, so a rate like 16666.67 is billed
 * as typed and anything finer is refused rather than quietly rounded.
 */

const INVOICE_BODY = {
  clientId:       'client-1',
  periodStart:    '2026-09-01T00:00:00.000Z',
  periodEnd:      '2026-09-30T00:00:00.000Z',
  guardsDeployed: 5,
  dueDate:        '2026-10-30T00:00:00.000Z',
};

describe('isTwoDpOrWhole()', () => {
  it('accepts whole shillings and two-decimal amounts', () => {
    expect(isTwoDpOrWhole(500000)).toBe(true);
    expect(isTwoDpOrWhole(16666.67)).toBe(true);
    expect(isTwoDpOrWhole(0)).toBe(true);
  });

  it('accepts an amount the binary representation of which is inexact', () => {
    // The obvious multipleOf(0.01) check fails here: 1.19 * 100 is
    // 118.99999999999999 in floating point.
    expect(isTwoDpOrWhole(1.19)).toBe(true);
    expect(isTwoDpOrWhole(2500000.5)).toBe(true);
  });

  it('rejects sub-cent precision and non-numbers', () => {
    expect(isTwoDpOrWhole(16666.678)).toBe(false);
    expect(isTwoDpOrWhole(0.005)).toBe(false);
    expect(isTwoDpOrWhole(NaN)).toBe(false);
    expect(isTwoDpOrWhole(Infinity)).toBe(false);
  });
});

describe('roundMoney()', () => {
  it('snaps the dust a float sum leaves behind back to two decimals', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(16666.666666666668)).toBe(16666.67);
    // The shape the invoice service really produces: a monthly 500,000 snapped
    // to a 16,666.67 daily rate, then multiplied by 5 guards over 30 days. That
    // product is 2,500,000.5000000004 in binary, not 2,500,000.5.
    expect(roundMoney(5 * 16666.67 * 30)).toBe(2500000.5);
    expect(roundMoney(2500000)).toBe(2500000);
  });
});

describe('formatUgx()', () => {
  it('prints decimals only when the amount has them', () => {
    expect(formatUgx(2400000)).toBe('UGX 2,400,000');
    expect(formatUgx(16666.5)).toBe('UGX 16,666.50');
    expect(formatUgx(2500000.5)).toBe('UGX 2,500,000.50');
    expect(formatUgx(null)).toBe('UGX 0');
  });
});

describe('invoice schemas accept two decimals on every money field', () => {
  it('CreateInvoiceSchema.ratePerGuard', () => {
    expect(CreateInvoiceSchema.safeParse({ ...INVOICE_BODY, ratePerGuard: 16666.67 }).success).toBe(true);
    const bad = CreateInvoiceSchema.safeParse({ ...INVOICE_BODY, ratePerGuard: 16666.678 });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0].message).toBe('Use at most two decimal places');
  });

  it('CreateInvoiceSchema.taxAmount', () => {
    expect(CreateInvoiceSchema.safeParse({ ...INVOICE_BODY, ratePerGuard: 1000, taxAmount: 30.09 }).success).toBe(true);
    expect(CreateInvoiceSchema.safeParse({ ...INVOICE_BODY, ratePerGuard: 1000, taxAmount: 30.009 }).success).toBe(false);
  });

  it('GenerateInvoiceSchema.lineItemOverrides[].ratePerGuard, including a value arriving as form text', () => {
    const payload = {
      contractId:         'contract-1',
      billingPeriodStart: '2026-09-01T00:00:00.000Z',
      billingPeriodEnd:   '2026-09-30T00:00:00.000Z',
      billingDays:        30,
      lineItemOverrides:  [{ guardType: 'Armed Guard', count: 5, ratePerGuard: '16666.67', billingDays: 30 }],
    };
    const parsed = GenerateInvoiceSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect((parsed.data as any).lineItemOverrides[0].ratePerGuard).toBe(16666.67);

    expect(
      GenerateInvoiceSchema.safeParse({
        ...payload,
        lineItemOverrides: [{ guardType: 'Armed Guard', count: 5, ratePerGuard: 16666.678, billingDays: 30 }],
      }).success,
    ).toBe(false);
  });

  it('RecordPaymentSchema.amountPaid — an invoice with cents can be settled to the cent', () => {
    expect(RecordPaymentSchema.safeParse({ invoiceId: 'inv-1', amountPaid: 2500000.5, mode: 'BANK' }).success).toBe(true);
    expect(RecordPaymentSchema.safeParse({ invoiceId: 'inv-1', amountPaid: 2500000.555, mode: 'BANK' }).success).toBe(false);
  });

  it('UpdateInvoiceSchema.lineItems[].ratePerGuard', () => {
    const line = { description: 'Armed Guard', guardsCount: 2, ratePerGuard: 16666.67, days: 30 };
    expect(UpdateInvoiceSchema.safeParse({ lineItems: [line] }).success).toBe(true);
    expect(UpdateInvoiceSchema.safeParse({ lineItems: [{ ...line, ratePerGuard: 16666.675 }] }).success).toBe(false);
  });

  it('AddFeeIncrementSchema.ratePerGuard', () => {
    const body = { description: 'Extra cover from the 15th', guardCount: 2, ratePerGuard: 16666.67, days: 15 };
    expect(AddFeeIncrementSchema.safeParse(body).success).toBe(true);
    expect(AddFeeIncrementSchema.safeParse({ ...body, ratePerGuard: 16666.674 }).success).toBe(false);
  });

  it('leaves counts and day numbers whole', () => {
    // Only money takes decimals; a fractional guard or day is a data error.
    expect(
      GenerateInvoiceSchema.safeParse({
        contractId:         'contract-1',
        billingPeriodStart: '2026-09-01T00:00:00.000Z',
        billingPeriodEnd:   '2026-09-30T00:00:00.000Z',
        lineItemOverrides:  [{ guardType: 'Armed Guard', count: 2.5, ratePerGuard: 16666.67, billingDays: 30 }],
      }).success,
    ).toBe(false);
  });
});
