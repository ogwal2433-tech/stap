import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from '../../jobs/QueueService';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../db/prisma', () => ({
  default: {
    applicant: {
      findUnique: vi.fn(),
      findMany:   vi.fn(),
      count:      vi.fn(),
      create:     vi.fn(),
      update:     vi.fn(),
      groupBy:    vi.fn(),
    },
    trainingSession: {
      findUnique: vi.fn(),
    },
    inventoryItem: {
      findMany: vi.fn(),
    },
    inventoryTransaction: {
      create: vi.fn(),
    },
    guardDeduction: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn({
      inventoryTransaction: { create: vi.fn() },
      inventoryItem:        { update: vi.fn() },
    })),
  },
}));

vi.mock('../../jobs/QueueService', () => ({
  QueueService: { logAudit: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/notificationService', () => ({
  notificationService: { send: vi.fn().mockResolvedValue(undefined), sendToRole: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../services/guardService', () => ({
  guardService: { create: vi.fn() },
}));

import prisma from '../../db/prisma';
import { hrService } from '../../services/hrService';
import { notificationService } from '../../services/notificationService';
import { guardService } from '../../services/guardService';
import { NotFoundError, AppError } from '../../errors/AppError';

const mp = prisma as any;

// ── Base fixture ───────────────────────────────────────────────────────────────

function makeApplicant(overrides: Record<string, any> = {}) {
  return {
    id:          'app-1',
    firstName:   'Test',
    lastName:    'Applicant',
    phone:       '+256700000001',
    email:       null,
    nationalId:  null,
    source:      'WALK_IN',
    stage:       'APPLICATION_RECEIVED',
    createdAt:   new Date('2026-01-01'),
    interviewDate: null,
    offerSalary:   null,
    assignedUser:  null,
    convertedToGuardId: null,
    // Doc verification
    relativesIdVerified:    false,
    relativesIdVerifiedAt:  null,
    nationalIdVerified:     false,
    nationalIdVerifiedAt:   null,
    academicDocsVerified:   false,
    academicDocsVerifiedAt: null,
    // Vetting
    applicationLetterUploaded: false,
    applicationLetterPath:     null,
    contractSigned:            false,
    contractSignedAt:          null,
    vettingFormUploaded:       false,
    vettingFormPath:           null,
    // Training
    trainingSessionId:    null,
    trainingStartedAt:    null,
    trainingCompletedAt:  null,
    // Joining
    shoeDeductionCreated: false,
    siteAssignedAt:       null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── verifyDocuments ────────────────────────────────────────────────────────────

describe('hrService.verifyDocuments', () => {
  it('throws NotFoundError when applicant does not exist', async () => {
    mp.applicant.findUnique.mockResolvedValue(null);
    await expect(
      hrService.verifyDocuments('bad-id', { relativesIdVerified: true, nationalIdVerified: false, academicDocsVerified: false }, 'user-1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('sets verified timestamps only when newly toggled to true', async () => {
    const applicant = makeApplicant({ relativesIdVerified: true });
    mp.applicant.findUnique.mockResolvedValue(applicant);
    mp.applicant.update.mockResolvedValue({ ...applicant, nationalIdVerified: true, nationalIdVerifiedAt: new Date() });

    await hrService.verifyDocuments(
      'app-1',
      { relativesIdVerified: true, nationalIdVerified: true, academicDocsVerified: false },
      'user-1',
    );

    const updateCall = mp.applicant.update.mock.calls[0][0];
    // relativesIdVerified was already true — no new timestamp
    expect(updateCall.data).not.toHaveProperty('relativesIdVerifiedAt');
    // nationalIdVerified is newly true — timestamp should be set
    expect(updateCall.data).toHaveProperty('nationalIdVerifiedAt');
  });

  it('auto-advances stage to SCREENING when all 3 docs verified from APPLICATION_RECEIVED', async () => {
    const applicant = makeApplicant();
    mp.applicant.findUnique.mockResolvedValue(applicant);
    mp.applicant.update.mockResolvedValue({ ...applicant, stage: 'SCREENING' });

    await hrService.verifyDocuments(
      'app-1',
      { relativesIdVerified: true, nationalIdVerified: true, academicDocsVerified: true },
      'user-1',
    );

    const updateCall = mp.applicant.update.mock.calls[0][0];
    expect(updateCall.data.stage).toBe('SCREENING');
  });

  it('does NOT auto-advance when applicant is already past APPLICATION_RECEIVED', async () => {
    const applicant = makeApplicant({ stage: 'SCREENING' });
    mp.applicant.findUnique.mockResolvedValue(applicant);
    mp.applicant.update.mockResolvedValue({ ...applicant });

    await hrService.verifyDocuments(
      'app-1',
      { relativesIdVerified: true, nationalIdVerified: true, academicDocsVerified: true },
      'user-1',
    );

    const updateCall = mp.applicant.update.mock.calls[0][0];
    expect(updateCall.data.stage).toBeUndefined();
  });
});

// ── updateVettingRequirements ──────────────────────────────────────────────────

describe('hrService.updateVettingRequirements', () => {
  it('throws NotFoundError when applicant does not exist', async () => {
    mp.applicant.findUnique.mockResolvedValue(null);
    await expect(
      hrService.updateVettingRequirements('bad-id', { contractSigned: true }, 'user-1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('sets contractSignedAt when contractSigned newly toggled to true', async () => {
    const applicant = makeApplicant({ contractSigned: false });
    const updated   = makeApplicant({ contractSigned: true, contractSignedAt: new Date() });
    mp.applicant.findUnique.mockResolvedValue(applicant);
    mp.applicant.update.mockResolvedValue(updated);

    await hrService.updateVettingRequirements('app-1', { contractSigned: true }, 'user-1');

    const updateCall = mp.applicant.update.mock.calls[0][0];
    expect(updateCall.data).toHaveProperty('contractSignedAt');
    expect(updateCall.data.contractSigned).toBe(true);
  });

  it('does NOT set contractSignedAt when contractSigned was already true', async () => {
    const applicant = makeApplicant({ contractSigned: true });
    mp.applicant.findUnique.mockResolvedValue(applicant);
    mp.applicant.update.mockResolvedValue(applicant);

    await hrService.updateVettingRequirements('app-1', { contractSigned: true }, 'user-1');

    const updateCall = mp.applicant.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('contractSignedAt');
  });

  it('sends ASSISTANT_MANAGER notification when all vetting + docs newly complete', async () => {
    const applicant = makeApplicant({
      relativesIdVerified: true, nationalIdVerified: true, academicDocsVerified: true,
      applicationLetterUploaded: true, contractSigned: false, vettingFormUploaded: true,
    });
    const updated = makeApplicant({
      ...applicant,
      contractSigned: true,
    });
    mp.applicant.findUnique.mockResolvedValue(applicant);
    mp.applicant.update.mockResolvedValue(updated);

    await hrService.updateVettingRequirements('app-1', { contractSigned: true }, 'user-1');

    expect(notificationService.sendToRole).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ASSISTANT_MANAGER', title: 'Applicant Ready for Training' }),
    );
  });

  it('does NOT send notification when vetting was already complete before update', async () => {
    const applicant = makeApplicant({
      relativesIdVerified: true, nationalIdVerified: true, academicDocsVerified: true,
      applicationLetterUploaded: true, contractSigned: true, vettingFormUploaded: true,
    });
    mp.applicant.findUnique.mockResolvedValue(applicant);
    mp.applicant.update.mockResolvedValue(applicant);

    await hrService.updateVettingRequirements('app-1', { contractSigned: true }, 'user-1');

    expect(notificationService.sendToRole).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Applicant Ready for Training' }),
    );
  });
});

// ── updateStage (stage gates) ─────────────────────────────────────────────────

describe('hrService.updateStage — stage gates', () => {
  it('throws 400 when moving to INTERVIEW_SCHEDULED without all docs verified', async () => {
    const applicant = makeApplicant({
      stage: 'SCREENING',
      relativesIdVerified: true, nationalIdVerified: false, academicDocsVerified: true,
      applicationLetterUploaded: true, contractSigned: true, vettingFormUploaded: true,
    });
    mp.applicant.findUnique.mockResolvedValue(applicant);

    await expect(
      hrService.updateStage('app-1', { stage: 'INTERVIEW_SCHEDULED' }, 'user-1'),
    ).rejects.toThrow(AppError);
  });

  it('throws 400 when moving to INTERVIEW_SCHEDULED without all vetting complete', async () => {
    const applicant = makeApplicant({
      stage: 'SCREENING',
      relativesIdVerified: true, nationalIdVerified: true, academicDocsVerified: true,
      applicationLetterUploaded: true, contractSigned: false, vettingFormUploaded: true,
    });
    mp.applicant.findUnique.mockResolvedValue(applicant);

    await expect(
      hrService.updateStage('app-1', { stage: 'INTERVIEW_SCHEDULED' }, 'user-1'),
    ).rejects.toThrow(AppError);
  });

  it('passes gate when all docs + vetting complete for INTERVIEW_SCHEDULED', async () => {
    const applicant = makeApplicant({
      stage: 'SCREENING',
      relativesIdVerified: true, nationalIdVerified: true, academicDocsVerified: true,
      applicationLetterUploaded: true, contractSigned: true, vettingFormUploaded: true,
    });
    mp.applicant.findUnique.mockResolvedValue(applicant);
    mp.applicant.update.mockResolvedValue({ ...applicant, stage: 'INTERVIEW_SCHEDULED' });

    await expect(
      hrService.updateStage('app-1', { stage: 'INTERVIEW_SCHEDULED' }, 'user-1'),
    ).resolves.toBeDefined();
  });

  it('throws 400 when moving to ACCEPTED and training session is not COMPLETED', async () => {
    const applicant = makeApplicant({
      stage: 'OFFER_MADE',
      trainingSessionId: 'session-1',
    });
    mp.applicant.findUnique.mockResolvedValue(applicant);
    mp.trainingSession.findUnique.mockResolvedValue({ status: 'SCHEDULED' });

    await expect(
      hrService.updateStage('app-1', { stage: 'ACCEPTED' }, 'user-1'),
    ).rejects.toThrow(AppError);
  });

  it('allows ACCEPTED when training session is COMPLETED', async () => {
    const applicant = makeApplicant({
      stage: 'OFFER_MADE',
      trainingSessionId: 'session-1',
    });
    mp.applicant.findUnique.mockResolvedValue(applicant);
    mp.trainingSession.findUnique.mockResolvedValue({ status: 'COMPLETED' });
    mp.applicant.update.mockResolvedValue({ ...applicant, stage: 'ACCEPTED' });

    await expect(
      hrService.updateStage('app-1', { stage: 'ACCEPTED' }, 'user-1'),
    ).resolves.toBeDefined();
  });

  it('throws 400 for invalid stage transitions', async () => {
    const applicant = makeApplicant({ stage: 'OFFER_MADE' });
    mp.applicant.findUnique.mockResolvedValue(applicant);

    await expect(
      hrService.updateStage('app-1', { stage: 'APPLICATION_RECEIVED' }, 'user-1'),
    ).rejects.toThrow(AppError);
  });

  it('throws 400 for REJECTED without rejectionReason', async () => {
    const applicant = makeApplicant({ stage: 'SCREENING' });
    mp.applicant.findUnique.mockResolvedValue(applicant);

    await expect(
      hrService.updateStage('app-1', { stage: 'REJECTED' }, 'user-1'),
    ).rejects.toThrow(AppError);
  });
});

// ── convertToGuard ─────────────────────────────────────────────────────────────

describe('hrService.convertToGuard', () => {
  const guardData = {
    firstName: 'Test', lastName: 'Guard', nationalId: 'NIN-001',
    phone: '+256700000001', dateOfBirth: '1990-01-01T00:00:00.000Z',
    nextOfKinName: 'Jane', nextOfKinPhone: '+256700000002',
    salaryRate: 400000, contractStart: '2026-01-01T00:00:00.000Z',
  };

  it('throws 400 if applicant is not in ACCEPTED or ONBOARDING stage', async () => {
    mp.applicant.findUnique.mockResolvedValue(makeApplicant({ stage: 'SCREENING' }));

    await expect(
      hrService.convertToGuard('app-1', guardData, 'user-1'),
    ).rejects.toThrow(AppError);
  });

  it('calls guardService.create and updates applicant with new guardId', async () => {
    mp.applicant.findUnique.mockResolvedValue(makeApplicant({ stage: 'ACCEPTED' }));
    const fakeGuard = { id: 'guard-new', firstName: 'Test', lastName: 'Guard' };
    (guardService.create as any).mockResolvedValue(fakeGuard);
    mp.applicant.update.mockResolvedValue({});
    mp.inventoryItem.findMany.mockResolvedValue([]);

    const result = await hrService.convertToGuard('app-1', guardData, 'user-1');

    expect(guardService.create).toHaveBeenCalledWith(guardData, 'user-1');
    expect(mp.applicant.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'app-1' }, data: expect.objectContaining({ convertedToGuardId: 'guard-new' }) }),
    );
    expect(result.id).toBe('guard-new');
  });

  it('issues uniform items via $transaction for each UNIFORM active item', async () => {
    mp.applicant.findUnique.mockResolvedValueOnce(makeApplicant({ stage: 'ACCEPTED' }));
    const fakeGuard = { id: 'guard-new', firstName: 'Test', lastName: 'Guard' };
    (guardService.create as any).mockResolvedValue(fakeGuard);
    mp.applicant.update.mockResolvedValue({});

    const uniformItems = [
      { id: 'item-1', issuedFree: true,  isShoeItem: false, stockQuantity: 10 },
      { id: 'item-2', issuedFree: false, isShoeItem: true,  stockQuantity: 10 },
    ];
    mp.inventoryItem.findMany.mockResolvedValue(uniformItems);
    // Second findUnique call in shoe deduction logic
    mp.applicant.findUnique.mockResolvedValueOnce(makeApplicant({ shoeDeductionCreated: false }));
    mp.guardDeduction.create.mockResolvedValue({});

    await hrService.convertToGuard('app-1', guardData, 'user-1');

    // $transaction called once per item
    expect(mp.$transaction).toHaveBeenCalledTimes(2);
  });

  it('creates shoe deduction only when isShoeItem=true and not already created', async () => {
    mp.applicant.findUnique.mockResolvedValueOnce(makeApplicant({ stage: 'ACCEPTED' }));
    const fakeGuard = { id: 'guard-new', firstName: 'Test', lastName: 'Guard' };
    (guardService.create as any).mockResolvedValue(fakeGuard);
    mp.applicant.update.mockResolvedValue({});

    const uniformItems = [{ id: 'item-shoe', issuedFree: false, isShoeItem: true, stockQuantity: 5 }];
    mp.inventoryItem.findMany.mockResolvedValue(uniformItems);
    mp.applicant.findUnique.mockResolvedValueOnce(makeApplicant({ shoeDeductionCreated: false }));
    mp.guardDeduction.create.mockResolvedValue({});

    await hrService.convertToGuard('app-1', guardData, 'user-1');

    expect(mp.guardDeduction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 30000, type: 'UNIFORM_RECOVERY' }) }),
    );
  });

  it('skips shoe deduction when already created', async () => {
    mp.applicant.findUnique.mockResolvedValueOnce(makeApplicant({ stage: 'ACCEPTED' }));
    const fakeGuard = { id: 'guard-new', firstName: 'Test', lastName: 'Guard' };
    (guardService.create as any).mockResolvedValue(fakeGuard);
    mp.applicant.update.mockResolvedValue({});

    const uniformItems = [{ id: 'item-shoe', issuedFree: false, isShoeItem: true, stockQuantity: 5 }];
    mp.inventoryItem.findMany.mockResolvedValue(uniformItems);
    mp.applicant.findUnique.mockResolvedValueOnce(makeApplicant({ shoeDeductionCreated: true }));

    await hrService.convertToGuard('app-1', guardData, 'user-1');

    expect(mp.guardDeduction.create).not.toHaveBeenCalled();
  });
});

// ── uploadApplicationLetter / uploadVettingForm ───────────────────────────────

describe('hrService.uploadApplicationLetter', () => {
  it('throws NotFoundError when applicant does not exist', async () => {
    mp.applicant.findUnique.mockResolvedValue(null);
    await expect(
      hrService.uploadApplicationLetter('bad-id', '/path/to/file.pdf', 'user-1'),
    ).rejects.toThrow(NotFoundError);
  });

  it('sets applicationLetterPath and applicationLetterUploaded=true', async () => {
    mp.applicant.findUnique.mockResolvedValue(makeApplicant());
    mp.applicant.update.mockResolvedValue(makeApplicant({ applicationLetterUploaded: true, applicationLetterPath: '/path/file.pdf' }));

    await hrService.uploadApplicationLetter('app-1', '/path/file.pdf', 'user-1');

    expect(mp.applicant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ applicationLetterPath: '/path/file.pdf', applicationLetterUploaded: true }),
      }),
    );
  });
});

describe('hrService.uploadVettingForm', () => {
  it('sets vettingFormPath and vettingFormUploaded=true', async () => {
    mp.applicant.findUnique.mockResolvedValue(makeApplicant());
    mp.applicant.update.mockResolvedValue(makeApplicant({ vettingFormUploaded: true, vettingFormPath: '/path/vetting.pdf' }));

    await hrService.uploadVettingForm('app-1', '/path/vetting.pdf', 'user-1');

    expect(mp.applicant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ vettingFormPath: '/path/vetting.pdf', vettingFormUploaded: true }),
      }),
    );
  });
});
