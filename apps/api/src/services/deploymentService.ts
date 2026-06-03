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
  DailySheetSite,
  PaginatedResponse,
} from '@stap/shared';

const SUPERVISOR_ROLES = [ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR];

class DeploymentService {
  // ── Create roster ──────────────────────────────────────────────────────────

  async createRoster(
    data: CreateRosterInput,
    createdBy: string,
  ): Promise<{ created: number; conflicts: ConflictDetail[] }> {
    // Verify site exists
    const site = await prisma.site.findUnique({ where: { id: data.siteId }, select: { id: true, siteName: true } });
    if (!site) throw new NotFoundError('Site not found');

    // Verify all guards exist
    const guards = await prisma.guard.findMany({
      where: { id: { in: data.guardIds } },
      select: { id: true, firstName: true, lastName: true, otherNames: true, isIncompleteNID: true },
    });
    if (guards.length !== data.guardIds.length) {
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
          guardId: { in: data.guardIds },
          date: { gte: dateStart, lte: dateEnd },
          siteId: { not: data.siteId },
        },
        include: { site: { select: { siteName: true } } },
      });

      const conflictingGuardIds = new Set(existing.map((e) => e.guardId));

      for (const guardId of data.guardIds) {
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
        siteId: data.siteId,
        shiftType: data.shiftType,
        date,
        supervisorId: data.supervisorId,
      })),
      skipDuplicates: true,
    });

    // Create deployment history records
    await prisma.deploymentHistory.createMany({
      data: toCreate.map(({ guardId, date }) => ({
        guardId,
        siteId: data.siteId,
        shiftType: data.shiftType,
        startDate: date,
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

  async getDailySheet(date?: string, siteId?: string, zoneId?: string): Promise<DailySheetResponse> {
    const dateStr = date ?? this.todayEAT();
    const { start, end } = this.dayRange(dateStr);

    const where: import('@prisma/client').Prisma.DeploymentWhereInput = {
      date: { gte: start, lte: end },
    };
    if (siteId) where.siteId = siteId;
    if (zoneId) where.site = { zoneId };

    const deployments = await prisma.deployment.findMany({
      where,
      orderBy: [
        { site: { zone: { name: 'asc' } } },
        { site: { siteName: 'asc' } },
        { guard: { firstName: 'asc' } },
      ],
      include: {
        guard: {
          select: {
            id: true, firstName: true, lastName: true,
            otherNames: true, phone: true, photoUrl: true, rank: true,
          },
        },
        site: {
          include: {
            client: { select: { id: true, clientName: true } },
            zone:   { select: { id: true, name: true } },
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

    // Group by zone → site
    type SiteEntry = {
      site: DailySheetSite['site'];
      supervisor: { id: string; name: string } | null;
      deployments: DeploymentResponse[];
    };
    const zoneMap = new Map<string | null, {
      zoneId:   string | null;
      zoneName: string | null;
      siteMap:  Map<string, SiteEntry>;
    }>();

    for (const dep of deployments) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const site = dep.site as any;
      const depZoneId   = site.zone?.id   ?? null;
      const depZoneName = site.zone?.name ?? null;

      if (!zoneMap.has(depZoneId)) {
        zoneMap.set(depZoneId, { zoneId: depZoneId, zoneName: depZoneName, siteMap: new Map() });
      }
      const zoneEntry = zoneMap.get(depZoneId)!;

      if (!zoneEntry.siteMap.has(dep.siteId)) {
        zoneEntry.siteMap.set(dep.siteId, {
          site: {
            id:             site.id,
            siteName:       site.siteName,
            location:       site.location,
            siteType:       site.siteType ?? 'COMMERCIAL',
            client:         site.client,
            guardsRequired: site.guardsRequired,
          },
          supervisor: dep.supervisor,
          deployments: [],
        });
      }

      zoneEntry.siteMap.get(dep.siteId)!.deployments.push(
        this.formatDeployment(dep, attendanceMap),
      );
    }

    const zones = Array.from(zoneMap.values()).map((zone) => ({
      zoneId:   zone.zoneId,
      zoneName: zone.zoneName,
      sites: Array.from(zone.siteMap.values()).map((s) => ({
        ...s,
        presentCount:  s.deployments.filter((d) => d.attendance?.status === 'PRESENT').length,
        absentCount:   s.deployments.filter((d) => ['ABSENT', 'AWOL'].includes(d.attendance?.status ?? '')).length,
        unmarkedCount: s.deployments.filter((d) => !d.attendance).length,
      })),
    }));

    return { date: start.toISOString(), zones };
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

  // ── Attendance dashboard ───────────────────────────────────────────────────

  async getAttendanceDashboard(): Promise<import('@stap/shared').AttendanceDashboardData> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // ── Today's figures ───────────────────────────────────────────────────────
    const [totalDeployed, todayAttendance, deploymentsToday] = await Promise.all([
      prisma.deployment.count({ where: { date: today } }),
      prisma.attendanceRecord.findMany({
        where: { date: today },
        select: { status: true, siteId: true, guardId: true },
      }),
      prisma.deployment.findMany({
        where: { date: today },
        select: {
          guardId: true,
          siteId:  true,
          site: {
            select: {
              id:             true,
              siteName:       true,
              guardsRequired: true,
              client: { select: { clientName: true } },
              zone:   { select: { name: true } },
            },
          },
        },
      }),
    ]);

    const presentCount = todayAttendance.filter((a) => a.status === 'PRESENT').length;
    const lateCount    = todayAttendance.filter((a) => a.status === 'LATE').length;
    const absentCount  = todayAttendance.filter((a) => a.status === 'ABSENT').length;
    const awolCount    = todayAttendance.filter((a) => a.status === 'AWOL').length;
    const markedCount  = todayAttendance.length;
    const unmarkedCount = totalDeployed - markedCount;
    const attendanceRate = totalDeployed > 0
      ? Math.round(((presentCount + lateCount) / totalDeployed) * 100)
      : 0;

    // ── Sites with missing attendance ─────────────────────────────────────────
    const markedKeys = new Set(todayAttendance.map((a) => `${a.guardId}:${a.siteId}`));

    const siteMap = new Map<string, {
      site: { id: string; siteName: string; guardsRequired: number; client: { clientName: string }; zone: { name: string } | null };
      total: number; unmarked: number;
    }>();

    for (const dep of deploymentsToday) {
      const entry = siteMap.get(dep.siteId) ?? { site: dep.site, total: 0, unmarked: 0 };
      entry.total++;
      if (!markedKeys.has(`${dep.guardId}:${dep.siteId}`)) entry.unmarked++;
      siteMap.set(dep.siteId, entry);
    }

    const sitesWithMissingAttendance = Array.from(siteMap.values())
      .filter((s) => s.unmarked > 0)
      .sort((a, b) => b.unmarked - a.unmarked)
      .map((s) => ({
        siteId:        s.site.id,
        siteName:      s.site.siteName,
        clientName:    s.site.client.clientName,
        zoneName:      s.site.zone?.name ?? null,
        totalGuards:   s.total,
        unmarkedCount: s.unmarked,
        markedCount:   s.total - s.unmarked,
      }));

    // ── Weekly trend (last 7 days) ────────────────────────────────────────────
    const weeklyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const dayEnd = new Date(day);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const [deployed, attendance] = await Promise.all([
        prisma.deployment.count({ where: { date: day } }),
        prisma.attendanceRecord.findMany({ where: { date: day }, select: { status: true } }),
      ]);

      const present = attendance.filter((a) => ['PRESENT', 'LATE'].includes(a.status)).length;
      const absent  = attendance.filter((a) => ['ABSENT', 'AWOL'].includes(a.status)).length;
      const rate    = deployed > 0 ? Math.round((present / deployed) * 100) : 0;

      weeklyTrend.push({
        date:     day.toISOString().split('T')[0],
        dayLabel: day.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }),
        deployed,
        present,
        absent,
        unmarked: deployed - attendance.length,
        rate,
        isToday:  i === 0,
      });
    }

    const weeklyAvgRate = weeklyTrend.length > 0
      ? Math.round(weeklyTrend.reduce((sum, d) => sum + d.rate, 0) / weeklyTrend.length)
      : 0;

    // ── Supervisor check-ins today ────────────────────────────────────────────
    const checkins = await prisma.supervisorCheckin.findMany({
      where: { dateTime: { gte: today, lt: tomorrow } },
      include: {
        supervisor: { select: { id: true, name: true, role: true } },
        site: { select: { id: true, siteName: true, client: { select: { clientName: true } } } },
      },
      orderBy: { dateTime: 'desc' },
      take: 20,
    });

    return {
      date: today.toISOString(),
      totalDeployed,
      presentCount,
      lateCount,
      absentCount,
      awolCount,
      markedCount,
      unmarkedCount,
      attendanceRate,
      weeklyAvgRate,
      weeklyTrend,
      sitesWithMissingAttendance,
      supervisorCheckins: checkins.map((c) => ({
        id:          c.id,
        supervisor:  { id: c.supervisor.id, name: c.supervisor.name, role: c.supervisor.role },
        site:        { id: c.site.id, siteName: c.site.siteName, clientName: c.site.client.clientName },
        checkinTime: c.dateTime.toISOString(),
        notes:       c.notes ?? null,
      })),
    };
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

    const att = attendanceMap.get(`${d.guardId}:${d.siteId}`) ?? null;

    return {
      id: d.id,
      guard: {
        id: d.guard.id,
        fullName,
        phone: d.guard.phone,
        photoUrl: d.guard.photoUrl ?? null,
        rank: d.guard.rank ?? null,
      },
      site: {
        id: d.site.id,
        siteName: d.site.siteName,
        location: d.site.location,
        siteType: d.site.siteType ?? 'COMMERCIAL',
        client: { id: d.site.client.id, clientName: d.site.client.clientName },
        zone: d.site.zone ? { id: d.site.zone.id, name: d.site.zone.name } : null,
      },
      supervisor: { id: d.supervisor.id, name: d.supervisor.name },
      shiftType: d.shiftType as 'DAY' | 'NIGHT' | 'FULL_24',
      date: d.date instanceof Date ? d.date.toISOString() : d.date,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
      attendance: att
        ? {
            status: att.status,
            timeIn: att.timeIn ? (att.timeIn instanceof Date ? att.timeIn.toISOString() : att.timeIn) : null,
            timeOut: att.timeOut ? (att.timeOut instanceof Date ? att.timeOut.toISOString() : att.timeOut) : null,
            notes: att.notes ?? null,
          }
        : null,
    };
  }
}

export const deploymentService = new DeploymentService();
