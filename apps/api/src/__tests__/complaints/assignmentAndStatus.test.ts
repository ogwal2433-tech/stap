import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    clientComplaint: {
      findUnique: vi.fn(),
      update:     vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: {
    send:        vi.fn().mockResolvedValue(undefined),
    sendToRoles: vi.fn().mockResolvedValue(undefined),
  },
}));

import prisma from '../../db/prisma';
import { notificationService } from '../../services/notificationService';
import { complaintService } from '../../services/complaintService';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const COMPLAINT_ID  = 'complaint-1';
const RECEIVER_ID   = 'user-receiver';
const ASSIGNEE_ID   = 'user-assignee';
const DIRECTOR_ID   = 'user-director';
const OTHER_USER_ID = 'user-other';

const baseComplaint = {
  id:           COMPLAINT_ID,
  clientId:     'client-1',
  subject:      'Test complaint',
  category:     'OTHER',
  description:  'Something went wrong',
  severity:     'LOW',
  status:       'OPEN',
  receivedById: null,
  assignedToId: null,
  assignedAt:   null,
  resolvedAt:   null,
  resolvedBy:   null,
  resolution:   null,
  createdAt:    new Date('2026-01-01'),
  updatedAt:    new Date('2026-01-01'),
};

const updatedWithAssignment = {
  ...baseComplaint,
  receivedById: RECEIVER_ID,
  assignedToId: ASSIGNEE_ID,
  assignedAt:   new Date(),
  client:       { id: 'client-1', clientName: 'Test Corp', systemId: null, email: 'client@test.com' },
  site:         null,
  receivedByUser: { id: RECEIVER_ID, name: 'Jane Receiver' },
  assignedToUser: { id: ASSIGNEE_ID, name: 'John Assignee', role: 'OPERATIONS_SUPERVISOR', phone: '0700000000' },
};

// ── assignComplaint() ──────────────────────────────────────────────────────────

describe('assignComplaint()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets receivedById, assignedToId, and assignedAt', async () => {
    (prisma.clientComplaint.findUnique as any).mockResolvedValue(baseComplaint);
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({ id: RECEIVER_ID, name: 'Jane Receiver', role: 'CONTROL_ROOM' })
      .mockResolvedValueOnce({ id: ASSIGNEE_ID, name: 'John Assignee', role: 'OPERATIONS_SUPERVISOR', phone: '0700000000' });
    (prisma.clientComplaint.update as any).mockResolvedValue(updatedWithAssignment);
    (prisma.auditLog.create as any).mockResolvedValue({});

    const result = await complaintService.assignComplaint(
      COMPLAINT_ID,
      { receivedById: RECEIVER_ID, assignedToId: ASSIGNEE_ID },
      DIRECTOR_ID,
    );

    const updateCall = (prisma.clientComplaint.update as any).mock.calls[0][0];
    expect(updateCall.data.receivedById).toBe(RECEIVER_ID);
    expect(updateCall.data.assignedToId).toBe(ASSIGNEE_ID);
    expect(updateCall.data.assignedAt).toBeInstanceOf(Date);
    expect(result.assignedTo?.name).toBe('John Assignee');
  });

  it('throws 404 if receivedById user does not exist', async () => {
    (prisma.clientComplaint.findUnique as any).mockResolvedValue(baseComplaint);
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: ASSIGNEE_ID, name: 'John', role: 'OPERATIONS_SUPERVISOR', phone: null });

    await expect(
      complaintService.assignComplaint(COMPLAINT_ID, { receivedById: 'bad-id', assignedToId: ASSIGNEE_ID }, DIRECTOR_ID),
    ).rejects.toMatchObject({ message: 'Receiving staff member not found' });
  });

  it('throws 404 if assignedToId user does not exist', async () => {
    (prisma.clientComplaint.findUnique as any).mockResolvedValue(baseComplaint);
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({ id: RECEIVER_ID, name: 'Jane', role: 'CONTROL_ROOM' })
      .mockResolvedValueOnce(null);

    await expect(
      complaintService.assignComplaint(COMPLAINT_ID, { receivedById: RECEIVER_ID, assignedToId: 'bad-id' }, DIRECTOR_ID),
    ).rejects.toMatchObject({ message: 'Assigned staff member not found' });
  });

  it('sends a notification to the assigned user', async () => {
    (prisma.clientComplaint.findUnique as any).mockResolvedValue(baseComplaint);
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({ id: RECEIVER_ID, name: 'Jane', role: 'CONTROL_ROOM' })
      .mockResolvedValueOnce({ id: ASSIGNEE_ID, name: 'John', role: 'OPERATIONS_SUPERVISOR', phone: null });
    (prisma.clientComplaint.update as any).mockResolvedValue(updatedWithAssignment);
    (prisma.auditLog.create as any).mockResolvedValue({});

    await complaintService.assignComplaint(
      COMPLAINT_ID,
      { receivedById: RECEIVER_ID, assignedToId: ASSIGNEE_ID },
      DIRECTOR_ID,
    );

    expect(notificationService.send).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ASSIGNEE_ID }),
    );
  });

  it('creates an audit log entry', async () => {
    (prisma.clientComplaint.findUnique as any).mockResolvedValue(baseComplaint);
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({ id: RECEIVER_ID, name: 'Jane', role: 'CONTROL_ROOM' })
      .mockResolvedValueOnce({ id: ASSIGNEE_ID, name: 'John', role: 'OPERATIONS_SUPERVISOR', phone: null });
    (prisma.clientComplaint.update as any).mockResolvedValue(updatedWithAssignment);
    (prisma.auditLog.create as any).mockResolvedValue({});

    await complaintService.assignComplaint(
      COMPLAINT_ID,
      { receivedById: RECEIVER_ID, assignedToId: ASSIGNEE_ID },
      DIRECTOR_ID,
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'COMPLAINT_ASSIGNED' }) }),
    );
  });

  it('derives assignedTo.title correctly from role', async () => {
    (prisma.clientComplaint.findUnique as any).mockResolvedValue(baseComplaint);
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({ id: RECEIVER_ID, name: 'Jane', role: 'CONTROL_ROOM' })
      .mockResolvedValueOnce({ id: ASSIGNEE_ID, name: 'John', role: 'OPERATIONS_SUPERVISOR', phone: null });
    (prisma.clientComplaint.update as any).mockResolvedValue({
      ...updatedWithAssignment,
      assignedToUser: { id: ASSIGNEE_ID, name: 'John', role: 'OPERATIONS_SUPERVISOR', phone: null },
    });
    (prisma.auditLog.create as any).mockResolvedValue({});

    const result = await complaintService.assignComplaint(
      COMPLAINT_ID,
      { receivedById: RECEIVER_ID, assignedToId: ASSIGNEE_ID },
      DIRECTOR_ID,
    );

    expect(result.assignedTo?.title).toBe('Operations Supervisor');
  });

  it('returns "Not provided" for phone when user has no phone on file', async () => {
    (prisma.clientComplaint.findUnique as any).mockResolvedValue(baseComplaint);
    (prisma.user.findUnique as any)
      .mockResolvedValueOnce({ id: RECEIVER_ID, name: 'Jane', role: 'CONTROL_ROOM' })
      .mockResolvedValueOnce({ id: ASSIGNEE_ID, name: 'John', role: 'OPERATIONS_SUPERVISOR', phone: null });
    (prisma.clientComplaint.update as any).mockResolvedValue({
      ...updatedWithAssignment,
      assignedToUser: { id: ASSIGNEE_ID, name: 'John', role: 'OPERATIONS_SUPERVISOR', phone: null },
    });
    (prisma.auditLog.create as any).mockResolvedValue({});

    const result = await complaintService.assignComplaint(
      COMPLAINT_ID,
      { receivedById: RECEIVER_ID, assignedToId: ASSIGNEE_ID },
      DIRECTOR_ID,
    );

    expect(result.assignedTo?.phone).toBe('Not provided');
  });
});

// ── updateStatus() ─────────────────────────────────────────────────────────────

describe('updateStatus()', () => {
  beforeEach(() => vi.clearAllMocks());

  const assignedComplaint = { ...baseComplaint, assignedToId: ASSIGNEE_ID };

  it('assigned person CAN update to UNDER_INVESTIGATION', async () => {
    (prisma.clientComplaint.findUnique as any).mockResolvedValue(assignedComplaint);
    (prisma.user.findUnique as any).mockResolvedValue({ role: 'FIELD_SUPERVISOR' });
    (prisma.clientComplaint.update as any).mockResolvedValue({
      ...updatedWithAssignment,
      status: 'UNDER_INVESTIGATION',
    });
    (prisma.auditLog.create as any).mockResolvedValue({});

    const result = await complaintService.updateStatus(COMPLAINT_ID, { status: 'UNDER_INVESTIGATION' }, ASSIGNEE_ID);
    expect(result.status).toBe('UNDER_INVESTIGATION');
  });

  it('assigned person CAN update to RESOLVED', async () => {
    (prisma.clientComplaint.findUnique as any).mockResolvedValue(assignedComplaint);
    (prisma.user.findUnique as any).mockResolvedValue({ role: 'FIELD_SUPERVISOR' });
    (prisma.clientComplaint.update as any).mockResolvedValue({
      ...updatedWithAssignment,
      status: 'RESOLVED',
    });
    (prisma.auditLog.create as any).mockResolvedValue({});

    const result = await complaintService.updateStatus(COMPLAINT_ID, { status: 'RESOLVED', actionTaken: 'Supervisor dispatched; issue closed on site.' }, ASSIGNEE_ID);
    expect(result.status).toBe('RESOLVED');
  });

  it('a different staff member (not assigned, not HR) gets 403', async () => {
    (prisma.clientComplaint.findUnique as any).mockResolvedValue(assignedComplaint);
    (prisma.user.findUnique as any).mockResolvedValue({ role: 'TRAINER' });

    await expect(
      complaintService.updateStatus(COMPLAINT_ID, { status: 'UNDER_INVESTIGATION' }, OTHER_USER_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('DIRECTOR can update status even if not the assigned person', async () => {
    (prisma.clientComplaint.findUnique as any).mockResolvedValue(assignedComplaint);
    (prisma.user.findUnique as any).mockResolvedValue({ role: 'DIRECTOR' });
    (prisma.clientComplaint.update as any).mockResolvedValue({
      ...updatedWithAssignment,
      status: 'RESOLVED',
    });
    (prisma.auditLog.create as any).mockResolvedValue({});

    const result = await complaintService.updateStatus(COMPLAINT_ID, { status: 'RESOLVED', actionTaken: 'Reviewed and closed by the Director.' }, DIRECTOR_ID);
    expect(result.status).toBe('RESOLVED');
  });

  it('throws 400 when complaint has no assignedToId yet', async () => {
    (prisma.clientComplaint.findUnique as any).mockResolvedValue(baseComplaint);

    await expect(
      complaintService.updateStatus(COMPLAINT_ID, { status: 'UNDER_INVESTIGATION' }, DIRECTOR_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when complaint does not exist', async () => {
    (prisma.clientComplaint.findUnique as any).mockResolvedValue(null);

    await expect(
      complaintService.updateStatus('nonexistent', { status: 'RESOLVED', actionTaken: 'n/a — complaint missing' }, DIRECTOR_ID),
    ).rejects.toMatchObject({ message: 'Complaint not found' });
  });
});
