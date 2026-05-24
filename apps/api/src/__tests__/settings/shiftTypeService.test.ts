import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    shiftType: {
      findMany:   vi.fn(),
      findUnique: vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      delete:     vi.fn(),
    },
    deployment: {
      count: vi.fn(),
    },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { shiftTypeService } from '../../services/shiftTypeService';
import { AppError, NotFoundError } from '../../errors/AppError';

const mockPrisma = prisma as unknown as {
  shiftType: {
    findMany:   ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create:     ReturnType<typeof vi.fn>;
    update:     ReturnType<typeof vi.fn>;
    delete:     ReturnType<typeof vi.fn>;
  };
  deployment: {
    count: ReturnType<typeof vi.fn>;
  };
};

const baseShift = {
  id:            'st1',
  name:          'Day Shift',
  code:          'DAY',
  startTime:     '06:00',
  endTime:       '18:00',
  durationHours: 12,
  displayOrder:  1,
  isActive:      true,
  isOvertime:    false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.shiftType.findUnique.mockResolvedValue(baseShift);
  mockPrisma.shiftType.findMany.mockResolvedValue([baseShift]);
  mockPrisma.shiftType.create.mockResolvedValue({ ...baseShift, id: 'st-new' });
  mockPrisma.shiftType.update.mockResolvedValue({ ...baseShift, name: 'Updated Shift' });
  mockPrisma.shiftType.delete.mockResolvedValue({});
  mockPrisma.deployment.count.mockResolvedValue(0);
});

// ── listShiftTypes() ───────────────────────────────────────────────────────────

describe('shiftTypeService.listShiftTypes()', () => {
  it('returns formatted shift types ordered by displayOrder', async () => {
    const result = await shiftTypeService.listShiftTypes();

    expect(mockPrisma.shiftType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'st1', code: 'DAY', name: 'Day Shift' });
  });

  it('includes inactive when activeOnly=false', async () => {
    mockPrisma.shiftType.findMany.mockResolvedValue([
      baseShift,
      { ...baseShift, id: 'st2', isActive: false },
    ]);

    const result = await shiftTypeService.listShiftTypes(false);

    expect(mockPrisma.shiftType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(result).toHaveLength(2);
  });
});

// ── createShiftType() ─────────────────────────────────────────────────────────

describe('shiftTypeService.createShiftType()', () => {
  it('creates a new shift type and logs audit', async () => {
    mockPrisma.shiftType.findUnique.mockResolvedValue(null); // no duplicate

    const result = await shiftTypeService.createShiftType(
      {
        name: 'Day Shift',
        code: 'DAY',
        startTime: '06:00',
        endTime: '18:00',
        durationHours: 12,
        displayOrder: 1,
        isOvertime: false,
      },
      'user1',
    );

    expect(mockPrisma.shiftType.create).toHaveBeenCalledTimes(1);
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHIFT_TYPE_CREATED' }),
    );
    expect(result.id).toBe('st-new');
  });

  it('throws 409 if code already exists', async () => {
    mockPrisma.shiftType.findUnique.mockResolvedValue(baseShift); // duplicate

    await expect(
      shiftTypeService.createShiftType(
        { name: 'Day Shift', code: 'DAY', displayOrder: 1, isOvertime: false },
        'user1',
      ),
    ).rejects.toThrow(AppError);

    await expect(
      shiftTypeService.createShiftType(
        { name: 'Day Shift', code: 'DAY', displayOrder: 1, isOvertime: false },
        'user1',
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('upcases code before saving', async () => {
    mockPrisma.shiftType.findUnique.mockResolvedValue(null);

    await shiftTypeService.createShiftType(
      { name: 'Overnight', code: 'overnight', displayOrder: 5, isOvertime: false },
      'user1',
    );

    expect(mockPrisma.shiftType.findUnique).toHaveBeenCalledWith({ where: { code: 'OVERNIGHT' } });
    expect(mockPrisma.shiftType.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'OVERNIGHT' }) }),
    );
  });
});

// ── updateShiftType() ─────────────────────────────────────────────────────────

describe('shiftTypeService.updateShiftType()', () => {
  it('updates and logs audit', async () => {
    const result = await shiftTypeService.updateShiftType('st1', { name: 'Updated Shift' }, 'user1');

    expect(mockPrisma.shiftType.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'st1' } }),
    );
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHIFT_TYPE_UPDATED' }),
    );
    expect(result.name).toBe('Updated Shift');
  });

  it('throws NotFoundError if shift does not exist', async () => {
    mockPrisma.shiftType.findUnique.mockResolvedValue(null);

    await expect(
      shiftTypeService.updateShiftType('bad-id', { name: 'x' }, 'user1'),
    ).rejects.toThrow(NotFoundError);
  });
});

// ── deactivateShiftType() ─────────────────────────────────────────────────────

describe('shiftTypeService.deactivateShiftType()', () => {
  it('sets isActive=false and logs audit', async () => {
    mockPrisma.shiftType.update.mockResolvedValue({ ...baseShift, isActive: false });

    const result = await shiftTypeService.deactivateShiftType('st1', 'user1');

    expect(mockPrisma.shiftType.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHIFT_TYPE_DEACTIVATED' }),
    );
    expect(result.isActive).toBe(false);
  });

  it('throws NotFoundError if shift not found', async () => {
    mockPrisma.shiftType.findUnique.mockResolvedValue(null);

    await expect(shiftTypeService.deactivateShiftType('bad', 'user1')).rejects.toThrow(NotFoundError);
  });
});

// ── activateShiftType() ───────────────────────────────────────────────────────

describe('shiftTypeService.activateShiftType()', () => {
  it('sets isActive=true and logs audit', async () => {
    const inactive = { ...baseShift, isActive: false };
    mockPrisma.shiftType.findUnique.mockResolvedValue(inactive);
    mockPrisma.shiftType.update.mockResolvedValue({ ...baseShift, isActive: true });

    const result = await shiftTypeService.activateShiftType('st1', 'user1');

    expect(mockPrisma.shiftType.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: true } }),
    );
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHIFT_TYPE_ACTIVATED' }),
    );
    expect(result.isActive).toBe(true);
  });
});

// ── deleteShiftType() ─────────────────────────────────────────────────────────

describe('shiftTypeService.deleteShiftType()', () => {
  it('deletes when no deployments reference it', async () => {
    mockPrisma.deployment.count.mockResolvedValue(0);

    await shiftTypeService.deleteShiftType('st1', 'user1');

    expect(mockPrisma.shiftType.delete).toHaveBeenCalledWith({ where: { id: 'st1' } });
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHIFT_TYPE_DELETED' }),
    );
  });

  it('throws 409 when deployments reference it', async () => {
    mockPrisma.deployment.count.mockResolvedValue(5);

    await expect(shiftTypeService.deleteShiftType('st1', 'user1')).rejects.toThrow(AppError);
    await expect(shiftTypeService.deleteShiftType('st1', 'user1')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(mockPrisma.shiftType.delete).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when shift not found', async () => {
    mockPrisma.shiftType.findUnique.mockResolvedValue(null);

    await expect(shiftTypeService.deleteShiftType('bad', 'user1')).rejects.toThrow(NotFoundError);
  });
});

// ── reorderShiftTypes() ───────────────────────────────────────────────────────

describe('shiftTypeService.reorderShiftTypes()', () => {
  it('updates displayOrder for each id and returns list', async () => {
    const ids = ['st2', 'st1', 'st3'];
    mockPrisma.shiftType.update.mockResolvedValue(baseShift);

    await shiftTypeService.reorderShiftTypes(ids);

    expect(mockPrisma.shiftType.update).toHaveBeenCalledTimes(ids.length);
    expect(mockPrisma.shiftType.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'st2' }, data: { displayOrder: 1 } }),
    );
    expect(mockPrisma.shiftType.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'st1' }, data: { displayOrder: 2 } }),
    );
  });
});
