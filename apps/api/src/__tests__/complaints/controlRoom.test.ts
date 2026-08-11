import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ROLES, INTERNAL_ROLES, COMPLAINT_RECEIVER_ROLES, FINANCE_ROLES,
  GUARD_WRITE_ROLES, DEPLOYMENT_ROLES, DEPLOYMENT_VIEW_ROLES, HR_ROLES,
  UpdateComplaintStatusSchema,
} from '@stap/shared';

vi.mock('../../db/prisma', () => ({
  default: {
    clientComplaint: { findUnique: vi.fn(), update: vi.fn() },
    user:            { findUnique: vi.fn() },
    auditLog:        { create: vi.fn() },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: { send: vi.fn().mockResolvedValue(undefined), sendToRoles: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { complaintService } from '../../services/complaintService';

const mp = prisma as any;

const COMPLAINT_ID = 'complaint-1';
const CR_ID        = 'user-control-room';
const ASSIGNEE_ID  = 'user-assignee';

const assignedComplaint = {
  id: COMPLAINT_ID, clientId: 'client-1', subject: 'Gate unmanned',
  category: 'OTHER', description: 'No guard at the gate', severity: 'HIGH',
  status: 'UNDER_INVESTIGATION', receivedById: CR_ID, assignedToId: ASSIGNEE_ID,
  assignedAt: new Date(), resolvedAt: null, resolvedBy: null, resolution: null,
  actionTaken: null, actionTakenAt: null, actionTakenById: null,
  createdAt: new Date(), updatedAt: new Date(),
};

const updatedRow = (over: Record<string, any> = {}) => ({
  ...assignedComplaint,
  client:            { id: 'client-1', clientName: 'Test Corp', systemId: null, email: null },
  site:              null,
  receivedByUser:    { id: CR_ID, name: 'Betty Nakiwala' },
  assignedToUser:    { id: ASSIGNEE_ID, name: 'Emmanuel Okello', role: 'FIELD_SUPERVISOR', phone: '0700000000' },
  actionTakenByUser: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mp.clientComplaint.findUnique.mockResolvedValue(assignedComplaint);
  mp.clientComplaint.update.mockResolvedValue(updatedRow());
  mp.auditLog.create.mockResolvedValue({});
});

// ── The access matrix, asserted as data ────────────────────────────────────────

describe('CONTROL_ROOM access rights', () => {
  it('is an internal staff role', () => {
    expect(INTERNAL_ROLES).toContain(ROLES.CONTROL_ROOM);
  });

  it('is the only role that can receive complaints', () => {
    expect(COMPLAINT_RECEIVER_ROLES).toEqual([ROLES.CONTROL_ROOM]);
  });

  it('has no finance or payroll access', () => {
    expect(FINANCE_ROLES).not.toContain(ROLES.CONTROL_ROOM);
  });

  it('cannot write to guard records', () => {
    expect(GUARD_WRITE_ROLES).not.toContain(ROLES.CONTROL_ROOM);
  });

  it('cannot write deployments but can view them', () => {
    expect(DEPLOYMENT_ROLES).not.toContain(ROLES.CONTROL_ROOM);
    expect(DEPLOYMENT_VIEW_ROLES).toContain(ROLES.CONTROL_ROOM);
  });

  it('has no HR access', () => {
    expect(HR_ROLES).not.toContain(ROLES.CONTROL_ROOM);
  });
});

// ── Sole receiver ──────────────────────────────────────────────────────────────

describe('assignComplaint() — Control Room is the sole receiver', () => {
  const setUsers = (receiverRole: string) => {
    mp.clientComplaint.findUnique.mockResolvedValue({ ...assignedComplaint, receivedById: null, assignedToId: null });
    mp.user.findUnique
      .mockResolvedValueOnce({ id: CR_ID, name: 'Betty Nakiwala', role: receiverRole })
      .mockResolvedValueOnce({ id: ASSIGNEE_ID, name: 'Emmanuel Okello', role: 'FIELD_SUPERVISOR', phone: '0700000000' });
  };

  it('accepts a Control Room receiver', async () => {
    setUsers(ROLES.CONTROL_ROOM);

    await complaintService.assignComplaint(
      COMPLAINT_ID, { receivedById: CR_ID, assignedToId: ASSIGNEE_ID }, CR_ID,
    );

    expect(mp.clientComplaint.update.mock.calls[0][0].data.receivedById).toBe(CR_ID);
  });

  it.each(['DIRECTOR', 'ASSISTANT_MANAGER', 'OPERATIONS_SUPERVISOR', 'FIELD_SUPERVISOR', 'ADMINISTRATOR'])(
    'refuses a %s receiver, however senior',
    async (role) => {
      setUsers(role);

      await expect(
        complaintService.assignComplaint(COMPLAINT_ID, { receivedById: CR_ID, assignedToId: ASSIGNEE_ID }, CR_ID),
      ).rejects.toThrow(/Only Control Room staff can receive complaints/);

      expect(mp.clientComplaint.update).not.toHaveBeenCalled();
    },
  );

  it('names the offending role in the error', async () => {
    setUsers('FIELD_SUPERVISOR');

    await expect(
      complaintService.assignComplaint(COMPLAINT_ID, { receivedById: CR_ID, assignedToId: ASSIGNEE_ID }, CR_ID),
    ).rejects.toThrow(/"Betty Nakiwala" is a Field Supervisor/);
  });
});

// ── Action taken before resolving ──────────────────────────────────────────────

describe('updateStatus() — an action note is required to resolve', () => {
  it('refuses RESOLVED with no action taken', async () => {
    mp.user.findUnique.mockResolvedValue({ role: ROLES.CONTROL_ROOM });

    await expect(
      complaintService.updateStatus(COMPLAINT_ID, { status: 'RESOLVED' } as any, CR_ID),
    ).rejects.toThrow(/must describe the action taken/);

    expect(mp.clientComplaint.update).not.toHaveBeenCalled();
  });

  it('refuses RESOLVED with a token action note', async () => {
    mp.user.findUnique.mockResolvedValue({ role: ROLES.CONTROL_ROOM });

    await expect(
      complaintService.updateStatus(COMPLAINT_ID, { status: 'RESOLVED', actionTaken: '  ok ' } as any, CR_ID),
    ).rejects.toThrow(/must describe the action taken/);
  });

  it('records the action, who wrote it and when, on resolve', async () => {
    mp.user.findUnique.mockResolvedValue({ role: ROLES.CONTROL_ROOM });
    const note = 'Supervisor dispatched to site; client notified; issue closed.';

    await complaintService.updateStatus(
      COMPLAINT_ID, { status: 'RESOLVED', actionTaken: note } as any, CR_ID,
    );

    const data = mp.clientComplaint.update.mock.calls[0][0].data;
    expect(data.status).toBe('RESOLVED');
    expect(data.actionTaken).toBe(note);
    expect(data.actionTakenById).toBe(CR_ID);
    expect(data.actionTakenAt).toBeInstanceOf(Date);
    expect(data.resolvedBy).toBe(CR_ID);
  });

  it('does not require an action note to move to UNDER_INVESTIGATION', async () => {
    mp.user.findUnique.mockResolvedValue({ role: ROLES.CONTROL_ROOM });

    await complaintService.updateStatus(
      COMPLAINT_ID, { status: 'UNDER_INVESTIGATION' } as any, CR_ID,
    );

    const data = mp.clientComplaint.update.mock.calls[0][0].data;
    expect(data.status).toBe('UNDER_INVESTIGATION');
    expect(data).not.toHaveProperty('actionTaken');
  });

  it('lets Control Room update a complaint assigned to somebody else', async () => {
    mp.user.findUnique.mockResolvedValue({ role: ROLES.CONTROL_ROOM });

    await complaintService.updateStatus(
      COMPLAINT_ID, { status: 'RESOLVED', actionTaken: 'Closed after client confirmed.' } as any, CR_ID,
    );

    expect(mp.clientComplaint.update).toHaveBeenCalled();
  });

  it('still refuses an unrelated role', async () => {
    mp.user.findUnique.mockResolvedValue({ role: 'TRAINER' });

    await expect(
      complaintService.updateStatus(COMPLAINT_ID, { status: 'UNDER_INVESTIGATION' } as any, 'someone-else'),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── The same rule at the schema boundary ───────────────────────────────────────

describe('UpdateComplaintStatusSchema', () => {
  it('rejects RESOLVED without an action note', () => {
    const r = UpdateComplaintStatusSchema.safeParse({ status: 'RESOLVED' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.flatten().fieldErrors.actionTaken?.[0]).toMatch(/action taken/);
    }
  });

  it('accepts RESOLVED with one', () => {
    expect(
      UpdateComplaintStatusSchema.safeParse({ status: 'RESOLVED', actionTaken: 'Dispatched a supervisor.' }).success,
    ).toBe(true);
  });

  it('accepts UNDER_INVESTIGATION on its own', () => {
    expect(UpdateComplaintStatusSchema.safeParse({ status: 'UNDER_INVESTIGATION' }).success).toBe(true);
  });
});
