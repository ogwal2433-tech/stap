import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    attendanceRecord: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    deployment: {
      count: vi.fn(),
    },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: {
    logAudit: vi.fn().mockResolvedValue(undefined),
    sendSms: vi.fn().mockResolvedValue(undefined),
  },
}));

import prisma from '../../db/prisma';
import { attendanceService } from '../../services/attendanceService';

const mockPrisma = prisma as unknown as {
  attendanceRecord: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  deployment: { count: ReturnType<typeof vi.fn> };
};

const baseRecord = {
  guardId: 'g1',
  siteId: 's1',
  date: '2026-04-14T00:00:00.000Z',
  status: 'PRESENT' as const,
  timeIn: '08:00',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ── markAttendance() ───────────────────────────────────────────────────────────

describe('attendanceService.markAttendance()', () => {
  it('creates attendance record when none exists', async () => {
    mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);
    mockPrisma.attendanceRecord.create.mockResolvedValue({ id: 'a1', ...baseRecord });

    const result = await attendanceService.markAttendance([baseRecord], 'user1');

    expect(result.marked).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockPrisma.attendanceRecord.create).toHaveBeenCalledTimes(1);
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ATTENDANCE_MARKED' }),
    );
  });

  it('updates existing record on upsert', async () => {
    mockPrisma.attendanceRecord.findFirst.mockResolvedValue({ id: 'existing-a1' });
    mockPrisma.attendanceRecord.update.mockResolvedValue({ id: 'existing-a1', ...baseRecord });

    const result = await attendanceService.markAttendance([baseRecord], 'user1');

    expect(result.marked).toBe(0);
    expect(result.updated).toBe(1);
    expect(mockPrisma.attendanceRecord.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.attendanceRecord.create).not.toHaveBeenCalled();
  });

  it('enqueues SMS notification for ABSENT guard', async () => {
    mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);
    mockPrisma.attendanceRecord.create.mockResolvedValue({ id: 'a1' });

    await attendanceService.markAttendance(
      [{ ...baseRecord, status: 'ABSENT' }],
      'user1',
    );

    expect(QueueService.sendSms).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('ABSENT/AWOL') }),
    );
  });

  it('enqueues SMS notification for AWOL guard', async () => {
    mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);
    mockPrisma.attendanceRecord.create.mockResolvedValue({ id: 'a1' });

    await attendanceService.markAttendance(
      [{ ...baseRecord, status: 'AWOL' }],
      'user1',
    );

    expect(QueueService.sendSms).toHaveBeenCalled();
  });

  it('does not send SMS for PRESENT guards', async () => {
    mockPrisma.attendanceRecord.findFirst.mockResolvedValue(null);
    mockPrisma.attendanceRecord.create.mockResolvedValue({ id: 'a1' });

    await attendanceService.markAttendance([baseRecord], 'user1');

    expect(QueueService.sendSms).not.toHaveBeenCalled();
  });
});

// ── getAttendanceSummary() ─────────────────────────────────────────────────────

describe('attendanceService.getAttendanceSummary()', () => {
  it('returns correct counts per date in range', async () => {
    const date1 = new Date('2026-04-14T00:00:00.000Z');
    const date2 = new Date('2026-04-15T00:00:00.000Z');

    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      { date: date1, status: 'PRESENT' },
      { date: date1, status: 'PRESENT' },
      { date: date1, status: 'ABSENT' },
      { date: date2, status: 'LATE' },
      { date: date2, status: 'AWOL' },
    ]);

    const result = await attendanceService.getAttendanceSummary(
      '2026-04-14',
      '2026-04-15',
    );

    expect(result).toHaveLength(2);

    const day1 = result.find((r) => r.date === '2026-04-14');
    expect(day1).toBeDefined();
    expect(day1!.present).toBe(2);
    expect(day1!.absent).toBe(1);
    expect(day1!.late).toBe(0);
    expect(day1!.awol).toBe(0);

    const day2 = result.find((r) => r.date === '2026-04-15');
    expect(day2).toBeDefined();
    expect(day2!.late).toBe(1);
    expect(day2!.awol).toBe(1);
  });
});

// ── getGuardAttendanceRate() ───────────────────────────────────────────────────

describe('attendanceService.getGuardAttendanceRate()', () => {
  it('calculates correct attendance percentage', async () => {
    mockPrisma.deployment.count.mockResolvedValue(10);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([
      { status: 'PRESENT' },
      { status: 'PRESENT' },
      { status: 'PRESENT' },
      { status: 'LATE' },   // counts as attendance
      { status: 'ABSENT' },
      { status: 'AWOL' },
    ]);

    const result = await attendanceService.getGuardAttendanceRate(
      'g1',
      '2026-04-01',
      '2026-04-30',
    );

    expect(result.totalDays).toBe(10);
    expect(result.present).toBe(3);
    expect(result.late).toBe(1);
    expect(result.absent).toBe(1);
    expect(result.awol).toBe(1);
    // (present + late) / totalDays = 4/10 = 40%
    expect(result.attendanceRate).toBe(40);
  });

  it('returns 0 rate when no deployments', async () => {
    mockPrisma.deployment.count.mockResolvedValue(0);
    mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

    const result = await attendanceService.getGuardAttendanceRate(
      'g1',
      '2026-04-01',
      '2026-04-30',
    );

    expect(result.attendanceRate).toBe(0);
    expect(result.totalDays).toBe(0);
  });
});
