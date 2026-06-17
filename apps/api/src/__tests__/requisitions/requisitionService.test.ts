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
import { QueueService } from '../../jobs/QueueService';
import { requisitionService } from '../../services/requisitionService';

const mp = prisma as any;

const MOCK_USER = { id: 'user-1', name: 'Joshua', email: 'j@test.ug' };

const MOCK_REQ = {
  id:                   'req-1',
  requestedById:        'user-1',
  requestedByUser:      { name: 'Joshua' },
  date:                 new Date(),
  particulars:          'Purchase 20 guard uniforms',
  amount:               1700000,
  categories:           ['UNIFORM'],
  category:             'UNIFORM',
  description:          'Purchase 20 guard uniforms',
  quantity:             1,
  estimatedUnitCost:    1700000,
  estimatedTotal:       1700000,
  hrApprovedAt:         null,
  hrApprovedById:       null,
  hrApprovedByUser:     null,
  directorApprovedAt:   null,
  directorApprovedById: null,
  directorApprovedByUser: null,
  assignedToId:         null,
  assignedToUser:       null,
  progress:             null,
  remarks:              null,
  accountDetails:       null,
  accountName:          null,
  bankName:             null,
  status:               'PENDING',
  rejectedBy:           null,
  rejectedAt:           null,
  rejectionReason:      null,
  comments:             null,
  createdAt:            new Date(),
  updatedAt:            new Date(),
  categoryItems:        [],
  purchaseOrders:       [],
};

const MOCK_PO = {
  id: 'po-1', requisitionId: 'req-1', supplierId: null, supplier: null,
  quantity: 1, unitCost: 1700000, totalCost: 1700000, expectedDelivery: null,
  status: 'DRAFT', pdfPath: null, createdBy: 'user-1', createdAt: new Date(), updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.user.findMany.mockResolvedValue([{ email: 'director@test.ug' }]);
  mp.user.findUnique.mockResolvedValue(MOCK_USER);
  mp.requisition.create.mockResolvedValue(MOCK_REQ);
  mp.requisition.findUnique.mockResolvedValue(MOCK_REQ);
  mp.requisition.update.mockResolvedValue({
    ...MOCK_REQ,
    status:               'APPROVED',
    directorApprovedAt:   new Date(),
    directorApprovedById: 'dir-1',
    directorApprovedByUser: { name: 'Director' },
  });
  mp.requisition.findMany.mockResolvedValue([MOCK_REQ]);
  mp.requisition.count.mockResolvedValue(1);
  mp.purchaseOrder.create.mockResolvedValue(MOCK_PO);
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('requisitionService.create()', () => {
  it('status defaults to PENDING', async () => {
    await requisitionService.create(
      { particulars: 'Purchase 20 guard uniforms', amount: 1700000, categoryItems: [{ category: 'Uniform', quantity: 20 }] },
      'user-1',
    );
    const createData = mp.requisition.create.mock.calls[0][0].data;
    expect(createData.status).toBe('PENDING');
  });

  it('amount is stored directly', async () => {
    await requisitionService.create(
      { particulars: 'Purchase 20 guard uniforms', amount: 1700000, categoryItems: [{ category: 'Uniform', quantity: 20 }] },
      'user-1',
    );
    const createData = mp.requisition.create.mock.calls[0][0].data;
    expect(createData.amount).toBe(1700000);
  });

  it('notifies approvers on submission', async () => {
    await requisitionService.create(
      { particulars: 'Purchase 20 guard uniforms', amount: 1700000, categoryItems: [{ category: 'Uniform', quantity: 20 }] },
      'user-1',
    );
    expect(QueueService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'requisition-approval' }),
    );
  });
});

describe('requisitionService.hrApprove()', () => {
  it('stamps hrApprovedAt and hrApprovedById', async () => {
    await requisitionService.hrApprove('req-1', 'mgr-1');
    const updateData = mp.requisition.update.mock.calls[0][0].data;
    expect(updateData.hrApprovedAt).toBeInstanceOf(Date);
    expect(updateData.hrApprovedById).toBe('mgr-1');
  });

  it('throws if already HR approved', async () => {
    mp.requisition.findUnique.mockResolvedValue({ ...MOCK_REQ, hrApprovedAt: new Date() });
    await expect(requisitionService.hrApprove('req-1', 'mgr-1')).rejects.toThrow('Already HR approved');
  });
});

describe('requisitionService.directorApprove()', () => {
  it('requires HR approval first', async () => {
    await expect(requisitionService.directorApprove('req-1', 'dir-1')).rejects.toThrow('HR must approve');
  });

  it('sets APPROVED status when HR has approved', async () => {
    mp.requisition.findUnique.mockResolvedValue({ ...MOCK_REQ, hrApprovedAt: new Date() });
    await requisitionService.directorApprove('req-1', 'dir-1');
    const updateData = mp.requisition.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('APPROVED');
    expect(updateData.directorApprovedById).toBe('dir-1');
  });
});

describe('requisitionService.approve() — legacy REJECT', () => {
  it('REJECT action sets correct fields', async () => {
    mp.requisition.update.mockResolvedValue({
      ...MOCK_REQ,
      status:          'REJECTED',
      rejectedBy:      'dir-1',
      rejectedAt:      new Date(),
      rejectionReason: 'Budget exceeded',
    });

    await requisitionService.approve(
      'req-1',
      { action: 'REJECT', rejectionReason: 'Budget exceeded' },
      'dir-1',
    );
    const updateData = mp.requisition.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('REJECTED');
    expect(updateData.rejectionReason).toBe('Budget exceeded');
  });
});

describe('requisitionService.createPurchaseOrder()', () => {
  it('throws if requisition is not APPROVED', async () => {
    mp.requisition.findUnique.mockResolvedValue({ ...MOCK_REQ, status: 'PENDING' });
    await expect(
      requisitionService.createPurchaseOrder(
        { requisitionId: 'req-1', quantity: 1, unitCost: 1700000 },
        'admin-1',
      ),
    ).rejects.toThrow('must be APPROVED');
  });

  it('creates PO when requisition is APPROVED', async () => {
    mp.requisition.findUnique.mockResolvedValue({ ...MOCK_REQ, status: 'APPROVED' });
    const po = await requisitionService.createPurchaseOrder(
      { requisitionId: 'req-1', quantity: 1, unitCost: 1700000 },
      'admin-1',
    );
    expect(po.totalCost).toBe(1700000);
    expect(mp.purchaseOrder.create).toHaveBeenCalledTimes(1);
  });
});
