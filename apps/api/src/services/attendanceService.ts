import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import type {
  MarkAttendanceInput,
  AttendanceQuery,
  AttendanceRecord,
  AttendanceSummary,
  PaginatedResponse,
} from '@stap/shared';

class AttendanceService {
  // ── Mark attendance ────────────────────────────────────────────────────────

  async markAttendance(
    records: MarkAttendanceInput['records'],
    markedBy: string,
  ): Promise<{ marked: number; updated: number }> {
    let marked = 0;
    let updated = 0;
    const absentGuards: { guardId: string; siteId: string; date: string }[] = [];

    for (const record of records) {
      const dateVal = new Date(record.date);
      dateVal.setUTCHours(0, 0, 0, 0);
      const dateEnd = new Date(dateVal);
      dateEnd.setUTCHours(23, 59, 59, 999);

      // Check if attendance record already exists
      const existing = await prisma.attendanceRecord.findFirst({
        where: {
          guardId: record.guardId,
          siteId: record.siteId,
          date: { gte: dateVal, lte: dateEnd },
        },
      });

      if (existing) {
        // Update existing record
        await prisma.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            status: record.status,
            timeIn: record.timeIn ? new Date(`1970-01-01T${record.timeIn}:00Z`) : null,
            timeOut: record.timeOut ? new Date(`1970-01-01T${record.timeOut}:00Z`) : null,
            notes: record.notes ?? null,
          },
        });
        updated++;
      } else {
        // Create new record
        await prisma.attendanceRecord.create({
          data: {
            guardId: record.guardId,
            siteId: record.siteId,
            date: dateVal,
            status: record.status,
            timeIn: record.timeIn ? new Date(`1970-01-01T${record.timeIn}:00Z`) : null,
            timeOut: record.timeOut ? new Date(`1970-01-01T${record.timeOut}:00Z`) : null,
            notes: record.notes ?? null,
          },
        });
        marked++;
      }

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
      newValue: { recordCount: records.length, markedBy },
    });

    return { marked, updated };
  }

  // ── Get attendance by date ─────────────────────────────────────────────────

  async getAttendanceByDate(query: AttendanceQuery): Promise<PaginatedResponse<AttendanceRecord>> {
    const { page, limit, date, siteId, status } = query;
    const skip = (page - 1) * limit;

    const where: import('@prisma/client').Prisma.AttendanceRecordWhereInput = {};

    if (date) {
      const d = new Date(date.slice(0, 10) + 'T00:00:00.000Z');
      const end = new Date(date.slice(0, 10) + 'T23:59:59.999Z');
      where.date = { gte: d, lte: end };
    }

    if (siteId) where.siteId = siteId;
    if (status) where.status = status;

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
    const fromDate = new Date(from.slice(0, 10) + 'T00:00:00.000Z');
    const toDate = new Date(to.slice(0, 10) + 'T23:59:59.999Z');

    const where: import('@prisma/client').Prisma.AttendanceRecordWhereInput = {
      date: { gte: fromDate, lte: toDate },
    };
    if (guardId) where.guardId = guardId;
    if (siteId) where.siteId = siteId;

    const records = await prisma.attendanceRecord.findMany({
      where,
      select: { date: true, status: true },
      orderBy: { date: 'asc' },
    });

    // Group by date
    const byDate = new Map<string, { present: number; absent: number; late: number; awol: number }>();

    for (const r of records) {
      const dateKey = r.date.toISOString().slice(0, 10);
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, { present: 0, absent: 0, late: 0, awol: 0 });
      }
      const entry = byDate.get(dateKey)!;
      if (r.status === 'PRESENT') entry.present++;
      else if (r.status === 'ABSENT') entry.absent++;
      else if (r.status === 'LATE') entry.late++;
      else if (r.status === 'AWOL') entry.awol++;
    }

    return Array.from(byDate.entries()).map(([date, counts]) => ({
      date,
      ...counts,
    }));
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
      timeIn: r.timeIn ? (r.timeIn instanceof Date ? r.timeIn.toISOString() : r.timeIn) : null,
      timeOut: r.timeOut ? (r.timeOut instanceof Date ? r.timeOut.toISOString() : r.timeOut) : null,
      notes: r.notes ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    };
  }
}

export const attendanceService = new AttendanceService();
