import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    requisition:   { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    purchaseOrder: { create: vi.fn() },
    user:          { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: {
    logAudit:  vi.fn().mockResolvedValue(undefined),
    sendEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

import prisma from '../../db/prisma';
import { requisitionService } from '../../services/requisitionService';
import { CreateRequisitionSchema } from '@security360/shared';

const mp = prisma as any;

function makeReq(overrides: Record<string, any> = {}) {
  return {
    id:                    'req-1',
    requestedById:         'user-1',
    requestedByUser:       { name: 'Joshua' },
    date:                  new Date(),
    particulars:           'Monthly supplies',
    amount:                850000,
    category:              'Fuel',
    description:           'Monthly supplies',
    quantity:              1,
    estimatedUnitCost:     850000,
    estimatedTotal:        850000,
    hrApprovedAt:          null,
    hrApprovedById:        null,
    hrApprovedByUser:      null,
    directorApprovedAt:    null,
    directorApprovedById:  null,
    directorApprovedByUser: null,
    assignedToId:          null,
    assignedToUser:        null,
    progress:              null,
    remarks:               null,
    accountDetails:        null,
    accountName:           null,
    bankName:              null,
    status:                'PENDING',
    rejectedBy:            null,
    rejectedAt:            null,
    rejectionReason:       null,
    comments:              null,
    categoryItems:         [],
    purchaseOrders:        [],
    createdAt:             new Date(),
    updatedAt:             new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mp.user.findMany.mockResolvedValue([{ email: 'director@test.ug' }]);
  mp.user.findUnique.mockResolvedValue({ id: 'user-1', name: 'Joshua' });
  mp.requisition.findMany.mockResolvedValue([]);
  mp.requisition.count.mockResolvedValue(0);
});

// ── Schema validation ──────────────────────────────────────────────────────────

describe('CreateRequisitionSchema — categoryItems validation', () => {
  it('rejects empty categoryItems array', () => {
    const result = CreateRequisitionSchema.safeParse({
      particulars: 'Some supplies', amount: 100000, categoryItems: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/at least one category/i);
    }
  });

  it('rejects quantity of 0', () => {
    const result = CreateRequisitionSchema.safeParse({
      particulars: 'Some supplies', amount: 100000,
      categoryItems: [{ category: 'Fuel', quantity: 0 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.match(/at least 1/i))).toBe(true);
    }
  });

  it('rejects negative quantity', () => {
    const result = CreateRequisitionSchema.safeParse({
      particulars: 'Some supplies', amount: 100000,
      categoryItems: [{ category: 'Fuel', quantity: -5 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate categories in the same request', () => {
    const result = CreateRequisitionSchema.safeParse({
      particulars: 'Duplicate test', amount: 100000,
      categoryItems: [
        { category: 'Fuel', quantity: 50 },
        { category: 'Fuel', quantity: 30 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/only be added once/i);
    }
  });

  it('accepts valid single category', () => {
    const result = CreateRequisitionSchema.safeParse({
      particulars: 'Some supplies', amount: 100000,
      categoryItems: [{ category: 'Fuel', quantity: 200, unit: 'litres' }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts multiple valid categories with different names', () => {
    const result = CreateRequisitionSchema.safeParse({
      particulars: 'Office and vehicle', amount: 850000,
      categoryItems: [
        { category: 'Fuel',       quantity: 200, unit: 'litres' },
        { category: 'Stationery', quantity: 15,  unit: 'boxes' },
        { category: 'Maintenance', quantity: 1 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('unit is optional — omitting it is valid', () => {
    const result = CreateRequisitionSchema.safeParse({
      particulars: 'Some supplies', amount: 100000,
      categoryItems: [{ category: 'Maintenance', quantity: 1 }],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categoryItems[0].unit).toBeUndefined();
    }
  });
});

// ── Service: create() ─────────────────────────────────────────────────────────

describe('requisitionService.create() — categoryItems', () => {
  it('creates one categoryItem row for a single category', async () => {
    const mockReq = makeReq({
      categoryItems: [{ id: 'ci-1', category: 'Fuel', quantity: 200, unit: 'litres', createdAt: new Date() }],
    });
    mp.requisition.create.mockResolvedValue(mockReq);

    await requisitionService.create(
      { particulars: 'Monthly supplies', amount: 850000, categoryItems: [{ category: 'Fuel', quantity: 200, unit: 'litres' }] },
      'user-1',
    );

    const createCall = mp.requisition.create.mock.calls[0][0];
    expect(createCall.data.categoryItems.create).toHaveLength(1);
    expect(createCall.data.categoryItems.create[0]).toEqual({
      category: 'Fuel', quantity: 200, unit: 'litres',
    });
  });

  it('creates correct number of categoryItem rows for multiple categories', async () => {
    const mockReq = makeReq({
      categoryItems: [
        { id: 'ci-1', category: 'Fuel',       quantity: 200, unit: 'litres',  createdAt: new Date() },
        { id: 'ci-2', category: 'Stationery', quantity: 15,  unit: 'boxes',   createdAt: new Date() },
        { id: 'ci-3', category: 'Maintenance', quantity: 1,  unit: null,      createdAt: new Date() },
      ],
    });
    mp.requisition.create.mockResolvedValue(mockReq);

    await requisitionService.create(
      {
        particulars: 'Office and vehicle',
        amount: 850000,
        categoryItems: [
          { category: 'Fuel',        quantity: 200, unit: 'litres' },
          { category: 'Stationery',  quantity: 15,  unit: 'boxes' },
          { category: 'Maintenance', quantity: 1 },
        ],
      },
      'user-1',
    );

    const createCall = mp.requisition.create.mock.calls[0][0];
    expect(createCall.data.categoryItems.create).toHaveLength(3);
    expect(createCall.data.categoryItems.create[0]).toMatchObject({ category: 'Fuel',       quantity: 200 });
    expect(createCall.data.categoryItems.create[1]).toMatchObject({ category: 'Stationery', quantity: 15 });
    expect(createCall.data.categoryItems.create[2]).toMatchObject({ category: 'Maintenance', quantity: 1, unit: null });
  });

  it('unit is null when not provided in create payload', async () => {
    const mockReq = makeReq({
      categoryItems: [{ id: 'ci-1', category: 'Maintenance', quantity: 1, unit: null, createdAt: new Date() }],
    });
    mp.requisition.create.mockResolvedValue(mockReq);

    await requisitionService.create(
      { particulars: 'Maintenance work', amount: 200000, categoryItems: [{ category: 'Maintenance', quantity: 1 }] },
      'user-1',
    );

    const createCall = mp.requisition.create.mock.calls[0][0];
    expect(createCall.data.categoryItems.create[0].unit).toBeNull();
  });
});

// ── Service: fmtRequisition response shape ────────────────────────────────────

describe('fmtRequisition — categoryItems in response', () => {
  it('returns categoryItems with id, category, quantity, unit', async () => {
    const mockReq = makeReq({
      categoryItems: [
        { id: 'ci-1', category: 'Fuel',       quantity: 200, unit: 'litres',  createdAt: new Date() },
        { id: 'ci-2', category: 'Stationery', quantity: 15,  unit: null,      createdAt: new Date() },
      ],
    });
    mp.requisition.create.mockResolvedValue(mockReq);

    const result = await requisitionService.create(
      {
        particulars: 'Supplies',
        amount: 850000,
        categoryItems: [
          { category: 'Fuel',       quantity: 200, unit: 'litres' },
          { category: 'Stationery', quantity: 15 },
        ],
      },
      'user-1',
    );

    expect(result.categoryItems).toHaveLength(2);
    expect(result.categoryItems[0]).toEqual({ id: 'ci-1', category: 'Fuel', quantity: 200, unit: 'litres' });
    expect(result.categoryItems[1]).toEqual({ id: 'ci-2', category: 'Stationery', quantity: 15, unit: null });
  });

  it('returns empty categoryItems array when no items exist', async () => {
    mp.requisition.create.mockResolvedValue(makeReq({ categoryItems: [] }));

    const result = await requisitionService.create(
      { particulars: 'Test', amount: 100000, categoryItems: [{ category: 'Other', quantity: 1 }] },
      'user-1',
    );

    expect(result.categoryItems).toEqual([]);
  });
});
