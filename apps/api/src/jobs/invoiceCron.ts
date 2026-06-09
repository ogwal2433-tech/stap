import prisma from '../db/prisma';
import { invoiceService } from '../services/invoiceService';

export async function runInvoiceEmailJob(): Promise<void> {
  console.log('[InvoiceCron] Checking for unsent due invoices…');

  const dueInvoices = await prisma.invoice.findMany({
    where: {
      dueDate:     { lte: new Date() },
      status:      { in: ['PENDING', 'OVERDUE'] },
      emailSentAt: null,
    },
    include: { client: { select: { clientName: true } } },
  });

  if (dueInvoices.length === 0) {
    console.log('[InvoiceCron] No unsent due invoices.');
    return;
  }

  console.log(`[InvoiceCron] ${dueInvoices.length} invoice(s) to email.`);

  for (const invoice of dueInvoices) {
    try {
      await invoiceService.sendInvoiceEmail(invoice.id);
    } catch (err) {
      console.error(
        `[InvoiceCron] Failed to email invoice ${invoice.invoiceNumber} for ${invoice.client.clientName}:`,
        err,
      );
    }
  }

  console.log('[InvoiceCron] Done.');
}
