import { describe, it, expect } from 'vitest';
import { buildInvoiceHtml } from '../../lib/templates/invoicePdf';
import { buildInvoiceEmail, type InvoiceEmailData } from '../../lib/templates/invoiceEmail';

/**
 * The account an invoice is paid into comes from Settings → Company Branding.
 *
 * Both the printed invoice and the emailed one carry it, and both drop the
 * whole block when nothing is saved: a document showing an empty or half
 * account number reads like a system error and invites a payment redirect.
 */

const invoice = (over: Record<string, unknown> = {}) => ({
  invoiceNumber: 'S360/INV/2026/0001',
  status:        'PENDING',
  client:        { clientName: 'KCCA', physicalAddress: 'Kampala', email: 'kcca@test.ug' },
  periodStart:   '2026-09-01T00:00:00.000Z',
  periodEnd:     '2026-09-30T00:00:00.000Z',
  dueDate:       '2026-10-30T00:00:00.000Z',
  lineItems:     [{ description: 'Armed Guard', guardsCount: 4, ratePerGuard: 16666.67, days: 30, amount: 2000000.4 }],
  payments:      [],
  subtotal:      2000000.4,
  taxAmount:     0,
  paidAmount:    0,
  outstandingBalance: 2000000.4,
  totalAmount:   2000000.4,
  ...over,
});

const STANBIC = {
  bankName:        'Stanbic Bank Uganda',
  bankBranchName:  'Nakasero',
  bankBranchNo:    '001',
  bankAccountName: 'Tiger Security Services Ltd',
  bankAccount:     '9210001234567',
};

const emailData = (company: InvoiceEmailData['company']): InvoiceEmailData => ({
  title:         'Invoice',
  clientName:    'KCCA',
  invoiceNumber: 'S360/INV/2026/0001',
  issueDate:     '01/09/2026',
  dueDate:       '30/10/2026',
  lineItems:     [{ description: 'Armed Guard', qty: 4, unitPrice: 16666.67, total: 2000000.4 }],
  subtotal:      2000000.4,
  tax:           0,
  totalAmount:   2000000.4,
  currency:      'UGX',
  company,
});

describe('invoice PDF payment details', () => {
  it('prints the bank and account details from settings', () => {
    const html = buildInvoiceHtml(invoice(), 'Invoice', STANBIC);
    expect(html).toContain('Payment Details');
    expect(html).toContain('Stanbic Bank Uganda');
    expect(html).toContain('Nakasero');
    expect(html).toContain('Tiger Security Services Ltd');
    expect(html).toContain('9210001234567');
    // Branch name and its code are one value, not two labels.
    expect(html).toContain('Branch: <strong>Nakasero · 001</strong>');
    // Stated beside the reference instruction, not in place of it.
    expect(html).toContain('quote invoice S360/INV/2026/0001 with your payment');
  });

  it('prints nothing when the deployment has saved no bank details', () => {
    for (const payment of [undefined, {}, { bankName: '', bankAccount: '' }, { bankName: null, bankAccount: null }]) {
      const html = buildInvoiceHtml(invoice(), 'Invoice', payment);
      expect(html).not.toContain('Payment Details');
      expect(html).not.toContain('Account No');
      expect(html).not.toContain('Bank:');
    }
  });

  it('prints the account alone without an empty bank label', () => {
    const html = buildInvoiceHtml(invoice(), 'Invoice', { bankAccount: '9210001234567' });
    expect(html).toContain('Account No: <strong>9210001234567</strong>');
    expect(html).not.toContain('Bank: <strong>');
  });

  it('prints only the labels it holds a value for', () => {
    // A bank that identifies branches by code alone must not print "Branch: · 001".
    const html = buildInvoiceHtml(invoice(), 'Invoice', { bankName: 'Stanbic Bank Uganda', bankBranchNo: '001' });
    expect(html).toContain('Bank: <strong>Stanbic Bank Uganda</strong>');
    expect(html).toContain('Branch: <strong>001</strong>');
    expect(html).not.toContain('Account Name');
    expect(html).not.toContain('Account No');
  });

  it('escapes a value that arrived with markup', () => {
    const html = buildInvoiceHtml(invoice(), 'Invoice', { bankName: '<script>evil</script>' });
    expect(html).not.toContain('<script>evil</script>');
    expect(html).toContain('&lt;script&gt;evil&lt;/script&gt;');
  });

  it('sits at the foot of the page, after the closing note', () => {
    // The payment instructions are the last thing on the page rather than a
    // strip in the middle of the sums, so a short invoice does not read as
    // unfinished. margin-top:auto is what holds it there.
    const html = buildInvoiceHtml(invoice(), 'Invoice', STANBIC);
    expect(html.indexOf('Thank you for your business')).toBeLessThan(html.indexOf('Payment Details'));
    expect(html).toContain('margin-top:auto');
  });
});

describe('invoice PDF dates', () => {
  it('prints a date the way a transfer form is filled in', () => {
    const html = buildInvoiceHtml(invoice(), 'Invoice');
    expect(html).toContain('01-Sept-2026 — 30-Sept-2026');
    expect(html).toContain('30-Oct-2026');
    expect(html).not.toContain('1 September 2026');
  });

  it('pads a single-digit day and keeps the day of a month-end', () => {
    const html = buildInvoiceHtml(invoice({
      periodStart: '2026-12-05T00:00:00.000Z',
      periodEnd:   '2026-12-31T00:00:00.000Z',
      dueDate:     '2027-01-01T00:00:00.000Z',
    }), 'Invoice');
    expect(html).toContain('05-Dec-2026 — 31-Dec-2026');
    expect(html).toContain('01-Jan-2027');
  });

  it('prints a payment date in the same shape', () => {
    const html = buildInvoiceHtml(invoice({
      payments: [{ createdAt: '2026-09-15T00:00:00.000Z', mode: 'BANK', referenceNumber: 'FT-1', amountPaid: 500000 }],
    }), 'Invoice', STANBIC);
    expect(html).toContain('15-Sept-2026');
  });

  it('prints an em dash for a date that was never set', () => {
    const html = buildInvoiceHtml(invoice({ dueDate: null }), 'Invoice');
    expect(html).toContain('01-Sept-2026');
    // The Due Date cell, not the billing-period separator: both use the dash.
    expect(html).toContain('<div style="font-weight:600">—</div>');
  });
});

describe('invoice email payment details', () => {
  it('names the account to pay into', () => {
    const html = buildInvoiceEmail(emailData({ name: 'Security360 Ltd', email: 'billing@test.ug', ...STANBIC }));
    expect(html).toContain('Payment details');
    expect(html).toContain('Stanbic Bank Uganda');
    expect(html).toContain('Nakasero · 001');
    expect(html).toContain('Tiger Security Services Ltd');
    expect(html).toContain('9210001234567');
  });

  it('omits the block when no account has been configured', () => {
    const html = buildInvoiceEmail(emailData({
      name: 'Security360 Ltd', email: null,
      bankName: null, bankBranchName: null, bankBranchNo: null, bankAccountName: null, bankAccount: null,
    }));
    expect(html).not.toContain('Payment details');
    expect(html).not.toContain('Account No');
  });
});
