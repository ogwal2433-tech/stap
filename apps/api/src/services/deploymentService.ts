import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { notificationService } from './notificationService';
import { DEPLOYABLE_STATUSES, guardStatusLabel, type GuardEmploymentStatus } from '@stap/shared';
import { ROLES } from '@stap/shared';
import type {
  CreateRosterInput,
  CopyRosterInput,
  CopyRosterResult,
  RequestReplacementInput,
  ReplacementResult,
  GuardAvailabilityResponse,
  DeploymentListQuery,
  DeploymentResponse,
  ConflictDetail,
  RosterCreationResult,
  DailySheetResponse,
  DailySheetSite,
  PaginatedResponse,
  GuardBasicResponse,
  DeploymentSheetRow,
  DeploymentSheetResult,
  UserRole,
} from '@stap/shared';
import { REPLACEMENT_REASONS, type ReplacementReason } from '@stap/shared';

const SUPERVISOR_ROLES = [ROLES.OPERATIONS_SUPERVISOR, ROLES.FIELD_SUPERVISOR];

class DeploymentService {
  // ── Create roster ──────────────────────────────────────────────────────────

  async createRoster(
    data: CreateRosterInput,
    createdBy: string,
  ): Promise<RosterCreationResult> {
    // Normalise guardIds — accept both plain string and { guardId, overtimeHours } objects
    type GuardEntry = { guardId: string; overtimeHours?: number };
    const guardEntries: GuardEntry[] = (data.guardIds as (string | GuardEntry)[]).map((entry) =>
      typeof entry === 'string' ? { guardId: entry } : entry,
    );
    const guardIdList = guardEntries.map((e) => e.guardId);

    // Validate shift type exists and is active
    const shiftTypeRecord = await prisma.shiftTypeConfig.findUnique({ where: { code: data.shiftType } });
    if (!shiftTypeRecord || !shiftTypeRecord.isActive) {
      throw new AppError(`Shift type "${data.shiftType}" not found or is inactive.`, 400);
    }

    // Verify site exists
    const site = await prisma.site.findUnique({
      where: { id: data.siteId },
      select: { id: true, siteName: true, client: { select: { clientName: true } } },
    });
    if (!site) throw new NotFoundError('Site not found');

    // Verify all guards exist and are ACTIVE
    const guards = await prisma.guard.findMany({
      where: { id: { in: guardIdList } },
      select: {
        id: true, firstName: true, lastName: true, otherNames: true,
        employmentStatus: true, isIncompleteNID: true,
      },
    });

    const notFound = guardIdList.filter((id) => !guards.find((g) => g.id === id));
    if (notFound.length) {
      throw new NotFoundError(`Guard(s) not found: ${notFound.join(', ')}`);
    }

    const inactiveGuards = guards.filter(
      (g) => !DEPLOYABLE_STATUSES.includes(g.employmentStatus as GuardEmploymentStatus),
    );
    if (inactiveGuards.length) {
      const names = inactiveGuards
        .map((g) => `${g.firstName} ${g.lastName} (${guardStatusLabel(g.employmentStatus)})`)
        .join(', ');
      throw new AppError(`The following guards cannot be deployed: ${names}`, 400);
    }

    const pendingNid = guards.filter((g) => g.isIncompleteNID);
    if (pendingNid.length) {
      const names = pendingNid.map((g) => `${g.firstName} ${g.lastName}`).join(', ');
      throw new AppError(`The following guards have a pending National ID and cannot be deployed: ${names}`, 400);
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
      dates.push(start);
    } else {
      const end = new Date(data.endDate);
      end.setUTCHours(0, 0, 0, 0);
      const maxEnd = new Date(start);
      maxEnd.setDate(maxEnd.getDate() + 90);
      const effectiveEnd = end < maxEnd ? end : maxEnd;
      const current = new Date(start);
      while (current <= effectiveEnd) {
        if (data.daysOfWeek.includes(current.getDay())) {
          dates.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
      }
    }

    const guardMap = new Map(guards.map((g) => [g.id, g]));
    const overtimeMap = new Map(guardEntries.map((e) => [e.guardId, e.overtimeHours ?? 0]));
    const conflicts: ConflictDetail[] = [];
    const toCreate: { guardId: string; date: Date }[] = [];

    for (const date of dates) {
      const targetDate = new Date(date);
      targetDate.setUTCHours(0, 0, 0, 0);

      // Batch-check ALL guards for conflicts on this date (any site, including same site)
      const existingDeployments = await prisma.deployment.findMany({
        where: {
          guardId: { in: guardIdList },
          date:    targetDate,
        },
        include: {
          site: {
            select: {
              siteName: true,
              client:   { select: { clientName: true } },
            },
          },
        },
      });

      const conflictedGuardIds = new Set(existingDeployments.map((d) => d.guardId));

      for (const guardId of guardIdList) {
        if (conflictedGuardIds.has(guardId)) {
          const d = existingDeployments.find((e) => e.guardId === guardId)!;
          const g = guardMap.get(guardId)!;
          const guardName = [g.firstName, g.otherNames, g.lastName].filter(Boolean).join(' ');
          conflicts.push({
            guardId,
            guardName,
            date:           targetDate.toISOString(),
            existingSite:   d.site.siteName,
            existingClient: d.site.client.clientName,
            message:        `${guardName} is already deployed to ${d.site.siteName} (${d.site.client.clientName}) on this date.`,
          });
        } else {
          toCreate.push({ guardId, date: targetDate });
        }
      }
    }

    let created = 0;
    if (toCreate.length > 0) {
      await prisma.deployment.createMany({
        data: toCreate.map(({ guardId, date }) => ({
          guardId,
          siteId:                data.siteId,
          shiftType:             data.shiftType as 'DAY' | 'NIGHT' | 'FULL_24',
          date,
          supervisorId:          data.supervisorId,
          deploymentType:        data.deploymentType ?? 'UNARMED',
          weaponsDetails:        data.weaponsDetails ?? null,
          overtimeHours:         overtimeMap.get(guardId) || null,
          replacementForGuardId: data.replacementForGuardId ?? null,
          isPrimaryDeployment:   true,
        })),
        skipDuplicates: false,
      });

      await prisma.deploymentHistory.createMany({
        data: toCreate.map(({ guardId, date }) => ({
          guardId,
          siteId:       data.siteId,
          shiftType:    data.shiftType as 'DAY' | 'NIGHT' | 'FULL_24',
          startDate:    date,
          supervisorId: data.supervisorId,
        })),
        skipDuplicates: true,
      });

      created = toCreate.length;
    }

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'ROSTER_CREATED',
      entity:   'deployment',
      entityId: data.siteId,
      newValue: { siteId: data.siteId, created, conflicts: conflicts.length },
    });

    return { created, conflicts, skipped: conflicts.length };
  }

  // ── Check if a single guard is available on a given date ───────────────────

  async isGuardAvailable(
    guardId: string,
    date: string | Date,
  ): Promise<{ available: boolean; deployment?: { siteName: string; clientName: string; shiftType: string } }> {
    const targetDate = new Date(date);
    targetDate.setUTCHours(0, 0, 0, 0);

    const existing = await prisma.deployment.findUnique({
      where: { guardId_date: { guardId, date: targetDate } },
      include: {
        site: {
          select: {
            siteName: true,
            client:   { select: { clientName: true } },
          },
        },
      },
    });

    if (!existing) return { available: true };

    return {
      available: false,
      deployment: {
        siteName:   existing.site.siteName,
        clientName: existing.site.client.clientName,
        shiftType:  existing.shiftType,
      },
    };
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
            id:                  site.id,
            siteName:            site.siteName,
            location:            site.location,
            siteType:            site.siteType ?? 'COMMERCIAL',
            client:              site.client,
            guardsRequired:      site.guardsRequired,
            specialInstructions: site.specialInstructions ?? null,
          } as DailySheetSite['site'],
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
      isReplacement:     d.isReplacement     ?? false,
      replacementForId:  d.replacementForId  ?? null,
      replacementReason: d.replacementReason ?? null,
      attendance: att
        ? {
            status:            att.status,
            timeIn:            att.timeIn  ? (att.timeIn  instanceof Date ? att.timeIn.toISOString()  : att.timeIn)  : null,
            timeOut:           att.timeOut ? (att.timeOut instanceof Date ? att.timeOut.toISOString() : att.timeOut) : null,
            notes:             att.notes              ?? null,
            replacedByGuardId: att.replacedByGuardId  ?? null,
            replacementNote:   att.replacementNote    ?? null,
          }
        : null,
    };
  }

  // ── Copy previous roster ───────────────────────────────────────────────────

  async copyRoster(data: CopyRosterInput, createdBy: string): Promise<CopyRosterResult> {
    const sourceDateObj = new Date(data.sourceDate);
    sourceDateObj.setUTCHours(0, 0, 0, 0);

    const targetDateObj = new Date(data.targetDate);
    targetDateObj.setUTCHours(0, 0, 0, 0);

    if (sourceDateObj.getTime() === targetDateObj.getTime()) {
      throw new AppError('Source and target dates cannot be the same.', 400);
    }

    const sourceWhere: any = { date: sourceDateObj };
    if (data.siteIds?.length) sourceWhere.siteId = { in: data.siteIds };

    const sourceDeployments = await prisma.deployment.findMany({
      where: sourceWhere,
      include: {
        guard: { select: { id: true, firstName: true, lastName: true, employmentStatus: true } },
        site:  { select: { id: true, siteName: true } },
      },
    });

    if (sourceDeployments.length === 0) {
      throw new AppError(
        `No deployments found for ${sourceDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}. Build a roster for that date first.`,
        404,
      );
    }

    // Build per-site tracking
    const siteMap = new Map<string, { siteId: string; siteName: string; copied: number; skipped: number }>();
    for (const dep of sourceDeployments) {
      if (!siteMap.has(dep.siteId)) {
        siteMap.set(dep.siteId, { siteId: dep.siteId, siteName: dep.site.siteName, copied: 0, skipped: 0 });
      }
    }

    if (data.overwriteExisting) {
      const affectedSiteIds = [...siteMap.keys()];
      await prisma.deployment.deleteMany({ where: { date: targetDateObj, siteId: { in: affectedSiteIds } } });
    }

    // Guards already deployed on target (after potential deletion above)
    const alreadyDeployed = await prisma.deployment.findMany({
      where: { date: targetDateObj },
      select: { guardId: true },
    });
    const deployedGuardIds = new Set(alreadyDeployed.map(d => d.guardId));

    let created = 0;
    const skippedReasons: CopyRosterResult['skippedReasons'] = [];

    for (const dep of sourceDeployments) {
      const siteEntry = siteMap.get(dep.siteId)!;
      const guardName = `${dep.guard.firstName} ${dep.guard.lastName}`;

      if (dep.guard.employmentStatus === 'ON_LEAVE') {
        skippedReasons.push({ guardId: dep.guardId, guardName, reason: 'ON_LEAVE' });
        siteEntry.skipped++;
        continue;
      }

      if (!DEPLOYABLE_STATUSES.includes(dep.guard.employmentStatus as GuardEmploymentStatus)) {
        skippedReasons.push({ guardId: dep.guardId, guardName, reason: 'INACTIVE' });
        siteEntry.skipped++;
        continue;
      }

      if (deployedGuardIds.has(dep.guardId)) {
        skippedReasons.push({ guardId: dep.guardId, guardName, reason: 'ALREADY_DEPLOYED' });
        siteEntry.skipped++;
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
          overtimeHours:  null,
        },
      });

      deployedGuardIds.add(dep.guardId);
      created++;
      siteEntry.copied++;
    }

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'ROSTER_COPIED',
      entity:   'deployment',
      entityId: 'batch',
      newValue: { sourceDate: data.sourceDate, targetDate: data.targetDate, created, skipped: skippedReasons.length },
    });

    return {
      sourceDate:     sourceDateObj.toISOString(),
      targetDate:     targetDateObj.toISOString(),
      created,
      skipped:        skippedReasons.length,
      skippedReasons,
      sitesSummary:   Array.from(siteMap.values()),
    };
  }

  async getPastRosterDates(limit = 14): Promise<{ date: string; siteCount: number; guardCount: number; siteSummary: string }[]> {
    const rows = await prisma.$queryRaw<{ date: Date; site_count: bigint; guard_count: bigint }[]>`
      SELECT
        date,
        COUNT(DISTINCT "siteId")  AS site_count,
        COUNT(*)                   AS guard_count
      FROM "Deployment"
      WHERE date < NOW()
      GROUP BY date
      ORDER BY date DESC
      LIMIT ${limit}
    `;

    return Promise.all(
      rows.map(async (row) => {
        const sites = await prisma.deployment.findMany({
          where:    { date: row.date },
          distinct: ['siteId'],
          select:   { site: { select: { siteName: true } } },
          take:     3,
        });
        const names     = sites.map(s => s.site.siteName);
        const siteCount = Number(row.site_count);
        const siteSummary = siteCount > 2
          ? `${names[0]}, ${names[1]} +${siteCount - 2} more`
          : names.join(', ');

        return {
          date:       row.date.toISOString(),
          siteCount,
          guardCount: Number(row.guard_count),
          siteSummary,
        };
      }),
    );
  }

  // Kept for backwards-compat — delegates to copyRoster
  async copyPreviousRoster(sourceDate: string, targetDate: string, createdBy: string): Promise<{ created: number; skipped: number }> {
    const result = await this.copyRoster({ sourceDate, targetDate, overwriteExisting: false }, createdBy);
    return { created: result.created, skipped: result.skipped };
  }

  // ── Get available replacements ─────────────────────────────────────────────

  async getAvailableReplacements(
    siteId: string,
    date: string,
    absentGuardId: string,
  ): Promise<GuardAvailabilityResponse[]> {
    const dateObj = new Date(date);
    dateObj.setUTCHours(0, 0, 0, 0);

    const deployedToday = await prisma.deployment.findMany({
      where:  { date: dateObj },
      select: { guardId: true, site: { select: { siteName: true } } },
    });
    const deployedGuardMap = new Map(deployedToday.map(d => [d.guardId, d.site.siteName]));

    const allGuards = await prisma.guard.findMany({
      where: {
        employmentStatus: { in: DEPLOYABLE_STATUSES },
        id:               { not: absentGuardId },
      },
      select: {
        id: true, systemId: true, firstName: true, lastName: true,
        phone: true, photoUrl: true, rank: true,
      },
    });

    return allGuards.map(g => ({
      id:              g.id,
      systemId:        g.systemId ?? null,
      firstName:       g.firstName,
      lastName:        g.lastName,
      fullName:        `${g.firstName} ${g.lastName}`,
      phone:           g.phone,
      photoUrl:        g.photoUrl ?? null,
      rank:            g.rank ?? null,
      alreadyDeployed: deployedGuardMap.has(g.id),
      deployedAt:      deployedGuardMap.get(g.id) ?? null,
      onLeave:         false,
    })).sort((a, b) => {
      if (!a.alreadyDeployed && b.alreadyDeployed) return -1;
      if (a.alreadyDeployed && !b.alreadyDeployed) return  1;
      return a.firstName.localeCompare(b.firstName);
    });
  }

  // ── Assign replacement guard ────────────────────────────────────────────────

  async assignReplacement(data: RequestReplacementInput, assignedBy: string): Promise<ReplacementResult> {
    const absent = await prisma.deployment.findUnique({
      where:   { id: data.absentDeploymentId },
      include: {
        guard: { select: { id: true, firstName: true, lastName: true } },
        site:  { select: { id: true, siteName: true } },
      },
    });
    if (!absent) throw new NotFoundError('Original deployment not found');

    const replacement = await prisma.guard.findUnique({
      where:  { id: data.replacementGuardId },
      select: { id: true, systemId: true, firstName: true, lastName: true, employmentStatus: true, isIncompleteNID: true },
    });
    if (!replacement) throw new NotFoundError('Replacement guard not found');

    if (!DEPLOYABLE_STATUSES.includes(replacement.employmentStatus as GuardEmploymentStatus)) {
      throw new AppError(
        replacement.employmentStatus === 'ON_LEAVE'
          ? `${replacement.firstName} ${replacement.lastName} is on leave and is not available for deployment.`
          : `${replacement.firstName} ${replacement.lastName} cannot be deployed — current status is ` +
            `${guardStatusLabel(replacement.employmentStatus)}.`,
        400,
      );
    }

    const conflict = await prisma.deployment.findFirst({
      where: { guardId: data.replacementGuardId, date: absent.date, siteId: absent.siteId },
    });
    if (conflict) {
      throw new AppError(`${replacement.firstName} ${replacement.lastName} is already deployed at ${absent.site.siteName} on this date.`, 409);
    }

    const newDeployment = await prisma.deployment.create({
      data: {
        guardId:           data.replacementGuardId,
        siteId:            absent.siteId,
        supervisorId:      absent.supervisorId,
        shiftType:         absent.shiftType,
        date:              absent.date,
        deploymentType:    absent.deploymentType,
        weaponsDetails:    absent.weaponsDetails,
        isReplacement:     true,
        replacementForId:  absent.id,
        replacementReason: data.reason,
      },
    });

    // Update or create the absent guard's attendance record
    const existingAtt = await prisma.attendanceRecord.findFirst({
      where: { guardId: absent.guardId, siteId: absent.siteId, date: absent.date },
    });
    if (existingAtt) {
      await prisma.attendanceRecord.update({
        where: { id: existingAtt.id },
        data:  { replacedByGuardId: data.replacementGuardId, replacementNote: data.note ?? null },
      });
    } else {
      await prisma.attendanceRecord.create({
        data: {
          guardId:           absent.guardId,
          siteId:            absent.siteId,
          date:              absent.date,
          status:            data.reason === 'AWOL' ? 'AWOL' : 'ABSENT',
          replacedByGuardId: data.replacementGuardId,
          replacementNote:   data.note ?? null,
        },
      });
    }

    await QueueService.logAudit({
      userId:   assignedBy,
      action:   'GUARD_REPLACED',
      entity:   'deployment',
      entityId: newDeployment.id,
      newValue: {
        absentGuard:      `${absent.guard.firstName} ${absent.guard.lastName}`,
        replacementGuard: `${replacement.firstName} ${replacement.lastName}`,
        site:             absent.site.siteName,
        reason:           data.reason,
        note:             data.note,
      },
    });

    await notificationService.sendToRoles(
      ['DIRECTOR', 'OPERATIONS_SUPERVISOR'],
      {
        type:       'SYSTEM',
        title:      'Guard Replacement Assigned',
        message:    `${replacement.firstName} ${replacement.lastName} assigned to replace ${absent.guard.firstName} ${absent.guard.lastName} at ${absent.site.siteName}. Reason: ${REPLACEMENT_REASONS[data.reason as ReplacementReason]}.`,
        entityType: 'deployment',
        entityId:   newDeployment.id,
      },
    );

    return {
      originalDeployment: {
        id:        absent.id,
        guardName: `${absent.guard.firstName} ${absent.guard.lastName}`,
        siteName:  absent.site.siteName,
        shiftType: absent.shiftType,
        date:      absent.date.toISOString(),
      },
      replacementDeployment: {
        id:        newDeployment.id,
        guardName: `${replacement.firstName} ${replacement.lastName}`,
        systemId:  replacement.systemId ?? null,
      },
      reason: data.reason,
      note:   data.note ?? null,
    };
  }

  // ── Deployment sheet (batch upsert) ──────────────────────────────────────────

  /**
   * Resolves the shift code for a site: its configured default, else its first
   * allowed shift, else the lowest-ordered active shift in the catalogue.
   * Deployment.shiftType is required, so a row must always land on something.
   */
  private async resolveShift(site: { defaultShiftType: string | null; allowedShiftTypes: string[] }): Promise<string | null> {
    if (site.defaultShiftType) return site.defaultShiftType;
    if (site.allowedShiftTypes.length) return site.allowedShiftTypes[0];
    const fallback = await prisma.shiftTypeConfig.findFirst({
      where:   { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select:  { code: true },
    });
    return fallback?.code ?? null;
  }

  /**
   * Saves a whole deployment sheet in one call.
   *
   * Each row writes two records: a Deployment (who is posted where, on what
   * shift) and an AttendanceRecord (how that posting turned out). A bad row is
   * reported by its 1-based sheet position and skipped — the rest still save,
   * which matters when someone is entering twenty rows at once.
   */
  async saveDeploymentSheet(
    rows: DeploymentSheetRow[],
    submittedBy: string,
    submittedByRole?: UserRole,
  ): Promise<DeploymentSheetResult> {
    const result: DeploymentSheetResult = { created: 0, updated: 0, skipped: 0, errors: [] };

    const activeShifts = await prisma.shiftTypeConfig.findMany({
      where:  { isActive: true },
      select: { code: true },
    });
    const validShiftCodes = new Set(activeShifts.map(s => s.code));

    // A Field Supervisor deploys within their own zone. The sheet's Site
    // dropdown already only offers those sites, but the restriction has to hold
    // on this side too — the dropdown is a convenience, not the boundary.
    let allowedSiteIds: Set<string> | null = null;
    if (submittedByRole === ROLES.FIELD_SUPERVISOR) {
      const zoneSites = await prisma.site.findMany({
        where:  { zone: { isActive: true, OR: [{ supervisorId: submittedBy }, { alternateId: submittedBy }] } },
        select: { id: true },
      });
      allowedSiteIds = new Set(zoneSites.map(s => s.id));
    }

    for (let i = 0; i < rows.length; i++) {
      const row    = rows[i];
      const rowNum = i + 1;

      try {
        const [guard, site] = await Promise.all([
          prisma.guard.findUnique({
            where:  { id: row.guardId },
            select: { id: true, firstName: true, lastName: true, employmentStatus: true, isIncompleteNID: true },
          }),
          prisma.site.findUnique({
            where:  { id: row.siteId },
            select: { id: true, siteName: true, defaultShiftType: true, allowedShiftTypes: true, zone: { select: { supervisorId: true } } },
          }),
        ]);

        if (!guard) { result.errors.push({ row: rowNum, reason: 'Guard not found.' }); result.skipped++; continue; }
        if (!site)  { result.errors.push({ row: rowNum, reason: 'Site not found.' });  result.skipped++; continue; }

        if (allowedSiteIds && !allowedSiteIds.has(site.id)) {
          result.errors.push({
            row:    rowNum,
            reason: `${site.siteName} is not in your zone — you can only deploy to sites in the zone you supervise.`,
          });
          result.skipped++;
          continue;
        }

        if (!DEPLOYABLE_STATUSES.includes(guard.employmentStatus as GuardEmploymentStatus)) {
          result.errors.push({
            row:    rowNum,
            reason: `${guard.firstName} ${guard.lastName} cannot be deployed — ${guardStatusLabel(guard.employmentStatus)}.`,
          });
          result.skipped++;
          continue;
        }

        const shiftCode = row.shift ?? (await this.resolveShift(site));
        if (!shiftCode) {
          result.errors.push({ row: rowNum, reason: 'No shift set for this site and no active shift types configured.' });
          result.skipped++;
          continue;
        }
        if (!validShiftCodes.has(shiftCode)) {
          result.errors.push({ row: rowNum, reason: `Shift "${shiftCode}" is not an active shift type.` });
          result.skipped++;
          continue;
        }

        const date = new Date(row.date);
        date.setUTCHours(0, 0, 0, 0);

        // A guard holds at most one deployment per day across every site, so a
        // clash here means the sheet lists them twice or they are already
        // posted elsewhere. Say which site, rather than surfacing a P2002.
        const sameDay = await prisma.deployment.findUnique({
          where:   { guardId_date: { guardId: row.guardId, date } },
          include: { site: { select: { id: true, siteName: true } } },
        });

        if (sameDay && sameDay.site.id !== row.siteId) {
          result.errors.push({
            row:    rowNum,
            reason: `${guard.firstName} ${guard.lastName} is already deployed to ${sameDay.site.siteName} on this date.`,
          });
          result.skipped++;
          continue;
        }

        // Supervisor is required on Deployment. Prefer the site's zone
        // supervisor; fall back to whoever is filling in the sheet.
        const supervisorId = site.zone?.supervisorId ?? submittedBy;

        if (sameDay) {
          await prisma.deployment.update({
            where: { id: sameDay.id },
            data:  { shiftType: shiftCode as 'DAY' | 'NIGHT' | 'FULL_24' },
          });
          result.updated++;
        } else {
          await prisma.deployment.create({
            data: {
              guardId:   row.guardId,
              siteId:    row.siteId,
              date,
              shiftType: shiftCode as 'DAY' | 'NIGHT' | 'FULL_24',
              supervisorId,
            },
          });
          result.created++;
        }

        // Attendance carries the Status column.
        await prisma.attendanceRecord.upsert({
          where:  { guardId_siteId_date: { guardId: row.guardId, siteId: row.siteId, date } },
          create: { guardId: row.guardId, siteId: row.siteId, date, status: row.status },
          update: { status: row.status },
        });
      } catch (err) {
        result.errors.push({ row: rowNum, reason: err instanceof Error ? err.message : 'Unexpected error saving this row.' });
        result.skipped++;
      }
    }

    await QueueService.logAudit({
      userId:   submittedBy,
      action:   'DEPLOYMENT_SHEET_SAVED',
      entity:   'deployment',
      entityId: submittedBy,
      newValue: { created: result.created, updated: result.updated, skipped: result.skipped },
    }).catch(() => { /* a queue outage must not fail a save that already happened */ });

    return result;
  }

}

export const deploymentService = new DeploymentService();
