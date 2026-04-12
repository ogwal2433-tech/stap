import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock Puppeteer — do not launch real browser in tests
vi.mock('puppeteer', () => ({
  default: {
    launch: vi.fn().mockResolvedValue({
      newPage: vi.fn().mockResolvedValue({
        setContent: vi.fn().mockResolvedValue(undefined),
        pdf: vi.fn().mockResolvedValue(Buffer.from('PDF')),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock fs to avoid actual file writes
vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock('../../db/prisma', () => ({
  default: {
    guard: { findUnique: vi.fn() },
    disciplinaryRecord: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    guardDocument: {
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

import prisma from '../../db/prisma';
import { letterService } from '../../services/letterService';

const mockPrisma = prisma as unknown as {
  guard: { findUnique: ReturnType<typeof vi.fn> };
  disciplinaryRecord: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  guardDocument: {
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

const baseGuard = {
  id: 'g1',
  firstName: 'David',
  lastName: 'Ochieng',
  otherNames: null,
  nationalId: 'CM90210',
  salaryRate: 450000,
  contractStart: new Date('2026-01-01'),
  contractEnd: null,
};

const baseDocRecord = {
  id: 'doc1',
  guardId: 'g1',
  documentType: 'WARNING_LETTER',
  filePath: '/uploads/guards/g1/letters/test.pdf',
  version: 1,
  uploadedBy: 'user1',
  uploadedAt: new Date(),
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.guard.findUnique.mockResolvedValue(baseGuard);
  mockPrisma.disciplinaryRecord.findUnique.mockResolvedValue(null);
  mockPrisma.disciplinaryRecord.update.mockResolvedValue({});
  mockPrisma.guardDocument.count.mockResolvedValue(0);
  mockPrisma.guardDocument.create.mockResolvedValue(baseDocRecord);
});

// ── getLetterTemplate() ────────────────────────────────────────────────────────

describe('letterService.getLetterTemplate()', () => {
  const templateData = {
    guardName: 'David Ochieng',
    nationalId: 'CM90210',
    position: 'Security Guard',
    directorName: 'Taraka Joel',
    issueDate: '12 April 2026',
    refNumber: 'STAP/2026/VER/123',
    salaryRate: 'UGX 450,000',
  };

  const LETTER_TYPES = [
    'VERBAL_WARNING',
    'FIRST_WARNING',
    'FINAL_WARNING',
    'TERMINATION_NOTICE',
    'APPOINTMENT_LETTER',
    'CONTRACT_EXTENSION',
    'CONFIRMATION_OF_EMPLOYMENT',
    'SALARY_REVIEW',
  ];

  it.each(LETTER_TYPES)('returns non-empty HTML for %s', (letterType) => {
    const html = letterService.getLetterTemplate(letterType, templateData);
    expect(html).toBeTruthy();
    expect(html.length).toBeGreaterThan(100);
  });

  it.each(LETTER_TYPES)('includes guardName in %s template', (letterType) => {
    const html = letterService.getLetterTemplate(letterType, templateData);
    expect(html).toContain('David Ochieng');
  });

  it.each(LETTER_TYPES)('includes directorName in %s template', (letterType) => {
    const html = letterService.getLetterTemplate(letterType, templateData);
    expect(html).toContain('Taraka Joel');
  });

  it('throws for unknown letter type', () => {
    expect(() =>
      letterService.getLetterTemplate('UNKNOWN_TYPE', templateData),
    ).toThrow('Unknown letter type');
  });
});

// ── generateLetter() ──────────────────────────────────────────────────────────

describe('letterService.generateLetter()', () => {
  const input = {
    guardId: 'g1',
    letterType: 'VERBAL_WARNING' as const,
    directorName: 'Taraka Joel',
  };

  it('creates guardDocument record after generation', async () => {
    const result = await letterService.generateLetter(input, 'user1');
    expect(mockPrisma.guardDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          guardId: 'g1',
          documentType: 'WARNING_LETTER',
        }),
      }),
    );
    expect(result).toHaveProperty('documentId', 'doc1');
  });

  it('enqueues audit log after generation', async () => {
    await letterService.generateLetter(input, 'user1');
    expect(QueueService.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LETTER_GENERATED' }),
    );
  });

  it('updates disciplinaryRecord.letterPath when disciplinaryRecordId provided', async () => {
    const discRecord = {
      incidentDate: new Date('2026-04-10'),
      reason: 'Sleeping on duty',
      outcome: 'Verbal warning issued',
    };
    mockPrisma.disciplinaryRecord.findUnique.mockResolvedValue(discRecord);

    await letterService.generateLetter(
      { ...input, disciplinaryRecordId: 'dr1' },
      'user1',
    );

    expect(mockPrisma.disciplinaryRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dr1' },
        data: expect.objectContaining({ letterPath: expect.stringContaining('/uploads') }),
      }),
    );
  });

  it('uses CONTRACT documentType for APPOINTMENT_LETTER', async () => {
    await letterService.generateLetter(
      { ...input, letterType: 'APPOINTMENT_LETTER' },
      'user1',
    );
    expect(mockPrisma.guardDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentType: 'CONTRACT' }),
      }),
    );
  });

  it('uses OTHER documentType for CONFIRMATION_OF_EMPLOYMENT', async () => {
    await letterService.generateLetter(
      { ...input, letterType: 'CONFIRMATION_OF_EMPLOYMENT' },
      'user1',
    );
    expect(mockPrisma.guardDocument.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ documentType: 'OTHER' }),
      }),
    );
  });
});
