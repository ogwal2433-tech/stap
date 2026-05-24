import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { ROLES } from '@stap/shared';
import type {
  CreateRosterInput,
  DeploymentListQuery,
  DeploymentResponse,
  ConflictDetail,
  DailySheetResponse,
  PaginatedResponse,
  GuardBasicResponse,
} from '@stap/shared';

const SUPERVISOR_ROLES = [ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR];

class DeploymentService {
  // ── Create roster ──────────────────────────────────────────────────────────

  async createRoster(
    data: CreateRosterInput,
    createdBy: string,
  ): Promise<{ created: number; conflicts: ConflictDetail[] }> {
    // Normalise guardIds — accept both plain string and { guardId, overtimeHours } objects
    type GuardEntry = { guardId: string; overtimeHours?: number };
    const guardEntries: GuardEntry[] = (data.guardIds as (string | GuardEntry)[]).map((entry) =>
      typeof entry === 'string' ? { guardId: entry } : entry,
    );
    const guardIdList = guardEntries.map((e) => e.guardId);

    // Validate shift type exists and is active
    const shiftTypeRecord = await prisma.shiftType.findUnique({ where: { code: data.shiftType } });
    if (!shiftTypeRecord || !shiftTypeRecord.isActive) {
      throw new AppError(`Shift type "${data.shiftType}" not found or is inactive.`, 400);
    }

    // Verify site exists
    const site = await prisma.site.findUnique({ where: { id: data.siteId }, select: { id: true, siteName: true } });
    if (!site) throw new NotFoundError('Site not found');

    // Verify all guards exist
    const guards = await prisma.guard.findMany({
      where: { id: { in: guardIdList } },
      select: { id: true, firstName: true, lastName: true, otherNames: true, isIncompleteNID: true },
    });
    if (guards.length !== guardIdList.length) {
      throw new NotFoundError('One or more guards not found');
    }

    // Block deployment of guards with a pending National ID
    const pendingNid = guards.find((g) => g.isIncompleteNID);
    if (pendingNid) {
      throw new AppError(
        `${pendingNid.firstName} ${pendingNid.lastName} cannot be deployed — National ID is pending. Please update their profile before deploying.`,
        400,
      );
    }

    // Verify supervisor exists and has correct role
    const supervisor = await prisma.user.findUnique({
      where: { id: data.supervisorId },
      select: { id: true, name: true, role: true },
    });
    if (!supervisor) throw new NotFoundError('Supervisor not found');
    if (!SUPERVISOR_ROLES.includes(supervisor.role as typeof SUPERVISOR_ROLES[number])) {
      throw new AppError('Supervisor must have OPERATIONS_SUPERVISOR or FIELD_SUPERVISOR role', 400);
    }

    // Build list of dates to create deployments for
    const dates: Date[] = [];
    const start = new Date(data.startDate);
    start.setUTCHours(0, 0, 0, 0);

    if (!data.recurring || !data.endDate || !data.daysOfWeek?.length) {
      // Single date
      dates.push(start);
    } else {
      // Recurring — generate dates between start and end on specified days of week
      const end = new Date(data.endDate);
      end.setUTCHours(0, 0, 0, 0);

      const maxEnd = new Date(start);
      maxEnd.setDate(maxEnd.getDate() + 90); // cap at 90 days
      const effectiveEnd = end < maxEnd ? end : maxEnd;

      const current = new Date(start);
      while (current <= effectiveEnd) {
        if (data.daysOfWeek.includes(current.getDay())) {
          dates.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
      }
    }

    // Check for conflicts: guards already deployed on same date at different site
    const guardMap = new Map(guards.map((g) => [g.id, g]));
    const overtimeMap = new Map(guardEntries.map((e) => [e.guardId, e.overtimeHours ?? 0]));
    const conflicts: ConflictDetail[] = [];
    const toCreate: { guardId: string; date: Date }[] = [];

    for (const date of dates) {
      const dateStart = new Date(date);
      dateStart.setUTCHours(0, 0, 0, 0);
      const dateEnd = new Date(dateStart);
      dateEnd.setUTCHours(23, 59, 59, 999);

      // Find existing deployments for each guard on this date at a different site
      const existing = await prisma.deployment.findMany({
        where: {
          guardId: { in: guardIdList },
          date: { gte: dateStart, lte: dateEnd },
          siteId: { not: data.siteId },
        },
        include: { site: { select: { siteName: true } } },
      });

      const conflictingGuardIds = new Set(existing.map((e) => e.guardId));

      for (const guardId of guardIdList) {
        if (conflictingGuardIds.has(guardId)) {
          const existingDeployment = existing.find((e) => e.guardId === guardId);
          const g = guardMap.get(guardId)!;
          const guardName = [g.firstName, g.otherNames, g.lastName].filter(Boolean).join(' ');
          conflicts.push({
            guardId,
            guardName,
            date: date.toISOString(),
            existingSite: existingDeployment?.site.siteName ?? 'Unknown',
          });
        } else {
          toCreate.push({ guardId, date });
        }
      }
    }

    if (toCreate.length === 0) {
      return { created: 0, conflicts };
    }

    // Create deployment records
    await prisma.deployment.createMany({
      data: toCreate.map(({ guardId, date }) => ({
        guardId,
        siteId:                data.siteId,
        shiftType:             data.shiftType,
        date,
        supervisorId:          data.supervisorId,
        deploymentType:        data.deploymentType ?? 'UNARMED',
        weaponsDetails:        data.weaponsDetails ?? null,
        overtimeHours:         overtimeMap.get(guardId) || null,
        replacementForGuardId: data.replacementForGuardId ?? null,
      })),
      skipDuplicates: true,
    });

    // Create deployment history records
    await prisma.deploymentHistory.createMany({
      data: toCreate.map(({ guardId, date }) => ({
        guardId,
        siteId:       data.siteId,
        shiftType:    data.shiftType,
        startDate:    date,
        supervisorId: data.supervisorId,
      })),
      skipDuplicates: true,
    });

    await QueueService.logAudit({
      userId: createdBy,
      action: 'ROSTER_CREATED',
      entity: 'deployment',
      entityId: data.siteId,
      newValue: { siteId: data.siteId, guardCount: toCreate.length, dateCount: dates.length },
    });

    return { created: toCreate.length, conflicts };
  }

  // ── Get today's deployments ────────────────────────────────────────────────

  async getTodaysDeployments(query: DeploymentListQuery): Promise<PaginatedResponse<DeploymentResponse>> {
    const { page, limit, siteId, guardId } = query;
    const skip = (page - 1) * limit;

    // Default to today in EAT (UTC+3)
    const dateStr = query.date ?? this.todayEAT();
    const { start, end } = this.dayRange(dateStr);

    const where: import('@prisma/client').Prisma.DeploymentWhereInput = {
      date: { gte: start, lte: end },
    };
    if (siteId) where.siteId = siteId;
    if (guardId) where.guardId = guardId;

    const [deployments, total] = await Promise.all([
      prisma.deployment.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ site: { siteName: 'asc' } }, { guard: { lastName: 'asc' } }],
        include: {
          guard: { select: { id: true, firstName: true, lastName: true, otherNames: true, phone: true, photoUrl: true } },
          site: {
            select: {
              id: true,
              siteName: true,
              location: true,
              client: { select: { id: true, clientName: true } },
            },
          },
          supervisor: { select: { id: true, name: true } },
        },
      }),
      prisma.deployment.count({ where }),
    ]);

    // For each deployment, fetch attendance record for same date
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        date: { gte: start, lte: end },
        guardId: { in: deployments.map((d) => d.guardId) },
        siteId: siteId ? siteId : undefined,
      },
    });

    const attendanceMap = new Map(
      attendanceRecords.map((a) => [`${a.guardId}:${a.siteId}`, a]),
    );

    const totalPages = Math.ceil(total / limit);

    return {
      data: deployments.map((d) => this.formatDeployment(d, attendanceMap)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  // ── Get daily sheet ────────────────────────────────────────────────────────

  async getDailySheet(date?: string, siteId?: string): Promise<DailySheetResponse> {
    const dateStr = date ?? this.todayEAT();
    const { start, end } = this.dayRange(dateStr);

    const where: import('@prisma/client').Prisma.DeploymentWhereInput = {
      date: { gte: start, lte: end },
    };
    if (siteId) where.siteId = siteId;

    const deployments = await prisma.deployment.findMany({
      where,
      orderBy: [{ site: { siteName: 'asc' } }, { guard: { lastName: 'asc' } }],
      include: {
        guard: { select: { id: true, firstName: true, lastName: true, otherNames: true, phone: true, photoUrl: true } },
        site: {
          select: {
            id: true,
            siteName: true,
            location: true,
            guardsRequired: true,
            client: { select: { id: true, clientName: true } },
          },
        },
        supervisor: { select: { id: true, name: true } },
      },
    });

    // Fetch attendance records for this day
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        date: { gte: start, lte: end },
        guardId: { in: deployments.map((d) => d.guardId) },
      },
    });

    const attendanceMap = new Map(
      attendanceRecords.map((a) => [`${a.guardId}:${a.siteId}`, a]),
    );

    // Group by site
    const siteMap = new Map<string, {
      site: { id: string; siteName: string; location: string; client: { id: string; clientName: string }; guardsRequired: number };
      supervisor: { id: string; name: string } | null;
      deployments: DeploymentResponse[];
    }>();

    for (const d of deployments) {
      if (!siteMap.has(d.siteId)) {
        siteMap.set(d.siteId, {
          site: {
            id: d.site.id,
            siteName: d.site.siteName,
            location: d.site.location,
            guardsRequired: (d.site as typeof d.site & { guardsRequired: number }).guardsRequired,
            client: d.site.client,
          },
          supervisor: d.supervisor,
          deployments: [],
        });
      }
      siteMap.get(d.siteId)!.deployments.push(this.formatDeployment(d, attendanceMap));
    }

    return {
      date: dateStr,
      sites: Array.from(siteMap.values()),
    };
  }

  // ── Delete deployment ──────────────────────────────────────────────────────

  async deleteDeployment(id: string, deletedBy: string): Promise<void> {
    const deployment = await prisma.deployment.findUnique({
      where: { id },
      include: { guard: { select: { firstName: true, lastName: true } } },
    });
    if (!deployment) throw new NotFoundError('Deployment not found');

    // Check if attendance has been marked
    const { start, end } = this.dayRange(deployment.date.toISOString());
    const attendance = await prisma.attendanceRecord.findFirst({
      where: {
        guardId: deployment.guardId,
        siteId: deployment.siteId,
        date: { gte: start, lte: end },
      },
    });

    if (attendance) {
      throw new AppError('Cannot remove a deployment with attendance records', 409);
    }

    await prisma.deployment.delete({ where: { id } });

    await QueueService.logAudit({
      userId: deletedBy,
      action: 'DEPLOYMENT_DELETED',
      entity: 'deployment',
      entityId: id,
      oldValue: { guardId: deployment.guardId, siteId: deployment.siteId, date: deployment.date.toISOString() },
    });
  }

  // ── Get upcoming deployments for a guard ───────────────────────────────────

  async getUpcomingDeployments(guardId: string, days = 7): Promise<DeploymentResponse[]> {
    const todayStr = this.todayEAT();
    const { start } = this.dayRange(todayStr);

    const futureEnd = new Date(start);
    futureEnd.setDate(futureEnd.getDate() + days);
    futureEnd.setUTCHours(23, 59, 59, 999);

    const deployments = await prisma.deployment.findMany({
      where: {
        guardId,
        date: { gte: start, lte: futureEnd },
      },
      orderBy: { date: 'asc' },
      include: {
        guard: { select: { id: true, firstName: true, lastName: true, otherNames: true, phone: true, photoUrl: true } },
        site: {
          select: {
            id: true,
            siteName: true,
            location: true,
            client: { select: { id: true, clientName: true } },
          },
        },
        supervisor: { select: { id: true, name: true } },
      },
    });

    const emptyMap = new Map<string, import('@prisma/client').AttendanceRecord>();
    return deployments.map((d) => this.formatDeployment(d, emptyMap));
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Returns today's date string in EAT (UTC+3) as YYYY-MM-DD */
  private todayEAT(): string {
    const now = new Date();
    const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    return eat.toISOString().slice(0, 10);
  }

  /** Returns start/end of a UTC day for a given date string */
  private dayRange(dateStr: string): { start: Date; end: Date } {
    const day = dateStr.slice(0, 10);
    const start = new Date(`${day}T00:00:00.000Z`);
    const end = new Date(`${day}T23:59:59.999Z`);
    return { start, end };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatDeployment(d: any, attendanceMap: Map<string, any>): DeploymentResponse {
    const fullName = [d.guard.firstName, d.guard.otherNames, d.guard.lastName]
      .filter(Boolean)
      .join(' ');

    const att = attendanceMap.get(`${d.guardId}:${d.siteId}`);

    return {
      id: d.id,
      guard: { id: d.guard.id, fullName, phone: d.guard.phone, photoUrl: d.guard.photoUrl ?? null },
      site: {
        id: d.site.id,
        siteName: d.site.siteName,
        location: d.site.location,
        client: { id: d.site.client.id, clientName: d.site.client.clientName },
      },
      supervisor:            { id: d.supervisor.id, name: d.supervisor.name },
      shiftType:             d.shiftType as string,
      date:                  d.date instanceof Date ? d.date.toISOString() : d.date,
      deploymentType:        d.deploymentType ?? 'UNARMED',
      weaponsDetails:        d.weaponsDetails ?? null,
      overtimeHours:         d.overtimeHours ?? null,
      overtimeReason:        d.overtimeReason ?? null,
      copiedFromDate:        d.copiedFromDate ? (d.copiedFromDate instanceof Date ? d.copiedFromDate.toISOString() : d.copiedFromDate) : null,
      replacementForGuardId: d.replacementForGuardId ?? null,
      createdAt:             d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
      ...(att && {
        attendance: {
          status: att.status,
          timeIn: att.timeIn ? (att.timeIn instanceof Date ? att.timeIn.toISOString() : att.timeIn) : null,
          timeOut: att.timeOut ? (att.timeOut instanceof Date ? att.timeOut.toISOString() : att.timeOut) : null,
          notes: att.notes ?? null,
        },
      }),
    };
  }

  // ── Copy previous roster ───────────────────────────────────────────────────

  async copyPreviousRoster(
    sourceDate: string,
    targetDate: string,
    createdBy: string,
  ): Promise<{ created: number; skipped: number }> {
    const sourceDateObj = new Date(sourceDate);
    sourceDateObj.setUTCHours(0, 0, 0, 0);
    const sourceDateEnd = new Date(sourceDateObj);
    sourceDateEnd.setUTCHours(23, 59, 59, 999);

    const sourceDeployments = await prisma.deployment.findMany({
      where: { date: { gte: sourceDateObj, lte: sourceDateEnd } },
      include: {
        guard: { select: { id: true, employmentStatus: true } },
      },
    });

    if (sourceDeployments.length === 0) {
      throw new AppError(`No deployments found for ${sourceDate}. Nothing to copy.`, 404);
    }

    const targetDateObj = new Date(targetDate);
    targetDateObj.setUTCHours(0, 0, 0, 0);
    const targetDateEnd = new Date(targetDateObj);
    targetDateEnd.setUTCHours(23, 59, 59, 999);

    let created = 0;
    let skipped = 0;

    for (const dep of sourceDeployments) {
      if (dep.guard.employmentStatus !== 'ACTIVE') {
        skipped++;
        continue;
      }

      const existing = await prisma.deployment.findFirst({
        where: { guardId: dep.guardId, date: { gte: targetDateObj, lte: targetDateEnd } },
      });
      if (existing) {
        skipped++;
        continue;
      }

      await prisma.deployment.create({
        data: {
          guardId:        dep.guardId,
          siteId:         dep.siteId,
          supervisorId:   dep.supervisorId,
          shiftType:      dep.shiftType,
          date:           targetDateObj,
          deploymentType: dep.deploymentType,
          weaponsDetails: dep.weaponsDetails,
          copiedFromDate: sourceDateObj,
        },
      });
      created++;
    }

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'ROSTER_COPIED',
      entity:   'deployment',
      entityId: 'batch',
      newValue: { sourceDate, targetDate, created, skipped },
    });

    return { created, skipped };
  }

  // ── Get available replacements ─────────────────────────────────────────────

  async getAvailableReplacements(
    siteId: string,
    date: string,
    absentGuardId: string,
  ): Promise<GuardBasicResponse[]> {
    const dateObj = new Date(date);
    dateObj.setUTCHours(0, 0, 0, 0);
    const dateEnd = new Date(dateObj);
    dateEnd.setUTCHours(23, 59, 59, 999);

    const deployedToday = await prisma.deployment.findMany({
      where: { date: { gte: dateObj, lte: dateEnd } },
      select: { guardId: true },
    });
    const deployedIds = deployedToday.map((d) => d.guardId);

    const available = await prisma.guard.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        id: { notIn: [...deployedIds, absentGuardId] },
      },
      select: {
        id: true, firstName: true, lastName: true, otherNames: true,
        phone: true, photoUrl: true, rank: true,
      },
      orderBy: { firstName: 'asc' },
      take: 10,
    });

    return available.map((g) => ({
      id:       g.id,
      fullName: [g.firstName, g.otherNames, g.lastName].filter(Boolean).join(' '),
      phone:    g.phone ?? null,
      photoUrl: g.photoUrl ?? null,
      rank:     g.rank ?? null,
    }));
  }

}

export const deploymentService = new DeploymentService();
