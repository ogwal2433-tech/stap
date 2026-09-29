import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { notificationService } from './notificationService';
import { dispatchChannelLabel } from '@security360/shared';
import type {
  CreateFundDispatchInput,
  FundDispatchResponse,
  DispatchStatus,
} from '@security360/shared';

/**
 * Requisition states where the money has been released and may be sent out.
 *
 * Dispatch is a separate axis from `status`: a requisition stays APPROVED,
 * ASSIGNED or IN_PROGRESS while funds go out against it, possibly in
 * instalments. Overwriting `status` on the last dispatch would throw away the
 * assignment and progress the workflow depends on, so `dispatchStatus` carries
 * the money side on its own.
 */
const DISPATCHABLE_STATUSES = ['APPROVED', 'ASSIGNED', 'IN_PROGRESS'];

const DISPATCH_INCLUDE = {
  dispatchedByUser: { select: { id: true, name: true } },
} as const;

function sanitise(d: any): FundDispatchResponse {
  return {
    id:               d.id,
    requisitionId:    d.requisitionId,
    channel:          d.channel,
    amount:           d.amount,
    reference:        d.reference ?? null,
    recipientName:    d.recipientName ?? null,
    recipientAccount: d.recipientAccount ?? null,
    dispatchDate:     d.dispatchDate.toISOString(),
    notes:            d.notes ?? null,
    dispatchedBy:     {
      id:   d.dispatchedByUser?.id ?? d.dispatchedById,
      name: d.dispatchedByUser?.name ?? '',
    },
    createdAt:        d.createdAt.toISOString(),
  };
}

function statusFor(totalDispatched: number, approved: number): DispatchStatus {
  if (approved > 0 && totalDispatched >= approved) return 'FULLY_DISPATCHED';
  return totalDispatched > 0 ? 'PARTIAL' : 'PENDING';
}

class FundDispatchService {
  /** Record one payment against an approved requisition. */
  async recordDispatch(
    requisitionId: string,
    data: CreateFundDispatchInput,
    dispatchedById: string,
  ): Promise<FundDispatchResponse> {
    const requisition = await prisma.requisition.findUnique({
      where:  { id: requisitionId },
      select: { id: true, amount: true, status: true, assignedToId: true, particulars: true },
    });
    if (!requisition) throw new NotFoundError('Requisition not found');

    if (!DISPATCHABLE_STATUSES.includes(requisition.status)) {
      throw new AppError(
        `Funds can only be dispatched for approved requisitions. This one is ` +
        `${requisition.status.replace(/_/g, ' ')}.`,
        400,
      );
    }

    // Summed from the rows rather than read off `totalDispatched`, so a stale
    // counter can never let more money out than was approved.
    const approved = requisition.amount;
    const already  = (await prisma.fundDispatch.aggregate({
      where: { requisitionId },
      _sum:  { amount: true },
    }))._sum.amount ?? 0;
    const remaining = approved - already;

    if (remaining <= 0) {
      throw new AppError(
        `The full approved amount of UGX ${approved.toLocaleString()} has already been dispatched.`,
        400,
      );
    }
    if (data.amount > remaining) {
      throw new AppError(
        `Dispatch amount of UGX ${data.amount.toLocaleString()} exceeds the remaining ` +
        `approved amount of UGX ${remaining.toLocaleString()}. ` +
        `Total approved: UGX ${approved.toLocaleString()}.`,
        400,
      );
    }

    const totalDispatched = already + data.amount;
    const dispatchStatus  = statusFor(totalDispatched, approved);

    const [dispatch] = await prisma.$transaction([
      prisma.fundDispatch.create({
        data: {
          requisitionId,
          channel:          data.channel,
          amount:           data.amount,
          reference:        data.reference?.trim() || null,
          recipientName:    data.recipientName?.trim() || null,
          recipientAccount: data.recipientAccount?.trim() || null,
          dispatchDate:     data.dispatchDate ? new Date(data.dispatchDate) : new Date(),
          notes:            data.notes?.trim() || null,
          dispatchedById,
        },
        include: DISPATCH_INCLUDE,
      }),
      prisma.requisition.update({
        where: { id: requisitionId },
        data:  { totalDispatched, dispatchStatus },
      }),
    ]);

    await QueueService.logAudit({
      userId:   dispatchedById,
      action:   'FUND_DISPATCHED',
      entity:   'requisition',
      entityId: requisitionId,
      newValue: {
        channel:   data.channel,
        amount:    data.amount,
        reference: dispatch.reference,
        totalDispatched,
        dispatchStatus,
      },
    });

    // Tell whoever is responsible for spending it that the money is on its way.
    if (requisition.assignedToId) {
      await notificationService.send({
        userId:  requisition.assignedToId,
        type:    'SYSTEM',
        title:   '💵 Funds Dispatched',
        message:
          `UGX ${data.amount.toLocaleString()} has been dispatched via ` +
          `${dispatchChannelLabel(data.channel)} for your requisition.` +
          (dispatch.reference ? ` Reference: ${dispatch.reference}` : ''),
        entityType: 'requisition',
        entityId:   requisitionId,
      });
    }

    return sanitise(dispatch);
  }

  async getDispatches(requisitionId: string): Promise<FundDispatchResponse[]> {
    const requisition = await prisma.requisition.findUnique({
      where:  { id: requisitionId },
      select: { id: true },
    });
    if (!requisition) throw new NotFoundError('Requisition not found');

    const dispatches = await prisma.fundDispatch.findMany({
      where:   { requisitionId },
      include: DISPATCH_INCLUDE,
      orderBy: { dispatchDate: 'desc' },
    });
    return dispatches.map(sanitise);
  }
}

export const fundDispatchService = new FundDispatchService();
