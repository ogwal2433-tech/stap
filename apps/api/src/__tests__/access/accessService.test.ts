import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    guard:  { findUnique: vi.fn(), update: vi.fn() },
    client: { findUnique: vi.fn() },
    user:   {
      findUnique: vi.fn(),
      findFirst:  vi.fn(),
      findMany:   vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      updateMany: vi.fn(),
    },
    $queryRaw:    vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: {
    logAudit:  vi.fn().mockResolvedValue(undefined),
    sendEmail: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../lib/systemId', () => ({
  generateStaffId: vi.fn().mockResolvedValue('SSLS999'),
}));

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed') },
}));

import prisma from '../../db/prisma';
import { accessService } from '../../services/accessService';
import { AppError, NotFoundError } from '../../errors/AppError';

const db = prisma as unknown as {
  guard:  { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  client: { findUnique: ReturnType<typeof vi.fn> };
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst:  ReturnType<typeof vi.fn>;
    findMany:   ReturnType<typeof vi.fn>;
    create:     ReturnType<typeof vi.fn>;
    update:     ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const GUARD = {
  id: 'g1', firstName: 'Alaru', lastName: 'Stephen', otherNames: null, userId: null,
};
const ACCOUNT = { id: 'u1', name: 'Alaru Stephen', email: 'alaru@example.com', status: 'ACTIVE' };

beforeEach(() => {
  vi.clearAllMocks();
  // The interactive transaction just runs its callback against the same mock.
  db.$transaction.mockImplementation(async (arg: any) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
  );
});

describe('accessService.grantGuardAccess()', () => {
  it('creates the login and links it to the guard', async () => {
    db.guard.findUnique.mockResolvedValue(GUARD);
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue(ACCOUNT);
    db.guard.update.mockResolvedValue({});

    const result = await accessService.grantGuardAccess('g1', 'alaru@example.com', 'sup3rsecret', 'admin');

    expect(result).toEqual({
      userId: 'u1', name: 'Alaru Stephen', email: 'alaru@example.com', status: 'ACTIVE',
    });
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'GUARD', status: 'ACTIVE', email: 'alaru@example.com' }),
      }),
    );
    // The link is what makes the login reachable from the profile again.
    expect(db.guard.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { userId: 'u1' } });
  });

  it('refuses a guard who already has a login', async () => {
    db.guard.findUnique.mockResolvedValue({ ...GUARD, userId: 'existing' });

    await expect(
      accessService.grantGuardAccess('g1', 'a@b.com', 'sup3rsecret', 'admin'),
    ).rejects.toThrow(AppError);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('refuses an email that belongs to someone else', async () => {
    db.guard.findUnique.mockResolvedValue(GUARD);
    // An active account on that address — not a revoked one this guard may reuse.
    db.user.findUnique.mockResolvedValue({
      id: 'other', role: 'DIRECTOR', status: 'ACTIVE', guard: null,
    });

    await expect(
      accessService.grantGuardAccess('g1', 'taken@example.com', 'sup3rsecret', 'admin'),
    ).rejects.toThrow(/already used/i);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('revives a previously revoked login rather than colliding on its email', async () => {
    db.guard.findUnique.mockResolvedValue(GUARD);
    db.user.findUnique.mockResolvedValue({
      id: 'old', role: 'GUARD', status: 'INACTIVE', guard: null,
    });
    db.user.update.mockResolvedValue({ ...ACCOUNT, id: 'old' });
    db.guard.update.mockResolvedValue({});

    const result = await accessService.grantGuardAccess('g1', 'alaru@example.com', 'sup3rsecret', 'admin');

    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'old' },
        data:  expect.objectContaining({ status: 'ACTIVE' }),
      }),
    );
    expect(result.userId).toBe('old');
  });

  it('rejects an unknown guard', async () => {
    db.guard.findUnique.mockResolvedValue(null);
    await expect(
      accessService.grantGuardAccess('nope', 'a@b.com', 'sup3rsecret', 'admin'),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('accessService.revokeGuardAccess()', () => {
  it('deactivates the account and unlinks it, without deleting', async () => {
    db.guard.findUnique.mockResolvedValue({
      id: 'g1', userId: 'u1', user: { email: 'alaru@example.com' },
    });

    await accessService.revokeGuardAccess('g1', 'admin');

    const [ops] = db.$transaction.mock.calls[0] as [unknown[]];
    expect(ops).toHaveLength(2);
    expect(db.guard.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { userId: null } });
    // Deactivated, never deleted: required FKs from incidents and requisitions
    // point back at this row, and the audit trail has to survive.
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'u1' },
        data:  expect.objectContaining({ status: 'INACTIVE' }),
      }),
    );
  });

  it('refuses when the guard has no login', async () => {
    db.guard.findUnique.mockResolvedValue({ id: 'g1', userId: null, user: null });
    await expect(accessService.revokeGuardAccess('g1', 'admin')).rejects.toThrow(/no system access/i);
  });
});

describe('accessService.grantClientPortalAccess()', () => {
  it('creates a CLIENT user scoped to the company', async () => {
    db.client.findUnique.mockResolvedValue({ id: 'c1', clientName: 'Acme' });
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({
      id: 'u2', name: 'John Mugisha', email: 'john@acme.com', status: 'ACTIVE',
    });

    const result = await accessService.grantClientPortalAccess(
      'c1', 'john@acme.com', 'sup3rsecret', 'John Mugisha', 'admin',
    );

    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'CLIENT', clientId: 'c1' }),
      }),
    );
    expect(result.email).toBe('john@acme.com');
  });

  it('adds a second login rather than replacing the first', async () => {
    db.client.findUnique.mockResolvedValue({ id: 'c1', clientName: 'Acme' });
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({
      id: 'u3', name: 'Finance', email: 'finance@acme.com', status: 'ACTIVE',
    });

    await accessService.grantClientPortalAccess(
      'c1', 'finance@acme.com', 'sup3rsecret', 'Finance', 'admin',
    );

    // Nothing is deactivated on the way in — a company holds many logins.
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown client', async () => {
    db.client.findUnique.mockResolvedValue(null);
    await expect(
      accessService.grantClientPortalAccess('nope', 'a@b.com', 'sup3rsecret', 'X', 'admin'),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('accessService.revokeClientPortalAccess()', () => {
  it('switches off every login when none is named', async () => {
    db.user.findMany.mockResolvedValue([
      { id: 'u2', email: 'john@acme.com' },
      { id: 'u3', email: 'finance@acme.com' },
    ]);

    const result = await accessService.revokeClientPortalAccess('c1', 'admin');

    expect(result).toEqual({ revoked: 2 });
    expect(db.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['u2', 'u3'] } },
        data:  expect.objectContaining({ status: 'INACTIVE', clientId: null }),
      }),
    );
  });

  it('switches off only the named login', async () => {
    db.user.findMany.mockResolvedValue([{ id: 'u3', email: 'finance@acme.com' }]);

    const result = await accessService.revokeClientPortalAccess('c1', 'admin', 'u3');

    expect(result).toEqual({ revoked: 1 });
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'u3' }) }),
    );
  });

  it('refuses when the client has no portal access', async () => {
    db.user.findMany.mockResolvedValue([]);
    await expect(accessService.revokeClientPortalAccess('c1', 'admin')).rejects.toThrow(
      /no portal access/i,
    );
  });
});

describe('accessService.resetClientPortalPassword()', () => {
  it('will not reset a login belonging to a different client', async () => {
    db.user.findFirst.mockResolvedValue(null);
    await expect(
      accessService.resetClientPortalPassword('c1', 'u9', 'sup3rsecret', 'admin'),
    ).rejects.toThrow(NotFoundError);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('sets a new hash for a login the client owns', async () => {
    db.user.findFirst.mockResolvedValue({ id: 'u2', name: 'John', email: 'john@acme.com' });
    db.user.update.mockResolvedValue({});

    const result = await accessService.resetClientPortalPassword('c1', 'u2', 'sup3rsecret', 'admin');

    expect(result).toEqual({ email: 'john@acme.com' });
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u2' } }),
    );
  });
});
