/**
 * Checks every invoice's stored balance against its payment records, and
 * repairs the ones that disagree.
 *
 * Usage:
 *   node apps/api/dist/db/reconcileInvoices.js --audit            report only
 *   node apps/api/dist/db/reconcileInvoices.js --fix [--by <id>]  repair
 *   node apps/api/dist/db/reconcileInvoices.js --audit STAP/INV/2026/0001
 *
 * paidAmount and outstandingBalance are stored on the invoice and recomputed on
 * every payment, so they are normally correct. They can still drift: a payment
 * inserted straight into the database, a crash between writing the payment and
 * updating the invoice, or a row edited by hand. This reads the payments as the
 * source of truth and reports the difference before changing anything.
 */
import prisma from './prisma';

const STATUSES = ['PENDING', 'OVERDUE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED'] as const;

interface Drift {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  storedPaid: number;
  storedOutstanding: number;
  storedStatus: string;
  actualPaid: number;
  actualOutstanding: number;
  actualStatus: string;
  overpaid: number;
}

function expectedStatus(total: number, paid: number, dueDate: Date, current: string): string {
  if (current === 'CANCELLED') return current;
  if (total - paid <= 0) return 'PAID';
  if (paid > 0) return 'PARTIALLY_PAID';
  return dueDate < new Date() ? 'OVERDUE' : 'PENDING';
}

async function collect(invoiceNumber?: string): Promise<Drift[]> {
  const invoices = await prisma.invoice.findMany({
    // A void invoice has no payments to reconcile and must stay VOID —
    // recomputing its status from payments would quietly bring it back.
    where:  { ...(invoiceNumber ? { invoiceNumber } : {}), status: { not: 'VOID' } },
    select: {
      id: true, invoiceNumber: true, totalAmount: true, paidAmount: true,
      outstandingBalance: true, status: true, dueDate: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const out: Drift[] = [];
  for (const inv of invoices) {
    // Both tables count: manual payments and mobile money.
    const [manual, momo] = await Promise.all([
      prisma.payment.aggregate({ where: { invoiceId: inv.id }, _sum: { amountPaid: true } }),
      prisma.invoicePayment.aggregate({
        where: { invoiceId: inv.id, status: 'SUCCESS' }, _sum: { amountPaid: true },
      }),
    ]);
    const actualPaid = (manual._sum.amountPaid ?? 0) + (momo._sum.amountPaid ?? 0);
    const actualOutstanding = Math.max(0, inv.totalAmount - actualPaid);
    const actualStatus = expectedStatus(inv.totalAmount, actualPaid, inv.dueDate, inv.status);

    const drifted =
      inv.paidAmount !== actualPaid ||
      inv.outstandingBalance !== actualOutstanding ||
      inv.status !== actualStatus;

    if (drifted) {
      out.push({
        id: inv.id, invoiceNumber: inv.invoiceNumber, totalAmount: inv.totalAmount,
        storedPaid: inv.paidAmount, storedOutstanding: inv.outstandingBalance,
        storedStatus: inv.status, actualPaid, actualOutstanding, actualStatus,
        // Payments beyond the invoice total. The balance floors at zero, so an
        // overpayment is otherwise invisible.
        overpaid: Math.max(0, actualPaid - inv.totalAmount),
      });
    }
  }
  return out;
}

function report(drift: Drift[], total: number): void {
  console.log('');
  if (drift.length === 0) {
    console.log(`✅ All ${total} invoice(s) agree with their payment records.`);
    console.log('');
    return;
  }
  console.log(`❌ ${drift.length} of ${total} invoice(s) disagree with their payments:`);
  console.log('');
  for (const d of drift) {
    console.log(`  ${d.invoiceNumber}  total ${d.totalAmount.toLocaleString()}`);
    console.log(`    stored: paid ${d.storedPaid.toLocaleString()}  outstanding ${d.storedOutstanding.toLocaleString()}  ${d.storedStatus}`);
    console.log(`    actual: paid ${d.actualPaid.toLocaleString()}  outstanding ${d.actualOutstanding.toLocaleString()}  ${d.actualStatus}`);
    if (d.overpaid > 0) {
      console.log(`    ⚠️  overpaid by ${d.overpaid.toLocaleString()} — payments exceed the invoice total`);
    }
  }
  console.log('');
  console.log('   Repair with:  reconcileInvoices --fix');
  console.log('');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fix = args.includes('--fix');
  const byIdx = args.indexOf('--by');
  const actor = byIdx >= 0 ? args[byIdx + 1] : null;
  const invoiceNumber = args.find((a) => a.startsWith('STAP/'));

  const total = await prisma.invoice.count({
    where: invoiceNumber ? { invoiceNumber } : undefined,
  });
  const drift = await collect(invoiceNumber);

  if (!fix) { report(drift, total); return; }

  report(drift, total);
  if (drift.length === 0) return;

  for (const d of drift) {
    await prisma.invoice.update({
      where: { id: d.id },
      data: {
        paidAmount:         d.actualPaid,
        outstandingBalance: d.actualOutstanding,
        status:             d.actualStatus,
        ...(d.actualOutstanding === 0 ? { paidAt: new Date() } : {}),
      },
    });
    // Recorded against the invoice so a corrected balance can be explained
    // later — who ran it, when, and what it moved from and to.
    await prisma.auditLog.create({
      data: {
        action:   'INVOICE_BALANCE_RECONCILED',
        entity:   'invoice',
        entityId: d.id,
        userId:   actor,
        oldValue: { paidAmount: d.storedPaid, outstandingBalance: d.storedOutstanding, status: d.storedStatus },
        newValue: {
          paidAmount: d.actualPaid, outstandingBalance: d.actualOutstanding,
          status: d.actualStatus, overpaid: d.overpaid || undefined,
        },
      },
    });
    console.log(`  ✅ ${d.invoiceNumber} corrected`);
  }
  console.log('');
  console.log(`Repaired ${drift.length} invoice(s). Each correction is in the audit log as INVOICE_BALANCE_RECONCILED.`);
  console.log('');
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (err) => {
    console.error('❌ Reconcile failed:', err);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
