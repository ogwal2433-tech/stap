import prisma from '../db/prisma';
import {
  initiateCollection,
  checkPaymentStatus,
  generateExtReference,
  normalisePhone,
  detectNetwork,
} from '../lib/xcel';
import { notificationService } from './notificationService';

const WEBHOOK_URL = process.env.XCEL_WEBHOOK_URL ?? '';

export async function initiateInvoicePayment(params: {
  invoiceId:   string;
  phone:       string;
  initiatedBy: string;
}): Promise<{ extReference: string; network: string; status: string }> {
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: params.invoiceId } });

  if (!['PENDING', 'OVERDUE'].includes(invoice.status)) {
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
      extReference,
      description:  `Payment for invoice ${invoice.invoiceNumber}`,
      webhookUrl:   WEBHOOK_URL,
    });
    xcelTransactionId = result.transactionId ?? null;
  } catch (err) {
    await prisma.invoicePayment.update({
      where: { extReference },
      data:  { status: 'FAILED', failureReason: (err as Error).message, resolvedAt: new Date() },
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
    await prisma.$transaction([
      prisma.invoicePayment.update({
        where: { extReference: extRef },
        data: {
          status:           'SUCCESS',
          xcelTransactionId: txId ?? payment.xcelTransactionId,
          resolvedAt,
        },
      }),
      prisma.invoice.update({
        where: { id: payment.invoiceId },
        data:  { status: 'PAID', paidAt: resolvedAt },
      }),
    ]);

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
  const xcelStatus = xcelResult.status?.toUpperCase();

  if (xcelStatus === 'SUCCESS' || xcelStatus === 'SUCCESSFUL') {
    await handleWebhook({
      ext_reference:    extReference,
      status:           'SUCCESS',
      transaction_id:   xcelResult.transactionId ?? undefined,
    });
    return { status: 'SUCCESS', xcelTransactionId: xcelResult.transactionId ?? null, failureReason: null };
  }

  if (xcelStatus === 'FAILED' || xcelStatus === 'CANCELLED') {
    await handleWebhook({
      ext_reference:  extReference,
      status:         xcelStatus,
      failure_reason: xcelResult.message,
    });
    return { status: xcelStatus, xcelTransactionId: xcelResult.transactionId ?? null, failureReason: xcelResult.message };
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
