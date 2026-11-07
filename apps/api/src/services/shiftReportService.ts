import { Prisma } from '@prisma/client';
import { generateShiftReportId } from '../lib/systemId';
import prisma from '../db/prisma';
import { NotFoundError, AppError } from '../errors/AppError';
import { writeAuditLog } from '../lib/auditLog';
import type { ShiftReportInput } from '@security360/shared';

/** Prisma's own JSON input type — the section arrays go in as-is. */
type Json = Prisma.InputJsonValue;

const INCLUDE = {
  controller:         { select: { id: true, name: true } },
  incomingController: { select: { id: true, name: true } },
  acknowledgedByUser: { select: { id: true, name: true } },
} as const;

type WithNames = Awaited<ReturnType<typeof prisma.shiftHandoverReport.findFirstOrThrow>> & {
  controller:         { id: string; name: string };
  incomingController: { id: string; name: string } | null;
  acknowledgedByUser: { id: string; name: string } | null;
};

function fmt(r: WithNames) {
  return {
    id:             r.id,
    systemId:       r.systemId,
    date:           r.date.toISOString(),
    shift:          r.shift,
    controllerId:   r.controllerId,
    controllerName: r.controller.name,
    incomingName:   r.incomingController?.name ?? r.incomingControllerName ?? null,
    timeFrom:       r.timeFrom,
    timeTo:         r.timeTo,

    deploymentRows:    (r.deploymentRows   ?? []) as never,
    deploymentRemarks: r.deploymentRemarks,
    incidents:         (r.incidents        ?? []) as never,
    supervisionRows:   (r.supervisionRows  ?? []) as never,
    clientComms:       (r.clientComms      ?? []) as never,
    gunsDeployed:      (r.gunsDeployed     ?? []) as never,
    disciplineIssues:  (r.disciplineIssues ?? []) as never,
    // Null on every report written before sections 8 and 9 existed.
    pendingMatters:       (r.pendingMatters   ?? []) as never,
    motorcycleReport:     (r.motorcycleReport ?? []) as never,
    daySupervisorReport:  (r.daySupervisorReport ?? null) as never,
    majorIssues:          (r.majorIssues ?? []) as never,

    totalIncidents:     r.totalIncidents,
    totalClientCalls:   r.totalClientCalls,
    totalAbsentees:     r.totalAbsentees,
    totalReplacements:  r.totalReplacements,
    totalSitesExpected: r.totalSitesExpected,
    totalSitesCovered:  r.totalSitesCovered,
    totalSickGuards:    r.totalSickGuards,
    totalDisciplinary:  r.totalDisciplinary,
    totalOpenActions:   r.totalOpenActions,
    totalOverdueActions:r.totalOverdueActions,
    majorIssue:         r.majorIssue,

    forwardedToId:      r.forwardedToId,
    forwardedAt:        r.forwardedAt?.toISOString() ?? null,

    outgoingControllerName: r.outgoingControllerName,
    outgoingTime:           r.outgoingTime,
    incomingControllerName: r.incomingControllerName,
    incomingTime:           r.incomingTime,

    status:         r.status,
    acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: r.acknowledgedByUser?.name ?? null,
    createdAt:      r.createdAt.toISOString(),
  };
}

/** The columns shared by create and update, so a draft and a submit agree. */
function sectionData(d: ShiftReportInput) {
  return {
    date:     new Date(d.date),
    shift:    d.shift,
    timeFrom: d.timeFrom,
    timeTo:   d.timeTo,

    deploymentRows:    (d.deploymentRows   ?? []) as unknown as Json,
    deploymentRemarks: d.deploymentRemarks ?? null,
    incidents:         (d.incidents        ?? []) as unknown as Json,
    supervisionRows:   (d.supervisionRows  ?? []) as unknown as Json,
    clientComms:       (d.clientComms      ?? []) as unknown as Json,
    gunsDeployed:      (d.gunsDeployed     ?? []) as unknown as Json,
    disciplineIssues:  (d.disciplineIssues ?? []) as unknown as Json,
    pendingMatters:       (d.pendingMatters   ?? []) as unknown as Json,
    motorcycleReport:     (d.motorcycleReport ?? []) as unknown as Json,
    daySupervisorReport:  (d.daySupervisorReport ?? null) as unknown as Json,
    majorIssues:          (d.majorIssues ?? []) as unknown as Json,

    totalIncidents:     d.totalIncidents    ?? 0,
    totalClientCalls:   d.totalClientCalls  ?? 0,
    totalAbsentees:     d.totalAbsentees    ?? 0,
    totalReplacements:  d.totalReplacements ?? 0,
    totalSitesExpected: d.totalSitesExpected ?? 0,
    totalSitesCovered:  d.totalSitesCovered  ?? 0,
    totalSickGuards:    d.totalSickGuards    ?? 0,
    totalDisciplinary:  d.totalDisciplinary  ?? 0,
    totalOpenActions:   d.totalOpenActions   ?? 0,
    totalOverdueActions:d.totalOverdueActions ?? 0,
    majorIssue:         d.majorIssue ?? null,

    forwardedToId:      d.forwardedToId ?? null,
    forwardedAt:       d.forwardedAt ? new Date(d.forwardedAt) : null,

    outgoingControllerName: d.outgoingControllerName ?? null,
    outgoingTime:           d.outgoingTime ?? null,
    incomingControllerName: d.incomingControllerName ?? null,
    incomingTime:           d.incomingTime ?? null,
    incomingControllerId:   d.incomingControllerId ?? null,
  };
}

export const shiftReportService = {
  /**
   * The zone names the form's sections 3 and 5 are built from.
   *
   * Served here rather than from /zones because that route's role list does not
   * include CONTROL_ROOM — the one role that fills this form in. Reading it
   * through a permission the controller already holds avoids handing them a
   * form that 403s while loading.
   */
  async formOptions() {
    const zones = await prisma.zone.findMany({
      where:   { isActive: true },
      orderBy: { name: 'asc' },
      select:  { name: true },
    });
    return { zones: zones.map((z) => z.name) };
  },

  async create(data: ShiftReportInput, userId: string) {
    const status = data.status ?? 'SUBMITTED';
    // A draft is not numbered. It gets its SHR- id when it is submitted, so a
    // half-written sheet abandoned at handover does not consume one.
    const systemId = status === 'SUBMITTED'
      ? await generateShiftReportId(new Date(data.date).getFullYear())
      : null;

    const report = await prisma.shiftHandoverReport.create({
      data: { ...sectionData(data), systemId, controllerId: userId, status },
      include: INCLUDE,
    });

    await writeAuditLog({
      userId,
      action:   status === 'SUBMITTED' ? 'SHIFT_REPORT_SUBMITTED' : 'SHIFT_REPORT_DRAFTED',
      entity:   'shiftHandoverReport',
      entityId: report.id,
      newValue: { systemId, shift: report.shift, date: data.date },
    });

    return fmt(report as WithNames);
  },

  async update(id: string, data: ShiftReportInput, userId: string) {
    const existing = await prisma.shiftHandoverReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Shift report not found');

    // Once handed over it is the record of what happened on a shift. Editing it
    // afterwards would change a document the next controller has already read.
    if (existing.status !== 'DRAFT') {
      throw new AppError(
        `This report was already ${existing.status.toLowerCase()} and can no longer be edited.`,
        400,
      );
    }
    if (existing.controllerId !== userId) {
      throw new AppError('Only the controller who started this draft can edit it.', 403);
    }

    const status   = data.status ?? 'SUBMITTED';
    const systemId = status === 'SUBMITTED' && !existing.systemId
      ? await generateShiftReportId(new Date(data.date).getFullYear())
      : existing.systemId;

    const report = await prisma.shiftHandoverReport.update({
      where: { id },
      data:  { ...sectionData(data), status, systemId },
      include: INCLUDE,
    });

    await writeAuditLog({
      userId,
      action:   status === 'SUBMITTED' ? 'SHIFT_REPORT_SUBMITTED' : 'SHIFT_REPORT_DRAFTED',
      entity:   'shiftHandoverReport',
      entityId: id,
      newValue: { systemId, status },
    });

    return fmt(report as WithNames);
  },

  async forward(id: string, forwardedToId: string | null, actorId: string) {
    const existing = await prisma.shiftHandoverReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Shift report not found');
    const report = await prisma.shiftHandoverReport.update({
      where: { id },
      data: { forwardedToId, forwardedAt: new Date() },
      include: INCLUDE,
    });
    await writeAuditLog({
      userId: actorId, action: 'SHIFT_REPORT_FORWARDED', entity: 'shiftHandoverReport',
      entityId: id, newValue: { forwardedToId },
    });
    return fmt(report as WithNames);
  },

  async list(filters: {
    shift?: string; status?: string; dateFrom?: string; dateTo?: string;
    page: number; limit: number;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.shift)  where.shift  = filters.shift;
    if (filters.status) where.status = filters.status;
    if (filters.dateFrom || filters.dateTo) {
      const range: { gte?: Date; lte?: Date } = {};
      if (filters.dateFrom) range.gte = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        range.lte = to;
      }
      where.date = range;
    }

    const [rows, total] = await Promise.all([
      prisma.shiftHandoverReport.findMany({
        where,
        include: INCLUDE,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip:    (filters.page - 1) * filters.limit,
        take:    filters.limit,
      }),
      prisma.shiftHandoverReport.count({ where }),
    ]);

    return {
      data:  rows.map((r) => fmt(r as WithNames)),
      total,
      page:  filters.page,
      limit: filters.limit,
      pages: Math.ceil(total / filters.limit) || 1,
    };
  },

  async getById(id: string) {
    const r = await prisma.shiftHandoverReport.findUnique({ where: { id }, include: INCLUDE });
    if (!r) throw new NotFoundError('Shift report not found');
    return fmt(r as WithNames);
  },

  async acknowledge(id: string, userId: string) {
    const existing = await prisma.shiftHandoverReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Shift report not found');
    if (existing.status === 'DRAFT') {
      throw new AppError('This report has not been submitted yet.', 400);
    }
    if (existing.status === 'ACKNOWLEDGED') {
      // Not an error: two managers opening the list at once would both click.
      return this.getById(id);
    }

    const report = await prisma.shiftHandoverReport.update({
      where: { id },
      data:  { status: 'ACKNOWLEDGED', acknowledgedAt: new Date(), acknowledgedById: userId },
      include: INCLUDE,
    });

    await writeAuditLog({
      userId,
      action:   'SHIFT_REPORT_ACKNOWLEDGED',
      entity:   'shiftHandoverReport',
      entityId: id,
      newValue: { systemId: report.systemId },
    });

    return fmt(report as WithNames);
  },
};
