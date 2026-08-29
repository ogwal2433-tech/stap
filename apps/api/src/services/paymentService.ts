import prisma from '../db/prisma';
import { recomputeInvoiceBalance, OUTSTANDING_STATUSES } from './invoiceService';
import {
  initiateCollection,
  checkPaymentStatus,
  generateExtReference,
  normalisePhone,
  detectNetwork,
} from '../lib/xcel';
import { notificationService } from './notificationService';
import { errorLogger } from './errorLogger';

const WEBHOOK_URL = process.env.XCEL_WEBHOOK_URL ?? '';

export async function initiateInvoicePayment(params: {
  invoiceId:   string;
  phone:       string;
  initiatedBy: string;
}): Promise<{ extReference: string; network: string; status: string }> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where:   { id: params.invoiceId },
    include: { client: { select: { contactPerson: true } } },
  });

  // PARTIALLY_PAID is payable: a client who settled half by mobile money was
  // refused when paying the rest the same way.
  if (!(OUTSTANDING_STATUSES as readonly string[]).includes(invoice.status)) {
    throw new Error(`Invoice is already ${invoice.status}`);
  }

  const normPhone  = normalisePhone(params.phone);
  const network    = detectNetwork(normPhone);
  const extReference = generateExtReference();

  // Create PENDING record BEFORE calling XCEL to avoid orphaned transactions
  await prisma.invoicePayment.create({
    data: {
      invoiceId:   params.invoiceId,
      extReference,
      phone:       normPhone,
      network,
      amountPaid:  invoice.totalAmount,
      status:      'PENDING',
      initiatedBy: params.initiatedBy,
    },
  });

  let xcelTransactionId: string | null = null;
  try {
    const result = await initiateCollection({
      phone:        normPhone,
      amount:       invoice.totalAmount,
      network,
      accountName:  invoice.client.contactPerson,
      extReference,
      description:  `Payment for invoice ${invoice.invoiceNumber}`,
      webhookUrl:   WEBHOOK_URL,
    });
    xcelTransactionId = result.data?.reference ?? null;
  } catch (err) {
    await prisma.invoicePayment.update({
      where: { extReference },
      data:  { status: 'FAILED', failureReason: (err as Error).message, resolvedAt: new Date() },
    });
    await errorLogger.log({
      message:   (err as Error).message ?? 'XCEL collection error',
      stack:     (err as Error).stack,
      severity:  'ERROR',
      category:  'PAYMENT',
      errorCode: 'XCEL_API_ERROR',
      context:   { invoiceId: params.invoiceId, extReference, network },
    });
    throw err;
  }

  if (xcelTransactionId) {
    await prisma.invoicePayment.update({
      where: { extReference },
      data:  { xcelTransactionId },
    });
  }

  return { extReference, network, status: 'PENDING' };
}

export async function handleWebhook(body: Record<string, unknown>): Promise<void> {
  const extRef  = (body.ext_reference ?? body.extReference) as string | undefined;
  const status  = ((body.status ?? body.transaction_status) as string | undefined)?.toUpperCase();
  const txId    = (body.transaction_id ?? body.transactionId) as string | undefined;
  const reason  = (body.failure_reason ?? body.message) as string | undefined;

  if (!extRef || !status) return;

  const payment = await prisma.invoicePayment.findUnique({ where: { extReference: extRef } });
  if (!payment || payment.status !== 'PENDING') return;

  const resolvedAt = new Date();

  if (status === 'SUCCESS' || status === 'SUCCESSFUL') {
    await prisma.invoicePayment.update({
      where: { extReference: extRef },
      data: {
        status:            'SUCCESS',
        xcelTransactionId: txId ?? payment.xcelTransactionId,
        resolvedAt,
      },
    });

    // Derive the invoice status from what has actually been paid. Marking it
    // PAID outright would settle the whole invoice off a part payment.
    await recomputeInvoiceBalance(payment.invoiceId);

    await notificationService.sendToRoles(
      ['DIRECTOR', 'ASSISTANT_MANAGER', 'ACCOUNTS_OFFICER'],
      {
        type:       'PAYMENT_RECEIVED',
        title:      'Invoice Payment Received',
        message:    `Mobile money payment of UGX ${payment.amountPaid.toLocaleString()} received for invoice (ref: ${extRef}).`,
        entityType: 'Invoice',
        entityId:   payment.invoiceId,
      },
    );
  } else if (status === 'FAILED' || status === 'CANCELLED') {
    await prisma.invoicePayment.update({
      where: { extReference: extRef },
      data: {
        status:           status === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
        xcelTransactionId: txId ?? payment.xcelTransactionId ?? undefined,
        failureReason:    reason ?? undefined,
        resolvedAt,
      },
    });
  }
}

export async function pollPaymentStatus(extReference: string): Promise<{
  status:           string;
  xcelTransactionId: string | null;
  failureReason:    string | null;
}> {
  const payment = await prisma.invoicePayment.findUniqueOrThrow({ where: { extReference } });

  if (payment.status !== 'PENDING') {
    return {
      status:            payment.status,
      xcelTransactionId: payment.xcelTransactionId,
      failureReason:     payment.failureReason,
    };
  }

  const xcelResult = await checkPaymentStatus(extReference);
  const xcelStatus = xcelResult.data.description?.toUpperCase();

  if (xcelStatus === 'SUCCESS' || xcelStatus === 'SUCCESSFUL') {
    await handleWebhook({
      ext_reference:    extReference,
      status:           'SUCCESS',
      transaction_id:   xcelResult.data.reference ?? undefined,
    });
    return { status: 'SUCCESS', xcelTransactionId: xcelResult.data.reference ?? null, failureReason: null };
  }

  if (xcelStatus === 'FAILED' || xcelStatus === 'CANCELLED') {
    await handleWebhook({
      ext_reference:  extReference,
      status:         xcelStatus,
      failure_reason: xcelResult.data.reason ?? undefined,
    });
    return { status: xcelStatus, xcelTransactionId: xcelResult.data.reference ?? null, failureReason: xcelResult.data.reason };
  }

  return {
    status:            payment.status,
    xcelTransactionId: payment.xcelTransactionId,
    failureReason:     payment.failureReason,
  };
}

export async function getInvoicePayments(invoiceId: string) {
  return prisma.invoicePayment.findMany({
    where:   { invoiceId },
    orderBy: { initiatedAt: 'desc' },
  });
}
