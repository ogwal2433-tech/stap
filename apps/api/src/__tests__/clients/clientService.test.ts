import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    client: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    contract: { count: vi.fn() },
    clientComplaint: { count: vi.fn() },
    clientContact: {
      findFirst:  vi.fn(),
      findMany:   vi.fn(),
      count:      vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      updateMany: vi.fn(),
      delete:     vi.fn(),
    },
    // generateClientId() reads the highest existing SSLC number through raw SQL.
    $queryRaw:    vi.fn(),
    $transaction: vi.fn(),
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { clientService } from '../../services/clientService';
import { NotFoundError } from '../../errors/AppError';

const mockPrisma = prisma as unknown as {
  client: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  contract: { count: ReturnType<typeof vi.fn> };
  clientComplaint: { count: ReturnType<typeof vi.fn> };
  clientContact: {
    findFirst:  ReturnType<typeof vi.fn>;
    findMany:   ReturnType<typeof vi.fn>;
    count:      ReturnType<typeof vi.fn>;
    create:     ReturnType<typeof vi.fn>;
    update:     ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    delete:     ReturnType<typeof vi.fn>;
  };
  $queryRaw:    ReturnType<typeof vi.fn>;
  $transaction: ReturnType<typeof vi.fn>;
};

const baseClient = {
  id: 'c1',
  clientName: 'KCCA',
  contactPerson: 'James Sserwanga',
  contactPhone: '+256414123456',
  email: 'security@kcca.go.ug',
  physicalAddress: 'City Hall, Kampala',
  billingAddress: null,
  billingTerms: 30,
  contractStatus: 'ACTIVE' as const,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  contacts: [
    {
      id: 'cc1', clientId: 'c1', contactType: 'PRIMARY', name: 'James Sserwanga',
      phone: '+256414123456', email: null, jobTitle: 'Head of Security',
      isPrimary: true, notes: null,
      createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    },
  ],
  _count: { sites: 2, contracts: 1, complaints: 0 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$queryRaw.mockResolvedValue([{ max_num: 0 }]);
  // The contact writes run inside a transaction; the callback is handed the same
  // mock client so the assertions can see what it was asked to do.
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockPrisma));
});

// ── list() ─────────────────────────────────────────────────────────────────────

describe('clientService.list()', () => {
  it('returns paginated results with correct structure', async () => {
    mockPrisma.client.findMany.mockResolvedValue([baseClient]);
    mockPrisma.client.count.mockResolvedValue(1);

    const result = await clientService.list({
      page: 1, limit: 20, sortBy: 'clientName', sortOrder: 'asc',
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].clientName).toBe('KCCA');
    expect(result.pagination.total).toBe(1);
    expect(result.pagination.hasNext).toBe(false);
  });

  it('applies search filter correctly', async () => {
    mockPrisma.client.findMany.mockResolvedValue([]);
    mockPrisma.client.count.mockResolvedValue(0);

    await clientService.list({
      page: 1, limit: 20, search: 'KCCA', sortBy: 'clientName', sortOrder: 'asc',
    });

    const whereArg = mockPrisma.client.findMany.mock.calls[0][0].where;
    expect(whereArg.OR).toBeDefined();
    expect(whereArg.OR.length).toBeGreaterThan(0);
  });

  it('filters by contractStatus when provided', async () => {
    mockPrisma.client.findMany.mockResolvedValue([]);
    mockPrisma.client.count.mockResolvedValue(0);

    await clientService.list({
      page: 1, limit: 20, contractStatus: 'ACTIVE', sortBy: 'clientName', sortOrder: 'asc',
    });

    const whereArg = mockPrisma.client.findMany.mock.calls[0][0].where;
    expect(whereArg.contractStatus).toBe('ACTIVE');
  });
});

// ── getById() ──────────────────────────────────────────────────────────────────

describe('clientService.getById()', () => {
  it('returns client with sites and contracts', async () => {
    mockPrisma.client.findUnique.mockResolvedValue({
      ...baseClient,
      sites: [{ id: 's1', siteName: 'City Hall Entrance' }],
      contracts: [],
      complaints: [],
    });

    const result = await clientService.getById('c1');
    expect(result.id).toBe('c1');
    expect(result.clientName).toBe('KCCA');
  });

  it('throws NotFoundError for unknown id', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(null);
    await expect(clientService.getById('missing')).rejects.toThrow(NotFoundError);
  });
});

// ── create() ──────────────────────────────────────────────────────────────────

describe('clientService.create()', () => {
  const input = {
    clientName: 'KCCA',
    contactPerson: 'James Sserwanga',
    contactPhone: '+256414123456',
    email: 'security@kcca.go.ug' as const,
    physicalAddress: 'City Hall, Kampala',
    billingTerms: 30,
    contractStatus: 'ACTIVE' as const,
  };

  it('creates client and enqueues audit', async () => {
    mockPrisma.client.create.mockResolvedValue(baseClient);

    const result = await clientService.create(input, 'user1');
    expect(result.id).toBe('c1');
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLIENT_CREATED' }),
    );
  });
  it('stores a blank email as null rather than an empty string', async () => {
    mockPrisma.client.create.mockResolvedValue({ ...baseClient, email: null });

    await clientService.create({ ...input, email: '' }, 'user1');

    expect(mockPrisma.client.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: null }) }),
    );
  });

  it('creates a primary contact from contactPerson when no contacts are given', async () => {
    mockPrisma.client.create.mockResolvedValue(baseClient);

    await clientService.create(input, 'user1');

    const { data } = mockPrisma.client.create.mock.calls[0][0];
    expect(data.contacts.create).toEqual([
      expect.objectContaining({
        name:        'James Sserwanga',
        phone:       '+256414123456',
        contactType: 'PRIMARY',
        isPrimary:   true,
      }),
    ]);
  });

  it('derives contactPerson and contactPhone from the primary contact', async () => {
    mockPrisma.client.create.mockResolvedValue(baseClient);

    await clientService.create(
      {
        clientName: 'Kampala Textile', physicalAddress: 'Industrial Area', billingTerms: 30,
        contacts: [
          { name: 'James Opio',   phone: '256701234567', contactType: 'PRIMARY',   isPrimary: true },
          { name: 'Sarah Nakato', phone: '256709876543', contactType: 'SECONDARY', isPrimary: false },
        ],
      },
      'user1',
    );

    const { data } = mockPrisma.client.create.mock.calls[0][0];
    expect(data.contactPerson).toBe('James Opio');
    expect(data.contactPhone).toBe('256701234567');
    expect(data.contacts.create).toHaveLength(2);
  });

  it('makes the first contact primary when none is marked', async () => {
    mockPrisma.client.create.mockResolvedValue(baseClient);

    await clientService.create(
      {
        clientName: 'X', physicalAddress: 'Y', billingTerms: 30,
        contacts: [{ name: 'First' }, { name: 'Second' }],
      },
      'user1',
    );

    const { create } = mockPrisma.client.create.mock.calls[0][0].data.contacts;
    expect(create.map((c: { name: string; isPrimary: boolean }) => [c.name, c.isPrimary]))
      .toEqual([['First', true], ['Second', false]]);
  });

  it('does not leave a second contact typed PRIMARY', async () => {
    mockPrisma.client.create.mockResolvedValue(baseClient);

    await clientService.create(
      {
        clientName: 'X', physicalAddress: 'Y', billingTerms: 30,
        contacts: [
          { name: 'A', contactType: 'PRIMARY', isPrimary: true },
          { name: 'B', contactType: 'PRIMARY' },
        ],
      },
      'user1',
    );

    const { create } = mockPrisma.client.create.mock.calls[0][0].data.contacts;
    expect(create.map((c: { contactType: string }) => c.contactType)).toEqual(['PRIMARY', 'SECONDARY']);
  });
});

// ── contacts ──────────────────────────────────────────────────────────────────

describe('clientService contacts', () => {
  const contact = {
    id: 'cc2', clientId: 'c1', contactType: 'SECONDARY', name: 'Sarah Nakato',
    phone: '256709876543', email: null, jobTitle: 'Finance Manager',
    isPrimary: false, notes: null,
    createdAt: new Date('2026-02-01'), updatedAt: new Date('2026-02-01'),
  };

  it('mirrors the promoted contact onto the client columns', async () => {
    mockPrisma.clientContact.findFirst
      .mockResolvedValueOnce({ ...contact, isPrimary: true }); // mirrorPrimary
    mockPrisma.clientContact.findMany.mockResolvedValue([]);
    mockPrisma.clientContact.update.mockResolvedValue({ ...contact, isPrimary: true });
    mockPrisma.clientContact.findFirst.mockResolvedValue({ ...contact, isPrimary: true });

    await clientService.updateContact('c1', 'cc2', { isPrimary: true }, 'user1');

    expect(mockPrisma.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactPerson: 'Sarah Nakato',
          contactPhone:  '256709876543',
        }),
      }),
    );
  });

  it('retypes a demoted PRIMARY as SECONDARY', async () => {
    mockPrisma.clientContact.findFirst.mockResolvedValue({ ...contact, isPrimary: true });
    mockPrisma.clientContact.findMany.mockResolvedValue([
      { id: 'cc1', contactType: 'PRIMARY', isPrimary: true },
    ]);
    mockPrisma.clientContact.update.mockResolvedValue({ ...contact, isPrimary: true });

    await clientService.updateContact('c1', 'cc2', { isPrimary: true }, 'user1');

    expect(mockPrisma.clientContact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cc1' },
        data:  { isPrimary: false, contactType: 'SECONDARY' },
      }),
    );
  });

  it('leaves a demoted BILLING contact typed BILLING', async () => {
    mockPrisma.clientContact.findFirst.mockResolvedValue({ ...contact, isPrimary: true });
    mockPrisma.clientContact.findMany.mockResolvedValue([
      { id: 'cc3', contactType: 'BILLING', isPrimary: true },
    ]);
    mockPrisma.clientContact.update.mockResolvedValue({ ...contact, isPrimary: true });

    await clientService.updateContact('c1', 'cc2', { isPrimary: true }, 'user1');

    expect(mockPrisma.clientContact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cc3' },
        data:  { isPrimary: false, contactType: 'BILLING' },
      }),
    );
  });

  it('refuses to remove the only contact', async () => {
    mockPrisma.clientContact.findFirst.mockResolvedValue(contact);
    mockPrisma.clientContact.count.mockResolvedValue(1);

    await expect(clientService.deleteContact('c1', 'cc2', 'user1'))
      .rejects.toThrow(/only contact/i);
    expect(mockPrisma.clientContact.delete).not.toHaveBeenCalled();
  });

  it('promotes the next contact when the primary is removed', async () => {
    mockPrisma.clientContact.findFirst
      .mockResolvedValueOnce({ ...contact, isPrimary: true })                 // the one being deleted
      .mockResolvedValueOnce({ id: 'cc9', contactType: 'SECONDARY' })         // the next in line
      .mockResolvedValueOnce({ ...contact, id: 'cc9', isPrimary: true });     // mirrorPrimary
    mockPrisma.clientContact.count.mockResolvedValue(3);
    mockPrisma.clientContact.delete.mockResolvedValue(contact);

    await clientService.deleteContact('c1', 'cc2', 'user1');

    expect(mockPrisma.clientContact.update).toHaveBeenCalledWith({
      where: { id: 'cc9' },
      data:  { isPrimary: true, contactType: 'PRIMARY' },
    });
  });
});

// ── update() ──────────────────────────────────────────────────────────────────

describe('clientService.update()', () => {
  it('updates and enqueues audit with old/new values', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(baseClient);
    mockPrisma.client.update.mockResolvedValue({ ...baseClient, billingTerms: 45 });

    await clientService.update('c1', { billingTerms: 45 }, 'user1');

    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLIENT_UPDATED',
        oldValue: expect.objectContaining({ clientName: 'KCCA' }),
      }),
    );
  });

  it('throws NotFoundError for unknown id', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(null);
    await expect(clientService.update('missing', {}, 'user1')).rejects.toThrow(NotFoundError);
  });
});

// ── archive() ─────────────────────────────────────────────────────────────────

// ── marketerName is tied to leadSource ────────────────────────────────────────

describe('marketerName follows leadSource', () => {
  const input = {
    clientName:      'KCCA',
    contactPerson:   'James Sserwanga',
    contactPhone:    '+256414123456',
    physicalAddress: 'City Hall, Kampala',
    billingTerms:    30,
    contractStatus:  'ACTIVE' as const,
  };

  const dataFromCreate = () => mockPrisma.client.create.mock.calls[0][0].data;
  const dataFromUpdate = () => mockPrisma.client.update.mock.calls[0][0].data;

  it('stores the name when the source is MARKETER', async () => {
    mockPrisma.client.create.mockResolvedValue(baseClient);
    await clientService.create(
      { ...input, leadSource: 'MARKETER', marketerName: 'John Okello' } as never,
      'user1',
    );
    expect(dataFromCreate().marketerName).toBe('John Okello');
  });

  it('drops a name sent with any other source', async () => {
    // Nothing explains the value once the source is not MARKETER, and the
    // marketer report reads this column as fact.
    mockPrisma.client.create.mockResolvedValue(baseClient);
    await clientService.create(
      { ...input, leadSource: 'REFERRAL', marketerName: 'John Okello' } as never,
      'user1',
    );
    expect(dataFromCreate().marketerName).toBeNull();
  });

  it('stores a blank name as null, not an empty string', async () => {
    mockPrisma.client.create.mockResolvedValue(baseClient);
    await clientService.create(
      { ...input, leadSource: 'WEBSITE', marketerName: '' } as never,
      'user1',
    );
    expect(dataFromCreate().marketerName).toBeNull();
  });

  it('clears the name when an update moves the source away from MARKETER', async () => {
    // The case that matters: a client already credited to a marketer is
    // re-sourced, and must stop counting towards their numbers.
    mockPrisma.client.findUnique.mockResolvedValue(baseClient);
    mockPrisma.client.update.mockResolvedValue(baseClient);

    await clientService.update('c1', { leadSource: 'REFERRAL' } as never, 'user1');

    expect(dataFromUpdate().marketerName).toBeNull();
  });

  it('keeps the name when an update leaves the source as MARKETER', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(baseClient);
    mockPrisma.client.update.mockResolvedValue(baseClient);

    await clientService.update(
      'c1',
      { leadSource: 'MARKETER', marketerName: 'Grace Nakato' } as never,
      'user1',
    );

    expect(dataFromUpdate().marketerName).toBe('Grace Nakato');
  });

  it('leaves the name alone on an update that does not mention the source', async () => {
    // A PATCH of the billing terms must not blank a field it never sent.
    mockPrisma.client.findUnique.mockResolvedValue(baseClient);
    mockPrisma.client.update.mockResolvedValue(baseClient);

    await clientService.update('c1', { billingTerms: 60 } as never, 'user1');

    expect(dataFromUpdate()).not.toHaveProperty('marketerName');
  });
});

describe('clientService.archive()', () => {
  it('sets contractStatus to INACTIVE', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(baseClient);
    mockPrisma.client.update.mockResolvedValue({ ...baseClient, contractStatus: 'INACTIVE' });

    const result = await clientService.archive('c1', 'user1');
    expect(result.contractStatus).toBe('INACTIVE');
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLIENT_ARCHIVED' }),
    );
  });
});

// ── getSummary() ───────────────────────────────────────────────────────────────

describe('clientService.getSummary()', () => {
  it('returns correct counts', async () => {
    mockPrisma.client.count
      .mockResolvedValueOnce(10) // totalActive
      .mockResolvedValueOnce(3);  // totalInactive
    mockPrisma.contract.count.mockResolvedValue(2);
    mockPrisma.clientComplaint.count.mockResolvedValue(5);

    const summary = await clientService.getSummary();
    expect(summary.totalActive).toBe(10);
    expect(summary.totalInactive).toBe(3);
    expect(summary.expiringContracts).toBe(2);
    expect(summary.openComplaints).toBe(5);
  });
});
