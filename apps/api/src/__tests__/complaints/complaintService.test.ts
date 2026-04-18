import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    client:          { findUnique: vi.fn() },
    clientComplaint: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: {
    sendEmail: vi.fn().mockResolvedValue(undefined),
    logAudit:  vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: {
    send:        vi.fn().mockResolvedValue(undefined),
    sendToRoles: vi.fn().mockResolvedValue(undefined),
  },
}));

import prisma from '../../db/prisma';
import { QueueService } from '../../jobs/QueueService';
import { notificationService } from '../../services/notificationService';
import { complaintService } from '../../services/complaintService';

const mp  = prisma as any;
const mq  = QueueService as any;
const mns = notificationService as any;

const MOCK_CLIENT = {
  id:           'client-1',
  clientName:   'KCCA',
  email:        'kcca@test.ug',
  contactPhone: '+256700000001',
};

const MOCK_COMPLAINT = {
  id:          'comp-1',
  clientId:    'client-1',
  siteId:      null,
  category:    'GUARD_CONDUCT',
  description: 'Guard was sleeping on duty during the night shift.',
  severity:    'HIGH',
  status:      'OPEN',
  assignedTo:  null,
  resolution:  null,
  resolvedAt:  null,
  createdAt:   new Date('2026-04-10T08:00:00Z'),
  updatedAt:   new Date('2026-04-10T08:00:00Z'),
  client:      { id: 'client-1', clientName: 'KCCA', email: 'kcca@test.ug' },
  site:        null,
  assignee:    null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.client.findUnique.mockResolvedValue(MOCK_CLIENT);
  mp.clientComplaint.create.mockResolvedValue(MOCK_COMPLAINT);
  mp.clientComplaint.findUnique.mockResolvedValue(MOCK_COMPLAINT);
  mp.clientComplaint.findMany.mockResolvedValue([MOCK_COMPLAINT]);
  mp.clientComplaint.count.mockResolvedValue(1);
  mp.clientComplaint.update.mockResolvedValue(MOCK_COMPLAINT);
});

// ── create() ───────────────────────────────────────────────────────────────────

describe('complaintService.create()', () => {
  it('creates a complaint and notifies DIRECTOR + OPERATIONS_SUPERVISOR', async () => {
    const result = await complaintService.create(
      {
        clientId:    'client-1',
        category:    'GUARD_CONDUCT',
        description: 'Guard was sleeping on duty during the night shift.',
        severity:    'HIGH',
      },
      'user-1',
    );

    expect(mp.clientComplaint.create).toHaveBeenCalledOnce();
    expect(mns.sendToRoles).toHaveBeenCalledWith(
      expect.arrayContaining(['DIRECTOR', 'OPERATIONS_SUPERVISOR']),
      expect.objectContaining({ type: 'COMPLAINT_ASSIGNED' }),
    );
    expect(result.id).toBe('comp-1');
    expect(result.status).toBe('OPEN');
  });

  it('throws NotFoundError if client does not exist', async () => {
    mp.client.findUnique.mockResolvedValue(null);

    await expect(
      complaintService.create(
        { clientId: 'ghost', category: 'OTHER', description: 'test', severity: 'LOW' },
        'user-1',
      ),
    ).rejects.toThrow('Client not found');
  });

  it('logs an audit event on creation', async () => {
    await complaintService.create(
      { clientId: 'client-1', category: 'BILLING_DISPUTE', description: 'Incorrect invoice amount.', severity: 'MEDIUM' },
      'user-1',
    );

    expect(mq.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'COMPLAINT_CREATED', entity: 'ClientComplaint' }),
    );
  });
});

// ── update() ───────────────────────────────────────────────────────────────────

describe('complaintService.update()', () => {
  it('throws if complaint does not exist', async () => {
    mp.clientComplaint.findUnique.mockResolvedValue(null);

    await expect(
      complaintService.update('ghost', { status: 'IN_PROGRESS' }, 'user-1'),
    ).rejects.toThrow('Complaint not found');
  });

  it('requires resolution notes when resolving', async () => {
    await expect(
      complaintService.update('comp-1', { status: 'RESOLVED' }, 'user-1'),
    ).rejects.toThrow('Resolution notes required');
  });

  it('sets resolvedAt and emails the client when resolving', async () => {
    const resolved = {
      ...MOCK_COMPLAINT,
      status:     'RESOLVED',
      resolution: 'Guard reprimanded and reassigned.',
      resolvedAt: new Date(),
    };
    mp.clientComplaint.update.mockResolvedValue(resolved);

    await complaintService.update(
      'comp-1',
      { status: 'RESOLVED', resolution: 'Guard reprimanded and reassigned.' },
      'user-1',
    );

    expect(mp.clientComplaint.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resolvedAt: expect.any(Date) }),
      }),
    );
    expect(mq.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to:       MOCK_CLIENT.email,
        template: 'complaint-resolved',
      }),
    );
  });

  it('notifies the new assignee when assignedTo changes', async () => {
    await complaintService.update(
      'comp-1',
      { assignedTo: 'user-99' },
      'user-1',
    );

    expect(mns.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-99', type: 'COMPLAINT_ASSIGNED' }),
    );
  });

  it('does NOT notify assignee if assignedTo is unchanged', async () => {
    const sameAssignee = { ...MOCK_COMPLAINT, assignedTo: 'user-99' };
    mp.clientComplaint.findUnique.mockResolvedValue(sameAssignee);

    await complaintService.update(
      'comp-1',
      { assignedTo: 'user-99' },
      'user-1',
    );

    expect(mns.send).not.toHaveBeenCalled();
  });
});

// ── list() ────────────────────────────────────────────────────────────────────

describe('complaintService.list()', () => {
  it('returns paginated results with hasNext and hasPrev', async () => {
    mp.clientComplaint.count.mockResolvedValue(30);
    mp.clientComplaint.findMany.mockResolvedValue([MOCK_COMPLAINT]);

    const result = await complaintService.list({ page: 2, limit: 10 });

    expect(result.pagination.total).toBe(30);
    expect(result.pagination.hasNext).toBe(true);
    expect(result.pagination.hasPrev).toBe(true);
    expect(result.data[0].daysOpen).toBeGreaterThanOrEqual(0);
  });

  it('applies status filter when provided', async () => {
    await complaintService.list({ status: 'OPEN', page: 1, limit: 20 });

    expect(mp.clientComplaint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'OPEN' }) }),
    );
  });
});

// ── getDashboard() ────────────────────────────────────────────────────────────

describe('complaintService.getDashboard()', () => {
  it('returns all required dashboard fields', async () => {
    // open complaints
    mp.clientComplaint.findMany.mockImplementation(({ where }: any) => {
      if (where?.status?.in) return Promise.resolve([MOCK_COMPLAINT]);                 // allOpen
      if (where?.status === 'RESOLVED') return Promise.resolve([]);                    // allResolved
      return Promise.resolve([MOCK_COMPLAINT]);                                        // recentComplaints
    });

    const dash = await complaintService.getDashboard();

    expect(dash).toMatchObject({
      openByCategory:    expect.any(Array),
      avgResolutionDays: expect.any(Number),
      totalOpen:         expect.any(Number),
      totalResolved:     expect.any(Number),
      openByClient:      expect.any(Array),
      monthlyTrend:      expect.arrayContaining([
        expect.objectContaining({ month: expect.any(String), opened: expect.any(Number), resolved: expect.any(Number) }),
      ]),
    });
  });
});
