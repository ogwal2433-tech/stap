import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    requisition:   { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    purchaseOrder: { create: vi.fn() },
    user:          { findMany: vi.fn() },
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
const INCLUDE_RESULT = { raisedByUser: MOCK_USER, purchaseOrders: [] };

const MOCK_REQ = {
  id: 'req-1', raisedBy: 'user-1',
  category: 'UNIFORM', description: 'Purchase 20 guard uniforms',
  quantity: 20, estimatedUnitCost: 85000, estimatedTotal: 1700000,
  urgency: 'HIGH', justification: 'New recruits start May 2026',
  status: 'SUBMITTED', approvedBy: null, approvedAt: null,
  rejectedBy: null, rejectedAt: null, rejectionReason: null, comments: null,
  createdAt: new Date(), updatedAt: new Date(),
  ...INCLUDE_RESULT,
};

const MOCK_PO = {
  id: 'po-1', requisitionId: 'req-1', supplierId: null, supplier: null,
  quantity: 20, unitCost: 85000, totalCost: 1700000, expectedDelivery: null,
  status: 'DRAFT', pdfPath: null, createdBy: 'user-1', createdAt: new Date(), updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.user.findMany.mockResolvedValue([{ email: 'director@test.ug' }]);
  mp.requisition.create.mockResolvedValue(MOCK_REQ);
  mp.requisition.findUnique.mockResolvedValue(MOCK_REQ);
  mp.requisition.update.mockResolvedValue({ ...MOCK_REQ, status: 'APPROVED', approvedBy: 'dir-1', approvedAt: new Date() });
  mp.requisition.findMany.mockResolvedValue([MOCK_REQ]);
  mp.requisition.count.mockResolvedValue(1);
  mp.purchaseOrder.create.mockResolvedValue(MOCK_PO);
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('requisitionService.create()', () => {
  it('status defaults to SUBMITTED (skips DRAFT)', async () => {
    const req = await requisitionService.create(
      { category: 'UNIFORM', description: 'Purchase 20 guard uniforms', quantity: 20, estimatedUnitCost: 85000, urgency: 'HIGH' },
      'user-1',
    );
    const createData = mp.requisition.create.mock.calls[0][0].data;
    expect(createData.status).toBe('SUBMITTED');
  });

  it('estimatedTotal = quantity * estimatedUnitCost', async () => {
    await requisitionService.create(
      { category: 'UNIFORM', description: 'Purchase 20 guard uniforms', quantity: 20, estimatedUnitCost: 85000, urgency: 'HIGH' },
      'user-1',
    );
    const createData = mp.requisition.create.mock.calls[0][0].data;
    expect(createData.estimatedTotal).toBe(1700000); // 20 * 85000
  });

  it('notifies approvers on submission', async () => {
    await requisitionService.create(
      { category: 'UNIFORM', description: 'Purchase 20 guard uniforms', quantity: 20, estimatedUnitCost: 85000, urgency: 'HIGH' },
      'user-1',
    );
    expect(QueueService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'requisition-approval' }),
    );
  });
});

describe('requisitionService.approve()', () => {
  it('APPROVE action sets correct fields', async () => {
    await requisitionService.approve('req-1', { action: 'APPROVE' }, 'dir-1');
    const updateData = mp.requisition.update.mock.calls[0][0].data;
    expect(updateData.status).toBe('APPROVED');
    expect(updateData.approvedBy).toBe('dir-1');
    expect(updateData.approvedAt).toBeInstanceOf(Date);
  });

  it('REJECT action requires rejectionReason and sets correct fields', async () => {
    mp.requisition.update.mockResolvedValue({
      ...MOCK_REQ, status: 'REJECTED', rejectedBy: 'dir-1', rejectedAt: new Date(),
      rejectionReason: 'Budget exceeded', ...INCLUDE_RESULT,
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

  it('notifies requester of decision', async () => {
    mp.requisition.findUnique.mockResolvedValue({
      ...MOCK_REQ,
      raisedByUser: { ...MOCK_USER, email: 'j@test.ug', name: 'Joshua' },
      purchaseOrders: [],
    });

    await requisitionService.approve('req-1', { action: 'APPROVE' }, 'dir-1');
    expect(QueueService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'j@test.ug' }),
    );
  });
});

describe('requisitionService.createPurchaseOrder()', () => {
  it('throws if requisition is not APPROVED', async () => {
    mp.requisition.findUnique.mockResolvedValue({ ...MOCK_REQ, status: 'SUBMITTED' });
    await expect(
      requisitionService.createPurchaseOrder(
        { requisitionId: 'req-1', quantity: 20, unitCost: 85000 },
        'admin-1',
      ),
    ).rejects.toThrow('must be APPROVED');
  });

  it('creates PO when requisition is APPROVED', async () => {
    mp.requisition.findUnique.mockResolvedValue({ ...MOCK_REQ, status: 'APPROVED' });
    const po = await requisitionService.createPurchaseOrder(
      { requisitionId: 'req-1', quantity: 20, unitCost: 85000 },
      'admin-1',
    );
    expect(po.totalCost).toBe(1700000);
    expect(mp.purchaseOrder.create).toHaveBeenCalledTimes(1);
  });
});
