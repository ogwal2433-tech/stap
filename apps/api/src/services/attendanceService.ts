import prisma from '../db/prisma';
import { safeDate } from '../lib/dateUtils';
import { QueueService } from '../jobs/QueueService';
import { AppError } from '../errors/AppError';
import type {
  MarkAttendanceInput,
  AttendanceQuery,
  AttendanceRecord,
  AttendanceSummary,
  GuardAttendanceSummary,
  GuardAttendanceSummaryResponse,
  PaginatedResponse,
} from '@security360/shared';

class AttendanceService {
  // ── Mark attendance ────────────────────────────────────────────────────────

  async markAttendance(
    records: MarkAttendanceInput['records'],
    markedBy: string,
  ): Promise<{ marked: number; updated: number; skippedDeserted: number; skippedNames: string[] }> {
    let marked = 0;
    let updated = 0;
    const absentGuards: { guardId: string; siteId: string; date: string }[] = [];

    // Deserted guards are quarantined: no attendance may be recorded for them.
    // Rather than rejecting the whole batch (which blocks "mark all present" the
    // moment one stale deserter row is still on the sheet), their records are
    // filtered out and reported back so the rest of the batch still saves.
    const guardIds = [...new Set(records.map((r) => r.guardId))];
    let skippedDeserted = 0;
    let skippedNames: string[] = [];
    let recordsToWrite = records;
    if (guardIds.length) {
      const deserted = await prisma.guard.findMany({
        where: { id: { in: guardIds }, employmentStatus: 'DESERTED' },
        select: { id: true, firstName: true, lastName: true },
      });
      if (deserted.length) {
        const desertedIds = new Set(deserted.map((g) => g.id));
        skippedNames = deserted.map((g) => `${g.firstName} ${g.lastName}`.trim());
        skippedDeserted = records.filter((r) => desertedIds.has(r.guardId)).length;
        recordsToWrite = records.filter((r) => !desertedIds.has(r.guardId));
      }
    }

    for (const record of recordsToWrite) {
      const date = new Date(record.date);
      date.setUTCHours(0, 0, 0, 0);

      const existing = await prisma.attendanceRecord.findUnique({
        where: { guardId_siteId_date: { guardId: record.guardId, siteId: record.siteId, date } },
        select: { id: true },
      });

      await prisma.attendanceRecord.upsert({
        where: {
          guardId_siteId_date: { guardId: record.guardId, siteId: record.siteId, date },
        },
        create: {
          guardId: record.guardId,
          siteId:  record.siteId,
          date,
          status:  record.status,
          notes:   record.notes ?? null,
        },
        update: {
          status:  record.status,
          notes:   record.notes ?? null,
        },
      });

      if (existing) { updated++; } else { marked++; }

      // Collect absent/AWOL guards for notification
      if (record.status === 'ABSENT' || record.status === 'AWOL') {
        absentGuards.push({ guardId: record.guardId, siteId: record.siteId, date: record.date });
      }
    }

    // Notify operations manager about absent/AWOL guards
    if (absentGuards.length > 0) {
      await QueueService.sendSms({
        to: process.env.OPS_MANAGER_PHONE ?? '+256700000000',
        message: `ALERT: ${absentGuards.length} guard(s) marked ABSENT/AWOL. Review attendance records.`,
      });
    }

    await QueueService.logAudit({
      userId: markedBy,
      action: 'ATTENDANCE_MARKED',
      entity: 'attendanceRecord',
      entityId: 'bulk',
      newValue: { recordCount: recordsToWrite.length, skippedDeserted, markedBy },
    });

    return { marked, updated, skippedDeserted, skippedNames };
  }

  // ── Get attendance by date ─────────────────────────────────────────────────

  async getAttendanceByDate(query: AttendanceQuery): Promise<PaginatedResponse<AttendanceRecord>> {
    const { page, limit, date, dateFrom, dateTo, siteId, guardId, status } = query;
    const skip = (page - 1) * limit;

    const where: import('@prisma/client').Prisma.AttendanceRecordWhereInput = {};

    // Attendance dates are stored at UTC midnight, so the bounds are built as
    // explicit UTC instants rather than local ones. utcDayStart/utcDayEnd return
    // null for anything unparseable, which is then left out of the filter — an
    // Invalid Date here would be rejected by Prisma and 500 the whole page.
    const utcDayStart = (v?: string) => safeDate(v ? `${v.slice(0, 10)}T00:00:00.000Z` : null);
    const utcDayEnd   = (v?: string) => safeDate(v ? `${v.slice(0, 10)}T23:59:59.999Z` : null);

    // A range wins over the single-day param, so callers can move from one to
    // the other without having to clear `date` first.
    const rangeFrom = utcDayStart(dateFrom);
    const rangeTo   = utcDayEnd(dateTo);

    if (rangeFrom || rangeTo) {
      where.date = {
        ...(rangeFrom ? { gte: rangeFrom } : {}),
        ...(rangeTo   ? { lte: rangeTo }   : {}),
      };
    } else {
      const dayStart = utcDayStart(date);
      const dayEnd   = utcDayEnd(date);
      if (dayStart && dayEnd) where.date = { gte: dayStart, lte: dayEnd };
    }

    if (siteId)  where.siteId  = siteId;
    if (guardId) where.guardId = guardId;
    if (status)  where.status  = status;
    // Deserted guards never appear in attendance records, past or present.
    where.guard = { employmentStatus: { not: 'DESERTED' } };

    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          guard: { select: { id: true, firstName: true, lastName: true, otherNames: true, photoUrl: true } },
          site: { select: { id: true, siteName: true } },
        },
      }),
      prisma.attendanceRecord.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: records.map((r) => this.formatRecord(r)),
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

  // ── Get attendance summary ─────────────────────────────────────────────────

  async getAttendanceSummary(
    from: string,
    to: string,
    guardId?: string,
    siteId?: string,
  ): Promise<AttendanceSummary[]> {
    const fromDate = safeDate(`${from.slice(0, 10)}T00:00:00.000Z`);
    const toDate   = safeDate(`${to.slice(0, 10)}T23:59:59.999Z`);

    // Both bounds are required here, so an unreadable one is a bad request —
    // dropping it would silently summarise every record ever stored.
    if (!fromDate || !toDate) {
      throw new AppError('from and to must be valid dates (YYYY-MM-DD).', 400);
    }

    const where: import('@prisma/client').Prisma.AttendanceRecordWhereInput = {
      date: { gte: fromDate, lte: toDate },
      guard: { employmentStatus: { not: 'DESERTED' } },
    };
    if (guardId) where.guardId = guardId;
    if (siteId) where.siteId = siteId;

    const records = await prisma.attendanceRecord.findMany({
      where,
      select: { date: true, status: true },
      orderBy: { date: 'asc' },
    });

    // Group by date. SICK and ON_LEAVE are folded into `absent` here so the
    // daily totals still add up — the per-guard summary breaks them out.
    const byDate = new Map<string, { present: number; absent: number; late: number; awol: number }>();

    for (const r of records) {
      const dateKey = r.date.toISOString().slice(0, 10);
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, { present: 0, absent: 0, late: 0, awol: 0 });
      }
      const entry = byDate.get(dateKey)!;
      if (r.status === 'PRESENT') entry.present++;
      else if (r.status === 'LATE') entry.late++;
      else if (r.status === 'AWOL') entry.awol++;
      else entry.absent++; // ABSENT, SICK, ON_LEAVE
    }

    return Array.from(byDate.entries()).map(([date, counts]) => ({
      date,
      ...counts,
    }));
  }

  // ── Per-guard summary over a range (Excel export) ──────────────────────────

  /**
   * One row per guard for the period: how many days present, late, sick, on
   * leave, absent and AWOL. `attendanceRate` counts PRESENT + LATE, matching
   * what payrollService treats as a day worked.
   */
  async getGuardAttendanceSummary(
    from: string,
    to: string,
    siteId?: string,
  ): Promise<GuardAttendanceSummaryResponse> {
    const fromDate = safeDate(`${from.slice(0, 10)}T00:00:00.000Z`);
    const toDate   = safeDate(`${to.slice(0, 10)}T23:59:59.999Z`);

    if (!fromDate || !toDate) {
      throw new AppError('from and to must be valid dates (YYYY-MM-DD).', 400);
    }

    if (toDate < fromDate) {
      throw new AppError('The end of the period cannot be before the start.', 400);
    }

    const where: import('@prisma/client').Prisma.AttendanceRecordWhereInput = {
      date: { gte: fromDate, lte: toDate },
    };
    if (siteId) where.siteId = siteId;

    const records = await prisma.attendanceRecord.findMany({
      where,
      select: {
        status: true,
        guard:  { select: { id: true, firstName: true, lastName: true, systemId: true, rank: true } },
        site:   { select: { siteName: true } },
      },
      orderBy: { date: 'asc' },
    });

    type Row = Omit<GuardAttendanceSummary, 'sites' | 'attendanceRate'> & { siteSet: Set<string> };
    const byGuard = new Map<string, Row>();

    for (const r of records) {
      let row = byGuard.get(r.guard.id);
      if (!row) {
        row = {
          guardId:      r.guard.id,
          guardName:    `${r.guard.firstName} ${r.guard.lastName}`,
          systemId:     r.guard.systemId ?? null,
          rank:         r.guard.rank ?? null,
          presentDays:  0,
          lateDays:     0,
          sickDays:     0,
          onLeaveDays:  0,
          absentDays:   0,
          awolDays:     0,
          totalRecords: 0,
          siteSet:      new Set<string>(),
        };
        byGuard.set(r.guard.id, row);
      }

      row.totalRecords++;
      row.siteSet.add(r.site.siteName);

      switch (r.status) {
        case 'PRESENT':  row.presentDays++; break;
        case 'LATE':     row.lateDays++;    break;
        case 'SICK':     row.sickDays++;    break;
        case 'ON_LEAVE': row.onLeaveDays++; break;
        case 'AWOL':     row.awolDays++;    break;
        default:         row.absentDays++;  break;
      }
    }

    const summary: GuardAttendanceSummary[] = Array.from(byGuard.values())
      .map(({ siteSet, ...row }) => ({
        ...row,
        sites: Array.from(siteSet).sort().join(', '),
        attendanceRate: row.totalRecords > 0
          ? Math.round(((row.presentDays + row.lateDays) / row.totalRecords) * 100)
          : 0,
      }))
      .sort((a, b) => a.guardName.localeCompare(b.guardName));

    // Count whole calendar days inclusive. toDate is end-of-day, so measure
    // midnight-to-midnight — using toDate directly would count one day too many.
    const toMidnight = new Date(to.slice(0, 10) + 'T00:00:00.000Z');
    const totalDays  = Math.round((toMidnight.getTime() - fromDate.getTime()) / 86_400_000) + 1;

    return {
      dateFrom:   fromDate.toISOString(),
      dateTo:     toDate.toISOString(),
      totalDays,
      guardCount: summary.length,
      summary,
    };
  }

  // ── Get guard attendance rate ──────────────────────────────────────────────

  async getGuardAttendanceRate(
    guardId: string,
    from: string,
    to: string,
  ): Promise<{
    totalDays: number;
    present: number;
    absent: number;
    late: number;
    awol: number;
    attendanceRate: number;
  }> {
    const fromDate = new Date(from.slice(0, 10) + 'T00:00:00.000Z');
    const toDate = new Date(to.slice(0, 10) + 'T23:59:59.999Z');

    // Deserted guards never appear in attendance records.
    const target = await prisma.guard.findUnique({
      where: { id: guardId }, select: { employmentStatus: true },
    });
    if (target?.employmentStatus === 'DESERTED') {
      return { totalDays: 0, present: 0, absent: 0, late: 0, awol: 0, attendanceRate: 0 };
    }

    const [totalDays, records] = await Promise.all([
      prisma.deployment.count({
        where: {
          guardId,
          date: { gte: fromDate, lte: toDate },
        },
      }),
      prisma.attendanceRecord.findMany({
        where: {
          guardId,
          date: { gte: fromDate, lte: toDate },
        },
        select: { status: true },
      }),
    ]);

    const counts = { present: 0, absent: 0, late: 0, awol: 0 };
    for (const r of records) {
      if (r.status === 'PRESENT') counts.present++;
      else if (r.status === 'ABSENT') counts.absent++;
      else if (r.status === 'LATE') counts.late++;
      else if (r.status === 'AWOL') counts.awol++;
    }

    const attendanceRate = totalDays > 0
      ? Math.round(((counts.present + counts.late) / totalDays) * 100)
      : 0;

    return { totalDays, ...counts, attendanceRate };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatRecord(r: any): AttendanceRecord {
    const fullName = [r.guard.firstName, r.guard.otherNames, r.guard.lastName]
      .filter(Boolean)
      .join(' ');

    return {
      id: r.id,
      guard: { id: r.guard.id, fullName, photoUrl: r.guard.photoUrl ?? null },
      site: { id: r.site.id, siteName: r.site.siteName },
      date: r.date instanceof Date ? r.date.toISOString() : r.date,
      status: r.status as 'PRESENT' | 'ABSENT' | 'LATE' | 'AWOL',
      notes: r.notes ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    };
  }
}

export const attendanceService = new AttendanceService();
