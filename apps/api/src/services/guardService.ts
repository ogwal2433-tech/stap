import fs from 'fs';
import path from 'path';
import prisma from '../db/prisma';
import { writeAuditLog } from '../lib/auditLog';
import { generateIdCardPdf } from '../lib/idCard/generateIdCardPdf';
import { QueueService } from '../jobs/QueueService';
import { notificationService } from './notificationService';
import { settingsService } from './settingsService';
import { siteService } from './siteService';
import { NotFoundError, AppError } from '../errors/AppError';
import { ROLES, guardStatusLabel, EXITED_STATUSES, hasUsableId, idSummary,
  type UserRole, type GuardEmploymentStatus } from '@stap/shared';
import { generateGuardId } from '../lib/systemId';
import type {
  CreateGuardInput,
  UpdateGuardInput,
  GuardListQuery,
  GuardResponse,
  GuardRelativeResponse,
  GuardAssociateResponse,
  GuardRelativeInput,
  GuardAssociateInput,
  PaginatedResponse,
  DeploymentHistoryEntry,
  GuardDashboardStats,
  CreateGuardTransferInput,
  GuardTransferResponse,
  PromoteGuardInput,
  GuardPromotionResponse,
  GuardExportRow,
} from '@stap/shared';

// Roles allowed to see the accountNumber field
const ACCOUNT_VISIBLE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

class GuardService {
  // ── List ───────────────────────────────────────────────────────────────────

  async list(
    query: GuardListQuery,
    requestingUserRole: UserRole,
  ): Promise<PaginatedResponse<GuardResponse>> {
    const { page, limit, search, status, rank, contractType, probationStatus, nidStatus, idType, isIncompleteNID, onLeave, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: import('@prisma/client').Prisma.GuardWhereInput = {};

    if (status) {
      where.employmentStatus = status;
    }

    if (rank) {
      where.rank = rank;
    }

    if (contractType) {
      where.contractType = contractType;
    }

    if (probationStatus) {
      where.probationStatus = probationStatus;
    }

    // 'NONE' is how the UI asks for guards with no document at all.
    if (idType === 'NONE') {
      where.idType = null;
    } else if (idType) {
      where.idType = idType;
    }

    if (nidStatus === 'PENDING') {
      where.isIncompleteNID = true;
    } else if (nidStatus === 'PROVIDED') {
      where.isIncompleteNID = false;
    }

    if (isIncompleteNID !== undefined) {
      where.isIncompleteNID = isIncompleteNID;
    }

    if (onLeave !== undefined) {
      const today = new Date();
      where.leaveRequests = onLeave
        ? { some: { status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } } }
        : { none: { status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } } };
    }

    if (search) {
      where.OR = [
        { firstName:  { contains: search, mode: 'insensitive' } },
        { lastName:   { contains: search, mode: 'insensitive' } },
        { nationalId: { contains: search, mode: 'insensitive' } },
        { phone:      { contains: search, mode: 'insensitive' } },
        { systemId:   { contains: search, mode: 'insensitive' } },
      ];
    }

    const [guards, total] = await Promise.all([
      prisma.guard.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              deployments: true,
              attendance: true,
              disciplinary: true,
              documents: true,
            },
          },
        },
      }),
      prisma.guard.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: guards.map((g) => this.sanitiseGuard(g, requestingUserRole, true)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  // ── Get by ID ──────────────────────────────────────────────────────────────

  async getById(id: string, requestingUserRole: UserRole): Promise<GuardResponse> {
    const guard = await prisma.guard.findUnique({
      where: { id },
      include: {
        documents: {
          where: { deletedAt: null },
          orderBy: { uploadedAt: 'desc' },
          take: 5,
          include: { uploader: { select: { name: true } } },
        },
        deploymentHistory: {
          orderBy: { startDate: 'desc' },
          take: 3,
          include: {
            site: { select: { siteName: true, client: { select: { clientName: true } } } },
            supervisor: { select: { name: true } },
          },
        },
        relatives: { orderBy: { createdAt: 'asc' } },
        associates: { orderBy: { createdAt: 'asc' } },
        // The login, when there is one — drives the System Access panel.
        user: { select: { id: true, email: true, status: true } },
        disciplinary: {
          where:   { type: 'SUSPENSION' },
          orderBy: { incidentDate: 'desc' },
          take:    1,
          include: { officer: { select: { name: true } } },
        },
        _count: {
          select: {
            deployments: true,
            attendance: true,
            disciplinary: true,
            documents: true,
          },
        },
      },
    });

    if (!guard) throw new NotFoundError('Guard not found');

    return this.sanitiseGuard(guard, requestingUserRole, false);
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(data: CreateGuardInput, createdBy: string): Promise<GuardResponse> {
    if (data.nationalId) {
      const existing = await prisma.guard.findUnique({
        where: { nationalId: data.nationalId },
        select: { id: true },
      });
      if (existing) {
        throw new AppError('A guard with this National ID already exists', 409);
      }
    }

    // TODO Sprint 3 security: replace with AES-256 encryption using the
    // encryption service — never store plaintext bank account numbers
    const accountNumber = data.accountNumber ? '[ENCRYPTED]' : undefined;

    const { vettingData, ...guardFields } = data;

    // Auto-fill salary from rank's defaultSalary when no explicit salary provided
    let effectiveSalary = guardFields.salaryRate;
    if (guardFields.rank && effectiveSalary === undefined) {
      const matchedRank = await prisma.guardRank.findFirst({ where: { name: guardFields.rank } });
      if (matchedRank?.defaultSalary != null) {
        effectiveSalary = matchedRank.defaultSalary;
      }
    }

    const systemId = await generateGuardId();

    const guard = await prisma.guard.create({
      data: {
        systemId,
        firstName:   guardFields.firstName,
        lastName:    guardFields.lastName,
        otherNames:  guardFields.otherNames,
        nationalId:  guardFields.nationalId,
        idType:           guardFields.idType ?? null,
        relativeIdName:   guardFields.relativeIdName ?? null,
        relativeIdNumber: guardFields.relativeIdNumber ?? null,
        otherDocType:     guardFields.otherDocType ?? null,
        otherDocNumber:   guardFields.otherDocNumber ?? null,
        phone:       guardFields.phone,
        dateOfBirth: new Date(guardFields.dateOfBirth),
        nextOfKinName:  guardFields.nextOfKinName,
        nextOfKinPhone: guardFields.nextOfKinPhone,
        bankName:    guardFields.bankName,
        accountNumber,
        salaryRate:    effectiveSalary,
        contractStart: new Date(guardFields.contractStart),
        contractEnd:   guardFields.contractEnd ? new Date(guardFields.contractEnd) : undefined,
        psoCertNumber: guardFields.psoCertNumber,
        // Section A
        gender:                  guardFields.gender,
        tribe:                   guardFields.tribe,
        placeOfBirth:            guardFields.placeOfBirth,
        educationLevel:          guardFields.educationLevel,
        rank:                    guardFields.rank ?? 'GUARD',
        contractType:            guardFields.contractType ?? 'PERMANENT',
        // Not "has no NIN" — "has nothing that identifies them". This flag blocks
        // deployment, so keying it to the national ID would leave a guard on a
        // relative's card or a student document undeployable, which is the exact
        // situation the other types exist to solve.
        isIncompleteNID:         !hasUsableId(guardFields),
        probationStatus:         'ON_PROBATION',
        probationEndDate:        data.probationEndDate ? new Date(data.probationEndDate) : undefined,
        registeredNames:         guardFields.registeredNames,
        maritalStatus:           guardFields.maritalStatus,
        spouseName:              guardFields.spouseName,
        spouseWorkplace:         guardFields.spouseWorkplace,
        spouseTelephone:         guardFields.spouseTelephone,
        preferredPaymentContact: guardFields.preferredPaymentContact,
        mobileNetwork:           guardFields.mobileNetwork,
        momoAccountName:         guardFields.momoAccountName,
        // Section A Address
        village:   guardFields.village,
        parish:    guardFields.parish,
        subCounty: guardFields.subCounty,
        county:    guardFields.county,
        district:  guardFields.district,
        // Section B
        lc1Zone:            guardFields.lc1Zone,
        lcOfficialName:     guardFields.lcOfficialName,
        lcOfficialPosition: guardFields.lcOfficialPosition,
        lcOfficialPhone:    guardFields.lcOfficialPhone,
        nssfNumber:         guardFields.nssfNumber,
        tinNumber:          guardFields.tinNumber,
        previousEmployer:   guardFields.previousEmployer,
        previousPosition:   guardFields.previousPosition,
        talentsExperience:  guardFields.talentsExperience,
        // Section C: Father
        fatherName:        guardFields.fatherName,
        fatherResidence:   guardFields.fatherResidence,
        fatherVillage:     guardFields.fatherVillage,
        fatherParish:      guardFields.fatherParish,
        fatherSubCounty:   guardFields.fatherSubCounty,
        fatherCounty:      guardFields.fatherCounty,
        fatherDistrict:    guardFields.fatherDistrict,
        fatherNationality: guardFields.fatherNationality,
        fatherOccupation:  guardFields.fatherOccupation,
        fatherPhone:       guardFields.fatherPhone,
        // Section C: Mother
        motherName:        guardFields.motherName,
        motherResidence:   guardFields.motherResidence,
        motherVillage:     guardFields.motherVillage,
        motherParish:      guardFields.motherParish,
        motherSubCounty:   guardFields.motherSubCounty,
        motherCounty:      guardFields.motherCounty,
        motherDistrict:    guardFields.motherDistrict,
        motherNationality: guardFields.motherNationality,
        motherOccupation:  guardFields.motherOccupation,
        motherPhone:       guardFields.motherPhone,
        // Section C: Dependents
        numberOfDependents: guardFields.numberOfDependents,
        // Section D: Health
        hasDisability:     guardFields.hasDisability,
        disabilityDetails: guardFields.disabilityDetails,
        takesAlcohol:      guardFields.takesAlcohol,
        hasAllergies:      guardFields.hasAllergies,
        allergyDetails:    guardFields.allergyDetails,
      },
      include: {
        relatives:  { orderBy: { createdAt: 'asc' } },
        associates: { orderBy: { createdAt: 'asc' } },
        _count: {
          select: { deployments: true, attendance: true, disciplinary: true, documents: true },
        },
      },
    });

    // Create relatives and associates if provided
    if (vettingData?.relatives?.length) {
      await prisma.guardRelative.createMany({
        data: vettingData.relatives.map((r) => ({ ...r, guardId: guard.id })),
      });
    }
    if (vettingData?.associates?.length) {
      await prisma.guardAssociate.createMany({
        data: vettingData.associates.map((a) => ({ ...a, guardId: guard.id })),
      });
    }


    // Auto-calculate probation end date: 6 months from contract start
    const probationEndDate = new Date(guard.contractStart);
    probationEndDate.setMonth(probationEndDate.getMonth() + 6);
    await prisma.guard.update({
      where: { id: guard.id },
      data: { probationEndDate },
    });

    await QueueService.logAudit({
      userId: createdBy,
      action: 'GUARD_CREATED',
      entity: 'guard',
      entityId: guard.id,
      newValue: { firstName: guard.firstName, lastName: guard.lastName, nationalId: guard.nationalId },
    });

    // Re-fetch to get the newly created relatives/associates
    return this.getById(guard.id, ROLES.DIRECTOR);
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(id: string, data: UpdateGuardInput, updatedBy: string): Promise<GuardResponse> {
    const existing = await prisma.guard.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Guard not found');

    // Check nationalId uniqueness when changing it
    if (data.nationalId && data.nationalId !== existing.nationalId) {
      const conflict = await prisma.guard.findUnique({
        where: { nationalId: data.nationalId },
        select: { id: true },
      });
      if (conflict) throw new AppError('A guard with this National ID already exists', 409);
    }


    const { vettingData, ...guardFields } = data;

    const updateData: Parameters<typeof prisma.guard.update>[0]['data'] = {};

    // Existing fields
    if (guardFields.firstName !== undefined)    updateData.firstName    = guardFields.firstName;
    if (guardFields.lastName !== undefined)     updateData.lastName     = guardFields.lastName;
    if (guardFields.otherNames !== undefined)   updateData.otherNames   = guardFields.otherNames;
    if (guardFields.nationalId !== undefined)   updateData.nationalId   = guardFields.nationalId ?? null;
    // Explicit flag from form, or auto-clear when an NID is now being provided
    // Any change to the identification re-derives whether the guard counts as
    // documented, so adding a relative's card to an existing record is what
    // makes them deployable rather than a separate step someone must remember.
    for (const f of ['idType', 'relativeIdName', 'relativeIdNumber', 'otherDocType', 'otherDocNumber'] as const) {
      if ((guardFields as Record<string, unknown>)[f] !== undefined) {
        updateData[f] = (guardFields as Record<string, unknown>)[f] as never;
      }
    }
    if (['idType', 'nationalId', 'relativeIdName', 'otherDocType']
      .some((f) => (guardFields as Record<string, unknown>)[f] !== undefined)) {
      updateData.isIncompleteNID = !hasUsableId({
        idType:         (updateData.idType         ?? existing.idType) as string | null,
        nationalId:     (updateData.nationalId     ?? existing.nationalId) as string | null,
        relativeIdName: (updateData.relativeIdName ?? existing.relativeIdName) as string | null,
        otherDocType:   (updateData.otherDocType   ?? existing.otherDocType) as string | null,
      });
    }

    if ((guardFields as Record<string, unknown>).isIncompleteNID !== undefined) {
      updateData.isIncompleteNID = (guardFields as Record<string, unknown>).isIncompleteNID as boolean;
    } else if (guardFields.nationalId && existing.isIncompleteNID) {
      updateData.isIncompleteNID = false;
    }
    if (guardFields.phone !== undefined)        updateData.phone        = guardFields.phone;
    if (guardFields.dateOfBirth !== undefined)  updateData.dateOfBirth  = new Date(guardFields.dateOfBirth);
    if (guardFields.nextOfKinName !== undefined)  updateData.nextOfKinName  = guardFields.nextOfKinName;
    if (guardFields.nextOfKinPhone !== undefined) updateData.nextOfKinPhone = guardFields.nextOfKinPhone;
    if (guardFields.bankName !== undefined)     updateData.bankName     = guardFields.bankName;
    if (guardFields.accountNumber !== undefined) {
      updateData.accountNumber = guardFields.accountNumber ? '[ENCRYPTED]' : null;
    }
    if (guardFields.salaryRate !== undefined)    updateData.salaryRate    = guardFields.salaryRate;
    if (guardFields.contractStart !== undefined) updateData.contractStart = new Date(guardFields.contractStart);
    if (guardFields.contractEnd !== undefined)
      updateData.contractEnd = guardFields.contractEnd ? new Date(guardFields.contractEnd) : null;
    if (guardFields.psoCertNumber !== undefined) updateData.psoCertNumber = guardFields.psoCertNumber;

    // Section A
    if (guardFields.gender !== undefined)                  updateData.gender                  = guardFields.gender;
    if (guardFields.tribe !== undefined)                   updateData.tribe                   = guardFields.tribe;
    if (guardFields.placeOfBirth !== undefined)            updateData.placeOfBirth            = guardFields.placeOfBirth;
    if (guardFields.educationLevel !== undefined)          updateData.educationLevel          = guardFields.educationLevel;
    if (guardFields.rank !== undefined)                    updateData.rank                    = guardFields.rank;
    // Auto-fill salary when rank changes and no explicit salary included in this request
    if (guardFields.rank !== undefined && guardFields.rank !== existing.rank && guardFields.salaryRate === undefined) {
      const matchedRank = await prisma.guardRank.findFirst({ where: { name: guardFields.rank } });
      if (matchedRank?.defaultSalary != null) {
        updateData.salaryRate = matchedRank.defaultSalary;
      }
    }
    if (guardFields.contractType !== undefined)              updateData.contractType              = guardFields.contractType;
    if (guardFields.probationStatus !== undefined)           updateData.probationStatus           = guardFields.probationStatus;
    if (guardFields.probationEndDate !== undefined)
      updateData.probationEndDate = guardFields.probationEndDate ? new Date(guardFields.probationEndDate) : null;
    if (guardFields.registeredNames !== undefined)         updateData.registeredNames         = guardFields.registeredNames;
    if (guardFields.maritalStatus !== undefined)           updateData.maritalStatus           = guardFields.maritalStatus;
    if (guardFields.spouseName !== undefined)              updateData.spouseName              = guardFields.spouseName;
    if (guardFields.spouseWorkplace !== undefined)         updateData.spouseWorkplace         = guardFields.spouseWorkplace;
    if (guardFields.spouseTelephone !== undefined)         updateData.spouseTelephone         = guardFields.spouseTelephone;
    if (guardFields.preferredPaymentContact !== undefined) updateData.preferredPaymentContact = guardFields.preferredPaymentContact;
    // Address
    if (guardFields.village !== undefined)   updateData.village   = guardFields.village;
    if (guardFields.parish !== undefined)    updateData.parish    = guardFields.parish;
    if (guardFields.subCounty !== undefined) updateData.subCounty = guardFields.subCounty;
    if (guardFields.county !== undefined)    updateData.county    = guardFields.county;
    if (guardFields.district !== undefined)  updateData.district  = guardFields.district;
    // Section B
    if (guardFields.lc1Zone !== undefined)            updateData.lc1Zone            = guardFields.lc1Zone;
    if (guardFields.lcOfficialName !== undefined)     updateData.lcOfficialName     = guardFields.lcOfficialName;
    if (guardFields.lcOfficialPosition !== undefined) updateData.lcOfficialPosition = guardFields.lcOfficialPosition;
    if (guardFields.lcOfficialPhone !== undefined)    updateData.lcOfficialPhone    = guardFields.lcOfficialPhone;
    if (guardFields.nssfNumber !== undefined)         updateData.nssfNumber         = guardFields.nssfNumber;
    if (guardFields.tinNumber !== undefined)          updateData.tinNumber          = guardFields.tinNumber;
    if (guardFields.previousEmployer !== undefined)   updateData.previousEmployer   = guardFields.previousEmployer;
    if (guardFields.previousPosition !== undefined)   updateData.previousPosition   = guardFields.previousPosition;
    if (guardFields.talentsExperience !== undefined)  updateData.talentsExperience  = guardFields.talentsExperience;
    // Father
    if (guardFields.fatherName !== undefined)        updateData.fatherName        = guardFields.fatherName;
    if (guardFields.fatherResidence !== undefined)   updateData.fatherResidence   = guardFields.fatherResidence;
    if (guardFields.fatherVillage !== undefined)     updateData.fatherVillage     = guardFields.fatherVillage;
    if (guardFields.fatherParish !== undefined)      updateData.fatherParish      = guardFields.fatherParish;
    if (guardFields.fatherSubCounty !== undefined)   updateData.fatherSubCounty   = guardFields.fatherSubCounty;
    if (guardFields.fatherCounty !== undefined)      updateData.fatherCounty      = guardFields.fatherCounty;
    if (guardFields.fatherDistrict !== undefined)    updateData.fatherDistrict    = guardFields.fatherDistrict;
    if (guardFields.fatherNationality !== undefined) updateData.fatherNationality = guardFields.fatherNationality;
    if (guardFields.fatherOccupation !== undefined)  updateData.fatherOccupation  = guardFields.fatherOccupation;
    if (guardFields.fatherPhone !== undefined)       updateData.fatherPhone       = guardFields.fatherPhone;
    // Mother
    if (guardFields.motherName !== undefined)        updateData.motherName        = guardFields.motherName;
    if (guardFields.motherResidence !== undefined)   updateData.motherResidence   = guardFields.motherResidence;
    if (guardFields.motherVillage !== undefined)     updateData.motherVillage     = guardFields.motherVillage;
    if (guardFields.motherParish !== undefined)      updateData.motherParish      = guardFields.motherParish;
    if (guardFields.motherSubCounty !== undefined)   updateData.motherSubCounty   = guardFields.motherSubCounty;
    if (guardFields.motherCounty !== undefined)      updateData.motherCounty      = guardFields.motherCounty;
    if (guardFields.motherDistrict !== undefined)    updateData.motherDistrict    = guardFields.motherDistrict;
    if (guardFields.motherNationality !== undefined) updateData.motherNationality = guardFields.motherNationality;
    if (guardFields.motherOccupation !== undefined)  updateData.motherOccupation  = guardFields.motherOccupation;
    if (guardFields.motherPhone !== undefined)       updateData.motherPhone       = guardFields.motherPhone;
    // Dependents
    if (guardFields.numberOfDependents !== undefined) updateData.numberOfDependents = guardFields.numberOfDependents;
    // Health
    if (guardFields.hasDisability !== undefined)     updateData.hasDisability     = guardFields.hasDisability;
    if (guardFields.disabilityDetails !== undefined) updateData.disabilityDetails = guardFields.disabilityDetails;
    if (guardFields.takesAlcohol !== undefined)      updateData.takesAlcohol      = guardFields.takesAlcohol;
    if (guardFields.hasAllergies !== undefined)      updateData.hasAllergies      = guardFields.hasAllergies;
    if (guardFields.allergyDetails !== undefined)    updateData.allergyDetails    = guardFields.allergyDetails;

    await prisma.guard.update({
      where: { id },
      data: updateData,
    });

    // Handle vettingData if provided in the update
    if (vettingData) {
      await this.updateVettingData(
        id,
        vettingData.relatives ?? [],
        vettingData.associates ?? [],
        updatedBy,
      );
    }

    await QueueService.logAudit({
      userId: updatedBy,
      action: 'GUARD_UPDATED',
      entity: 'guard',
      entityId: id,
      oldValue: { firstName: existing.firstName, lastName: existing.lastName },
      newValue: { firstName: guardFields.firstName ?? existing.firstName, lastName: guardFields.lastName ?? existing.lastName },
    });

    return this.getById(id, ROLES.DIRECTOR);
  }

  // ── Update vetting data ────────────────────────────────────────────────────

  async updateVettingData(
    guardId: string,
    relatives: GuardRelativeInput[],
    associates: GuardAssociateInput[],
    updatedBy: string,
  ): Promise<void> {
    const guard = await prisma.guard.findUnique({ where: { id: guardId }, select: { id: true } });
    if (!guard) throw new NotFoundError('Guard not found');

    await prisma.$transaction([
      prisma.guardRelative.deleteMany({ where: { guardId } }),
      ...(relatives.length
        ? [prisma.guardRelative.createMany({
            data: relatives.slice(0, 3).map((r) => ({ ...r, guardId })),
          })]
        : []),
      prisma.guardAssociate.deleteMany({ where: { guardId } }),
      ...(associates.length
        ? [prisma.guardAssociate.createMany({
            data: associates.slice(0, 2).map((a) => ({ ...a, guardId })),
          })]
        : []),
    ]);

    await QueueService.logAudit({
      userId:   updatedBy,
      action:   'VETTING_DATA_UPDATED',
      entity:   'guard',
      entityId: guardId,
      newValue: { relativesCount: relatives.length, associatesCount: associates.length },
    });
  }

  // ── Update status ──────────────────────────────────────────────────────────

  async updateStatus(
    id: string,
    status: string,
    reason: string,
    updatedBy: string,
  ): Promise<GuardResponse> {
    const guard = await prisma.guard.findUnique({ where: { id } });
    if (!guard) throw new NotFoundError('Guard not found');

    const previousStatus = guard.employmentStatus;

    // Resigning ends employment just as termination does, so close the contract
    // for both. Suspension and leave are temporary and leave it open.
    const contractEnd =
      EXITED_STATUSES.includes(status as GuardEmploymentStatus) && !guard.contractEnd
        ? new Date()
        : guard.contractEnd;

    const updated = await prisma.guard.update({
      where: { id },
      data: {
        employmentStatus: status as GuardEmploymentStatus,
        ...(contractEnd !== guard.contractEnd && { contractEnd }),
      },
      include: {
        relatives:  { orderBy: { createdAt: 'asc' } },
        associates: { orderBy: { createdAt: 'asc' } },
        _count: {
          select: { deployments: true, attendance: true, disciplinary: true, documents: true },
        },
      },
    });

    if (status === 'SUSPENDED' || status === 'TERMINATED') {
      await prisma.disciplinaryRecord.create({
        data: {
          guardId: id,
          incidentDate: new Date(),
          type: status === 'SUSPENDED' ? 'SUSPENSION' : 'TERMINATION',
          officerId: updatedBy,
          reason,
          outcome: `Employment status changed to ${status} via management action`,
        },
      });
    }

    await QueueService.logAudit({
      userId: updatedBy,
      action: 'GUARD_STATUS_CHANGED',
      entity: 'guard',
      entityId: id,
      oldValue: { status: previousStatus },
      newValue: { status, reason },
    });

    return this.sanitiseGuard(updated, ROLES.DIRECTOR, false);
  }

  // ── Upload photo ───────────────────────────────────────────────────────────

  async uploadPhoto(id: string, filePath: string, updatedBy: string): Promise<GuardResponse> {
    const guard = await prisma.guard.findUnique({ where: { id } });
    if (!guard) throw new NotFoundError('Guard not found');

    const photoUrl = `/uploads/${filePath.replace(/.*public\/uploads\//, '')}`;

    const updated = await prisma.guard.update({
      where: { id },
      data: { photoUrl },
      include: {
        relatives:  { orderBy: { createdAt: 'asc' } },
        associates: { orderBy: { createdAt: 'asc' } },
        _count: {
          select: { deployments: true, attendance: true, disciplinary: true, documents: true },
        },
      },
    });

    await QueueService.logAudit({
      userId: updatedBy,
      action: 'GUARD_PHOTO_UPDATED',
      entity: 'guard',
      entityId: id,
    });

    return this.sanitiseGuard(updated, ROLES.DIRECTOR, false);
  }

  // ── Deployment history ─────────────────────────────────────────────────────

  async getDeploymentHistory(
    guardId: string,
    query: { page: number; limit: number },
  ): Promise<PaginatedResponse<DeploymentHistoryEntry>> {
    const guard = await prisma.guard.findUnique({ where: { id: guardId }, select: { id: true } });
    if (!guard) throw new NotFoundError('Guard not found');

    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      prisma.deploymentHistory.findMany({
        where: { guardId },
        orderBy: { startDate: 'desc' },
        skip,
        take: limit,
        include: {
          site: {
            select: {
              id: true,
              siteName: true,
              client: { select: { clientName: true } },
            },
          },
          supervisor: { select: { name: true } },
        },
      }),
      prisma.deploymentHistory.count({ where: { guardId } }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: records.map((r) => ({
        id: r.id,
        site: { id: r.site.id, siteName: r.site.siteName },
        client: { clientName: r.site.client.clientName },
        shiftType: r.shiftType,
        startDate: r.startDate.toISOString(),
        endDate: r.endDate ? r.endDate.toISOString() : null,
        supervisor: { name: r.supervisor.name },
        createdAt: r.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  // ── Private: sanitise ──────────────────────────────────────────────────────

  private computeNextIncrementDate(
    contractStart:         Date | null,
    lastIncrementDate:     Date | null,
    effectiveServiceStart: Date | null = null,
  ): string | null {
    // Use effectiveServiceStart when set (reinstated guard), else fall back to contractStart
    const anchor = effectiveServiceStart ?? contractStart;
    if (!anchor) return null;
    const base = lastIncrementDate ? new Date(lastIncrementDate) : new Date(anchor);
    const next = new Date(base);
    next.setFullYear(next.getFullYear() + 1);
    const today = new Date();
    return next < today ? today.toISOString() : next.toISOString();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  /**
   * How the active workforce is documented.
   *
   * Counts only ACTIVE guards: an exited guard's paperwork is history, and
   * including them would make the figures answer a question nobody asked.
   */
  /**
   * Every guard, for the spreadsheet export. Not paginated on purpose: the
   * point of the export is the whole roll, and paging it would reintroduce the
   * cut-off the caller is trying to escape.
   *
   * The open deployment record (the one with no end date) is what says where a
   * guard is now, the same rule the profile uses, so a transfer moves them here
   * without a second column to keep in step.
   */
  async listForExport(): Promise<GuardExportRow[]> {
    const guards = await prisma.guard.findMany({
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: {
        deploymentHistory: {
          where:  { endDate: null },
          take:   1,
          select: {
            site: {
              select: {
                siteName: true,
                client: { select: { clientName: true } },
                zone:   { select: { name: true } },
              },
            },
          },
        },
      },
    });

    const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

    return guards.map((g) => {
      const site = g.deploymentHistory[0]?.site ?? null;
      return {
        systemId:         g.systemId,
        firstName:        g.firstName,
        lastName:         g.lastName,
        otherNames:       g.otherNames,
        fullName:         [g.firstName, g.otherNames, g.lastName].filter(Boolean).join(' '),
        gender:           g.gender,
        dateOfBirth:      iso(g.dateOfBirth),
        nationalId:       g.nationalId,
        idType:           g.idType,
        phone:            g.phone,
        rank:             g.rank,
        employmentStatus: g.employmentStatus,
        contractType:     g.contractType,
        probationStatus:  g.probationStatus,
        salaryRate:       g.salaryRate,
        currentSiteName:  site?.siteName ?? null,
        clientName:       site?.client?.clientName ?? null,
        zoneName:         site?.zone?.name ?? null,
        nextOfKinName:    g.nextOfKinName,
        nextOfKinPhone:   g.nextOfKinPhone,
        district:         g.district,
        contractStart:    g.contractStart.toISOString(),
        contractEnd:      iso(g.contractEnd),
        createdAt:        g.createdAt.toISOString(),
      };
    });
  }

  async getIdStats() {
    const where = { employmentStatus: 'ACTIVE' as const };
    const [total, ownId, relativeId, otherDoc] = await Promise.all([
      prisma.guard.count({ where }),
      prisma.guard.count({ where: { ...where, idType: 'OWN_ID' } }),
      prisma.guard.count({ where: { ...where, idType: 'RELATIVE_ID' } }),
      prisma.guard.count({ where: { ...where, idType: 'OTHER_DOCUMENT' } }),
    ]);
    // Whatever is left is undocumented — derived rather than counted separately,
    // so the four figures always add up to the total even if a row carries an
    // idType this build does not know.
    const noId = total - ownId - relativeId - otherDoc;
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

    return {
      total, ownId, relativeId, otherDoc, noId,
      ownIdPct:      pct(ownId),
      relativeIdPct: pct(relativeId),
      otherDocPct:   pct(otherDoc),
      noIdPct:       pct(noId),
    };
  }

  sanitiseGuard(guard: any, role?: UserRole, listMode = false): GuardResponse {
    const showAccountNumber = !listMode && role && ACCOUNT_VISIBLE_ROLES.includes(role);

    const fullName = [guard.firstName, guard.otherNames, guard.lastName]
      .filter(Boolean)
      .join(' ');

    const relatives: GuardRelativeResponse[] = (guard.relatives ?? []).map((r: any) => ({
      id:              r.id,
      relativeName:    r.relativeName,
      phone:           r.phone ?? null,
      relationship:    r.relationship ?? null,
      occupation:      r.occupation ?? null,
      placeOfResidence:r.placeOfResidence ?? null,
      createdAt:       r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));

    const associates: GuardAssociateResponse[] = (guard.associates ?? []).map((a: any) => ({
      id:           a.id,
      associateName:a.associateName,
      placeOfWork:  a.placeOfWork ?? null,
      workDetails:  a.workDetails ?? null,
      residence:    a.residence ?? null,
      phone:        a.phone ?? null,
      createdAt:    a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
    }));

    const response: GuardResponse = {
      id:        guard.id,
      systemId:  guard.systemId ?? null,
      firstName: guard.firstName,
      lastName:  guard.lastName,
      otherNames:guard.otherNames ?? null,
      fullName,
      idType:           guard.idType ?? null,
      nationalId:       guard.nationalId ?? null,
      relativeIdName:   guard.relativeIdName ?? null,
      relativeIdNumber: guard.relativeIdNumber ?? null,
      otherDocType:     guard.otherDocType ?? null,
      otherDocNumber:   guard.otherDocNumber ?? null,
      // Built once here so a list, a profile and a print all say the same thing.
      idSummary:        idSummary(guard),
      isIncompleteNID: guard.isIncompleteNID ?? false,
      phone:     guard.phone,
      photoUrl:  guard.photoUrl ?? null,
      dateOfBirth: guard.dateOfBirth instanceof Date
        ? guard.dateOfBirth.toISOString()
        : guard.dateOfBirth,
      nextOfKinName:  guard.nextOfKinName,
      nextOfKinPhone: guard.nextOfKinPhone,
      bankName:       guard.bankName ?? null,
      salaryRate:     guard.salaryRate,
      employmentStatus: guard.employmentStatus,
      contractStart: guard.contractStart instanceof Date
        ? guard.contractStart.toISOString()
        : guard.contractStart,
      contractEnd: guard.contractEnd
        ? guard.contractEnd instanceof Date
          ? guard.contractEnd.toISOString()
          : guard.contractEnd
        : null,
      psoCertNumber: guard.psoCertNumber ?? null,
      createdAt: guard.createdAt instanceof Date
        ? guard.createdAt.toISOString()
        : guard.createdAt,
      updatedAt: guard.updatedAt instanceof Date
        ? guard.updatedAt.toISOString()
        : guard.updatedAt,

      // Section A
      gender:                  guard.gender ?? null,
      tribe:                   guard.tribe ?? null,
      placeOfBirth:            guard.placeOfBirth ?? null,
      educationLevel:          guard.educationLevel ?? null,
      rank:                    guard.rank ?? 'GUARD',
      contractType:            guard.contractType ?? 'PERMANENT',
      probationStatus:         guard.probationStatus ?? 'ON_PROBATION',
      probationEndDate:        guard.probationEndDate
        ? guard.probationEndDate instanceof Date
          ? guard.probationEndDate.toISOString()
          : guard.probationEndDate
        : null,
      reinstatedCount:         (guard as any).reinstatedCount ?? 0,
      lastReinstatedAt:        (guard as any).lastReinstatedAt
        ? (guard as any).lastReinstatedAt instanceof Date
          ? (guard as any).lastReinstatedAt.toISOString()
          : (guard as any).lastReinstatedAt
        : null,
      lastReinstatedBy:        (guard as any).lastReinstatedBy ?? null,
      registeredNames:         guard.registeredNames ?? null,
      maritalStatus:           guard.maritalStatus ?? null,
      spouseName:              guard.spouseName ?? null,
      spouseWorkplace:         guard.spouseWorkplace ?? null,
      spouseTelephone:         guard.spouseTelephone ?? null,
      preferredPaymentContact: guard.preferredPaymentContact ?? null,
      mobileNetwork:           guard.mobileNetwork ?? null,
      momoAccountName:         guard.momoAccountName ?? null,

      // Address
      village:   guard.village ?? null,
      parish:    guard.parish ?? null,
      subCounty: guard.subCounty ?? null,
      county:    guard.county ?? null,
      district:  guard.district ?? null,

      // Section B
      lc1Zone:            guard.lc1Zone ?? null,
      lcOfficialName:     guard.lcOfficialName ?? null,
      lcOfficialPosition: guard.lcOfficialPosition ?? null,
      lcOfficialPhone:    guard.lcOfficialPhone ?? null,
      nssfNumber:         guard.nssfNumber ?? null,
      tinNumber:          guard.tinNumber ?? null,
      previousEmployer:   guard.previousEmployer ?? null,
      previousPosition:   guard.previousPosition ?? null,
      talentsExperience:  guard.talentsExperience ?? null,

      // Father
      fatherName:        guard.fatherName ?? null,
      fatherResidence:   guard.fatherResidence ?? null,
      fatherVillage:     guard.fatherVillage ?? null,
      fatherParish:      guard.fatherParish ?? null,
      fatherSubCounty:   guard.fatherSubCounty ?? null,
      fatherCounty:      guard.fatherCounty ?? null,
      fatherDistrict:    guard.fatherDistrict ?? null,
      fatherNationality: guard.fatherNationality ?? null,
      fatherOccupation:  guard.fatherOccupation ?? null,
      fatherPhone:       guard.fatherPhone ?? null,

      // Mother
      motherName:        guard.motherName ?? null,
      motherResidence:   guard.motherResidence ?? null,
      motherVillage:     guard.motherVillage ?? null,
      motherParish:      guard.motherParish ?? null,
      motherSubCounty:   guard.motherSubCounty ?? null,
      motherCounty:      guard.motherCounty ?? null,
      motherDistrict:    guard.motherDistrict ?? null,
      motherNationality: guard.motherNationality ?? null,
      motherOccupation:  guard.motherOccupation ?? null,
      motherPhone:       guard.motherPhone ?? null,

      // Dependents
      numberOfDependents: guard.numberOfDependents ?? null,
      relatives,
      associates,

      // Health
      hasDisability:     guard.hasDisability ?? false,
      disabilityDetails: guard.disabilityDetails ?? null,
      takesAlcohol:      guard.takesAlcohol ?? false,
      hasAllergies:      guard.hasAllergies ?? false,
      allergyDetails:    guard.allergyDetails ?? null,

      // Salary increment tracking
      incrementCount:    guard.incrementCount ?? 0,
      lastIncrementDate: guard.lastIncrementDate instanceof Date
        ? guard.lastIncrementDate.toISOString()
        : (guard.lastIncrementDate ?? null),
      nextIncrementDate: this.computeNextIncrementDate(
        guard.contractStart instanceof Date ? guard.contractStart : (guard.contractStart ? new Date(guard.contractStart) : null),
        guard.lastIncrementDate instanceof Date ? guard.lastIncrementDate : (guard.lastIncrementDate ? new Date(guard.lastIncrementDate) : null),
        guard.effectiveServiceStart instanceof Date ? guard.effectiveServiceStart : (guard.effectiveServiceStart ? new Date(guard.effectiveServiceStart) : null),
      ),
      effectiveServiceStart: guard.effectiveServiceStart instanceof Date
        ? guard.effectiveServiceStart.toISOString()
        : (guard.effectiveServiceStart ?? null),
    };

    if (showAccountNumber) {
      response.accountNumber = guard.accountNumber ?? null;
    }

    if (guard.documents) {
      response.documents = guard.documents.map((d: any) => ({
        id:           d.id,
        documentType: d.documentType,
        filePath:     d.filePath,
        version:      d.version,
        uploadedAt:   d.uploadedAt instanceof Date ? d.uploadedAt.toISOString() : d.uploadedAt,
        uploadedBy:   { name: d.uploader?.name ?? '' },
        deletedAt:    d.deletedAt instanceof Date ? d.deletedAt.toISOString() : (d.deletedAt ?? null),
      }));
    }

    if (guard._count) {
      response._count = guard._count;
    }

    // Only on the profile — the list does not fetch the relation, and an
    // absent relation must not read as "access was revoked".
    if (!listMode && guard.user !== undefined) {
      response.systemAccess = guard.user
        ? { userId: guard.user.id, email: guard.user.email, status: guard.user.status }
        : null;
    }

    // "Where is this guard now" is the open deployment history record — the one
    // a transfer closes when it moves them on.
    if (guard.deploymentHistory) {
      const open = (guard.deploymentHistory as any[]).find((d) => !d.endDate);
      response.currentSiteId   = open?.siteId ?? null;
      response.currentSiteName = open?.site?.siteName ?? null;
    }

    if (guard.employmentStatus === 'SUSPENDED' && guard.disciplinary?.length) {
      const rec = guard.disciplinary[0];
      response.latestSuspension = {
        reason:      rec.reason,
        incidentDate: rec.incidentDate instanceof Date
          ? rec.incidentDate.toISOString()
          : rec.incidentDate,
        officerName: rec.officer?.name ?? 'Unknown',
      };
    } else {
      response.latestSuspension = null;
    }

    return response;
  }

  // ── Reinstate ──────────────────────────────────────────────────────────────

  async reinstateGuard(
    guardId: string,
    reason: string,
    reinstatedBy: string,
  ): Promise<GuardResponse> {
    const guard = await prisma.guard.findUnique({ where: { id: guardId } });
    if (!guard) throw new NotFoundError('Guard not found');
    // Reinstatement covers both lifting a suspension and rehiring someone who
    // left. A guard on leave returns by being set back to Active, not reinstated.
    if (!['SUSPENDED', 'RESIGNED', 'TERMINATED'].includes(guard.employmentStatus)) {
      throw new AppError(
        `${guard.firstName} ${guard.lastName} is currently ${guardStatusLabel(guard.employmentStatus)}. ` +
          'Only suspended, resigned or terminated guards can be reinstated.',
        400,
      );
    }

    const reinstatedAt = new Date();
    const nextIncrementDate = new Date(reinstatedAt);
    nextIncrementDate.setFullYear(nextIncrementDate.getFullYear() + 1);

    const updated = await prisma.guard.update({
      where: { id: guardId },
      data: {
        employmentStatus:     'ACTIVE',
        reinstatedCount:      guard.reinstatedCount + 1,
        lastReinstatedAt:     reinstatedAt,
        lastReinstatedBy:     reinstatedBy,
        // Reset service counting from reinstatement date
        effectiveServiceStart: reinstatedAt,
        incrementCount:        0,
        lastIncrementDate:     null,
      },
      include: {
        relatives:  { orderBy: { createdAt: 'asc' } },
        associates: { orderBy: { createdAt: 'asc' } },
        _count: {
          select: { deployments: true, attendance: true, disciplinary: true, documents: true },
        },
      },
    });

    await prisma.disciplinaryRecord.create({
      data: {
        guardId,
        type:         'REINSTATEMENT',
        incidentDate: reinstatedAt,
        reason,
        outcome: `Guard reinstated on ${reinstatedAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}. Service counting restarted from this date. Next salary increment (UGX 20,000) due on ${nextIncrementDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}.`,
        officerId:    reinstatedBy,
      },
    });

    await writeAuditLog({
        action:   'GUARD_REINSTATED',
        entity:   'guard',
        entityId: guardId,
        oldValue: {
          employmentStatus:      guard.employmentStatus,
          incrementCount:        guard.incrementCount,
          lastIncrementDate:     guard.lastIncrementDate,
          effectiveServiceStart: guard.effectiveServiceStart ?? guard.contractStart,
        },
        newValue: {
          employmentStatus:      'ACTIVE',
          reinstatedAt:          reinstatedAt,
          effectiveServiceStart: reinstatedAt,
          incrementCount:        0,
          reason,
        },
      });

    await notificationService.sendToRole({
      role:    ROLES.OPERATIONS_SUPERVISOR,
      type:    'SYSTEM',
      title:   'Guard Reinstated',
      message: `Guard ${guard.firstName} ${guard.lastName} has been reinstated and is now Active. Service counting restarted from ${reinstatedAt.toLocaleDateString('en-GB')}. Next salary increment due ${nextIncrementDate.toLocaleDateString('en-GB')}.`,
    });

    await notificationService.sendToRole({
      role:    ROLES.ASSISTANT_MANAGER,
      type:    'SYSTEM',
      title:   'Guard Reinstated',
      message: `Guard ${guard.firstName} ${guard.lastName} has been reinstated and is now Active. Service counting restarted from ${reinstatedAt.toLocaleDateString('en-GB')}. Next salary increment due ${nextIncrementDate.toLocaleDateString('en-GB')}.`,
    });

    console.log(`✅ Guard reinstated: ${guard.firstName} ${guard.lastName}. effectiveServiceStart reset to ${reinstatedAt.toISOString()}. incrementCount reset to 0.`);

    return this.sanitiseGuard(updated, ROLES.DIRECTOR, false);
  }

  // ── Transfer ───────────────────────────────────────────────────────────────

  async transferGuard(
    guardId: string,
    data: CreateGuardTransferInput,
    authorisedBy: string,
  ): Promise<GuardTransferResponse> {
    const guard = await prisma.guard.findUnique({ where: { id: guardId } });
    if (!guard) throw new NotFoundError('Guard not found');
    if (guard.employmentStatus !== 'ACTIVE') {
      throw new AppError(
        `${guard.firstName} ${guard.lastName} cannot be transferred — current status is ` +
          `${guardStatusLabel(guard.employmentStatus)}. Only active guards can be transferred; ` +
          'a guard on leave should be transferred once they return.',
        400,
      );
    }

    // A transfer moves a guard FROM their current site TO a new one — they
    // must have an open (endDate: null) deployment history record to transfer from.
    const currentDeployment = await prisma.deploymentHistory.findFirst({
      where:   { guardId, endDate: null },
      orderBy: { startDate: 'desc' },
      include: { site: { select: { id: true, siteName: true, client: { select: { clientName: true } } } } },
    });
    if (!currentDeployment) {
      throw new AppError(
        `${guard.firstName} ${guard.lastName} is not currently deployed to any site. ` +
          'A transfer can only be made when a guard is actively deployed somewhere. ' +
          'Please deploy this guard to a site first, then transfer them from there.',
        400,
      );
    }
    if (data.fromSiteId && data.fromSiteId !== currentDeployment.siteId) {
      throw new AppError(
        `${guard.firstName} ${guard.lastName} is not currently deployed at the specified site. ` +
          `They are deployed at ${currentDeployment.site.siteName} (${currentDeployment.site.client.clientName}). ` +
          'Transfer must be from their current site.',
        400,
      );
    }
    const resolvedFromSiteId = data.fromSiteId ?? currentDeployment.siteId;
    if (data.toSiteId === resolvedFromSiteId) {
      throw new AppError('Cannot transfer a guard to the same site they are currently deployed at.', 400);
    }

    const toSite = await prisma.site.findUnique({
      where: { id: data.toSiteId },
      include: { client: { select: { clientName: true } } },
    });
    if (!toSite) throw new NotFoundError('Site not found');

    const transfer = await prisma.guardTransfer.create({
      data: {
        guardId,
        fromSiteId:   resolvedFromSiteId,
        toSiteId:     data.toSiteId,
        reason:       data.reason,
        transferDate: new Date(data.transferDate),
        authorisedBy,
      },
      include: {
        guard:            { select: { firstName: true, lastName: true, otherNames: true } },
        fromSite:         { include: { client: { select: { clientName: true } } } },
        toSite:           { include: { client: { select: { clientName: true } } } },
        authorisedByUser: { select: { name: true } },
      },
    });

    // Close out the old deployment record so `endDate: null` keeps meaning
    // "currently deployed here" (relied on by invoiceService and this check).
    await prisma.deploymentHistory.update({
      where: { id: currentDeployment.id },
      data:  { endDate: new Date(data.transferDate) },
    });

    // The new posting runs on whatever shift the destination site deploys on,
    // not an assumed day shift.
    const toSiteShift = await siteService.getShift(data.toSiteId);
    // A ShiftTypeConfig code, not an enum member — the site's configured shift
    // if it has one, falling back to DAY.
    const newShiftType = toSiteShift.shift ?? 'DAY';

    await prisma.deploymentHistory.create({
      data: {
        guardId,
        siteId:      data.toSiteId,
        startDate:   new Date(data.transferDate),
        shiftType:   newShiftType,
        supervisorId: authorisedBy,
      },
    });

    // Attendance has to follow the guard. Rosters are routinely built a week or
    // more ahead, so a transfer taking effect today leaves postings sitting at
    // the old site for dates the guard will not be there — they are moved to the
    // new site, while everything before the effective date stays put as history.
    const moved = await this.relocateAttendanceOnTransfer({
      guardId,
      fromSiteId:    resolvedFromSiteId,
      toSiteId:      data.toSiteId,
      effectiveDate: new Date(data.transferDate),
      shiftType:     newShiftType,
    });

    await notificationService.sendToRole({
      role:    ROLES.OPERATIONS_SUPERVISOR,
      type:    'SYSTEM',
      title:   'Guard Transferred',
      message: `Guard ${guard.firstName} ${guard.lastName} has been transferred to ${toSite.siteName}. Reason: ${data.reason}`,
    });

    await writeAuditLog({
        action:   'GUARD_TRANSFERRED',
        entity:   'guard',
        entityId: guardId,
        newValue: {
          fromSiteId:    resolvedFromSiteId,
          fromSiteName:  currentDeployment.site.siteName,
          toSiteId:      data.toSiteId,
          toSiteName:    toSite.siteName,
          effectiveDate: new Date(data.transferDate).toISOString(),
          transferredBy: authorisedBy,
          reason:        data.reason,
          deploymentsMoved: moved.deployments,
          attendanceMoved:  moved.attendance,
          attendanceDropped: moved.attendanceDropped,
        },
      });

    return this.mapTransferResponse(transfer);
  }

  /**
   * Moves a transferred guard's deployment and attendance rows from the old
   * site to the new one, for every date on or after the transfer takes effect.
   *
   * Deployment is unique per guard per day, so those rows simply repoint.
   * Attendance is unique per guard, site and day, so a row can collide with one
   * that already exists at the destination — the destination's own record is
   * the more specific of the two and wins; the stale row from the old site is
   * removed rather than repointed.
   */
  private async relocateAttendanceOnTransfer(args: {
    guardId:       string;
    fromSiteId:    string;
    toSiteId:      string;
    effectiveDate: Date;
    shiftType:     string;
  }): Promise<{ deployments: number; attendance: number; attendanceDropped: number }> {
    const from = new Date(args.effectiveDate);
    from.setUTCHours(0, 0, 0, 0);

    const scope = { guardId: args.guardId, siteId: args.fromSiteId, date: { gte: from } };

    const deployments = await prisma.deployment.updateMany({
      where: scope,
      data:  { siteId: args.toSiteId, shiftType: args.shiftType },
    });

    const [stale, existing] = await Promise.all([
      prisma.attendanceRecord.findMany({ where: scope, select: { id: true, date: true } }),
      prisma.attendanceRecord.findMany({
        where:  { guardId: args.guardId, siteId: args.toSiteId, date: { gte: from } },
        select: { date: true },
      }),
    ]);

    const alreadyAtNewSite = new Set(existing.map((a) => a.date.getTime()));
    const clashing = stale.filter((a) => alreadyAtNewSite.has(a.date.getTime()));
    const movable  = stale.filter((a) => !alreadyAtNewSite.has(a.date.getTime()));

    if (clashing.length) {
      await prisma.attendanceRecord.deleteMany({ where: { id: { in: clashing.map((a) => a.id) } } });
    }
    if (movable.length) {
      await prisma.attendanceRecord.updateMany({
        where: { id: { in: movable.map((a) => a.id) } },
        data:  { siteId: args.toSiteId },
      });
    }

    return {
      deployments:       deployments.count,
      attendance:        movable.length,
      attendanceDropped: clashing.length,
    };
  }

  async getTransferHistory(guardId: string): Promise<GuardTransferResponse[]> {
    const guard = await prisma.guard.findUnique({ where: { id: guardId }, select: { id: true } });
    if (!guard) throw new NotFoundError('Guard not found');

    const transfers = await prisma.guardTransfer.findMany({
      where:   { guardId },
      orderBy: { transferDate: 'desc' },
      include: {
        guard:            { select: { firstName: true, lastName: true, otherNames: true } },
        fromSite:         { include: { client: { select: { clientName: true } } } },
        toSite:           { include: { client: { select: { clientName: true } } } },
        authorisedByUser: { select: { name: true } },
      },
    });

    return transfers.map((t) => this.mapTransferResponse(t));
  }

  // ── Promotions ───────────────────────────────────────────────────────────────

  /**
   * Guard.rank stores GuardRank.name verbatim, but older records were seeded
   * with upper-snake values ("SENIOR_GUARD") while the rank is named
   * "Senior Guard". Comparing on a normalised form lets those guards be
   * promoted without a data backfill, and the promotion writes back the
   * canonical name.
   */
  private normaliseRank(rank: string): string {
    return rank.replace(/[\s_]+/g, '').toLowerCase();
  }

  async promoteGuard(
    guardId: string,
    data: PromoteGuardInput,
    promotedById: string,
  ): Promise<GuardPromotionResponse> {
    const guard = await prisma.guard.findUnique({
      where:  { id: guardId },
      select: { id: true, firstName: true, lastName: true, rank: true, salaryRate: true, employmentStatus: true },
    });
    if (!guard) throw new NotFoundError('Guard not found');

    // A guard on leave can still be promoted — the new rank applies when they
    // return. Suspended and exited guards cannot.
    if (guard.employmentStatus !== 'ACTIVE' && guard.employmentStatus !== 'ON_LEAVE') {
      throw new AppError(
        `${guard.firstName} ${guard.lastName} cannot be promoted — current status is ` +
          `${guardStatusLabel(guard.employmentStatus)}. Only active or on-leave guards can be promoted.`,
        400,
      );
    }
    if (!guard.rank) {
      throw new AppError(
        'This guard has no current rank assigned. Set a rank on their profile before promoting them.',
        400,
      );
    }
    if (this.normaliseRank(guard.rank) === this.normaliseRank(data.toRank)) {
      throw new AppError(
        `${guard.firstName} ${guard.lastName} already holds the rank "${guard.rank}". Choose a different rank.`,
        400,
      );
    }

    // Resolve against the rank list so a promotion can't invent a rank that
    // doesn't exist or point at one that has been retired.
    const ranks     = await prisma.guardRank.findMany({ select: { name: true, isActive: true } });
    const targetRank = ranks.find(r => this.normaliseRank(r.name) === this.normaliseRank(data.toRank));
    if (!targetRank) {
      throw new NotFoundError(`Rank "${data.toRank}" was not found. Choose a rank from the list.`);
    }
    if (!targetRank.isActive) {
      throw new AppError(`Rank "${targetRank.name}" is inactive and cannot be assigned.`, 400);
    }

    const fromSalary = guard.salaryRate;
    const toSalary   = data.newSalary;

    const [, promotion] = await prisma.$transaction([
      prisma.guard.update({
        where: { id: guardId },
        data:  { rank: targetRank.name, salaryRate: toSalary },
      }),
      prisma.guardPromotion.create({
        data: {
          guardId,
          fromRank:        guard.rank,
          toRank:          targetRank.name,
          fromSalary,
          toSalary,
          salaryIncrement: toSalary - fromSalary,
          reason:          data.reason ?? null,
          effectiveDate:   data.effectiveDate ? new Date(data.effectiveDate) : new Date(),
          promotedById,
        },
        include: { promotedByUser: { select: { id: true, name: true } } },
      }),
    ]);

    await writeAuditLog({
        userId:   promotedById,
        action:   'GUARD_PROMOTED',
        entity:   'guard',
        entityId: guardId,
        oldValue: { rank: guard.rank, salaryRate: fromSalary },
        newValue: { rank: targetRank.name, salaryRate: toSalary, increment: toSalary - fromSalary },
      });

    await notificationService.sendToRoles([ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER], {
      type:       'SYSTEM',
      title:      'Guard Promoted',
      message:
        `${guard.firstName} ${guard.lastName} has been promoted from ${guard.rank} to ` +
        `${targetRank.name}. New salary: UGX ${toSalary.toLocaleString()}.`,
      entityType: 'guard',
      entityId:   guardId,
    });

    return this.mapPromotionResponse(promotion);
  }

  async getPromotionHistory(guardId: string): Promise<GuardPromotionResponse[]> {
    const guard = await prisma.guard.findUnique({ where: { id: guardId }, select: { id: true } });
    if (!guard) throw new NotFoundError('Guard not found');

    const promotions = await prisma.guardPromotion.findMany({
      where:   { guardId },
      orderBy: { effectiveDate: 'desc' },
      include: { promotedByUser: { select: { id: true, name: true } } },
    });

    return promotions.map(p => this.mapPromotionResponse(p));
  }

  private mapPromotionResponse(promotion: any): GuardPromotionResponse {
    return {
      id:              promotion.id,
      guardId:         promotion.guardId,
      fromRank:        promotion.fromRank,
      toRank:          promotion.toRank,
      fromSalary:      promotion.fromSalary,
      toSalary:        promotion.toSalary,
      salaryIncrement: promotion.salaryIncrement,
      reason:          promotion.reason ?? null,
      effectiveDate:   promotion.effectiveDate.toISOString(),
      promotedBy:      { id: promotion.promotedByUser.id, name: promotion.promotedByUser.name },
      createdAt:       promotion.createdAt.toISOString(),
    };
  }

  private mapTransferResponse(transfer: any): GuardTransferResponse {
    const fullName = [transfer.guard.firstName, transfer.guard.otherNames, transfer.guard.lastName]
      .filter(Boolean)
      .join(' ');
    return {
      id:    transfer.id,
      guard: { id: transfer.guardId, fullName },
      fromSite: transfer.fromSite
        ? {
            id:         transfer.fromSite.id,
            siteName:   transfer.fromSite.siteName,
            clientName: transfer.fromSite.client?.clientName ?? '',
          }
        : null,
      toSite: {
        id:         transfer.toSite.id,
        siteName:   transfer.toSite.siteName,
        clientName: transfer.toSite.client?.clientName ?? '',
      },
      reason:       transfer.reason,
      transferDate: transfer.transferDate instanceof Date
        ? transfer.transferDate.toISOString()
        : transfer.transferDate,
      authorisedBy: {
        id:   transfer.authorisedBy,
        name: transfer.authorisedByUser.name,
      },
      createdAt: transfer.createdAt instanceof Date
        ? transfer.createdAt.toISOString()
        : transfer.createdAt,
    };
  }

  // ── Probation check ────────────────────────────────────────────────────────

  async runProbationCheck(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const eligible = await prisma.guard.findMany({
      where: {
        probationStatus:  'ON_PROBATION',
        probationEndDate: { lte: today },
        employmentStatus: 'ACTIVE',
      },
      select: {
        id:        true,
        firstName: true,
        lastName:  true,
      },
    });

    for (const guard of eligible) {
      await prisma.guard.update({
        where: { id: guard.id },
        data:  { probationStatus: 'CONFIRMED' },
      });

      await notificationService.sendToRole({
        role:    ROLES.ASSISTANT_MANAGER,
        type:    'SYSTEM',
        title:   'Probation Period Ended',
        message: `Guard ${guard.firstName} ${guard.lastName} has completed their probation period and is now Confirmed.`,
      });

      await writeAuditLog({
          action:   'PROBATION_COMPLETED',
          entity:   'guard',
          entityId: guard.id,
          newValue: { probationStatus: 'CONFIRMED' },
        });

      console.log(`✅ Probation confirmed: ${guard.firstName} ${guard.lastName}`);
    }

    console.log(`Probation check complete. ${eligible.length} guard(s) confirmed.`);
  }

  // ── Dashboard stats ────────────────────────────────────────────────────────

  async getDashboardStats(): Promise<GuardDashboardStats> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [
      statusCounts,
      deployedToday,
      absentToday,
      newThisMonth,
      expiringContracts,
      pendingDisciplinary,
      attendanceTrend,
      topSites,
    ] = await Promise.all([
      prisma.guard.groupBy({ by: ['employmentStatus'], _count: { id: true } }),
      prisma.deployment.count({ where: { date: todayStart } }),
      prisma.attendanceRecord.count({
        where: { date: todayStart, status: { in: ['ABSENT', 'AWOL'] } },
      }),
      prisma.guard.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.contract.count({
        where: {
          status:      { in: ['ACTIVE', 'EXPIRING'] },
          contractEnd: { gte: now, lte: thirtyDaysOut },
        },
      }),
      prisma.guard.count({ where: { employmentStatus: 'SUSPENDED' } }),
      prisma.$queryRaw<{ date: Date; present: bigint; absent: bigint; late: bigint; awol: bigint }[]>`
        SELECT
          DATE("date") AS date,
          COUNT(CASE WHEN status = 'PRESENT' THEN 1 END) AS present,
          COUNT(CASE WHEN status = 'ABSENT'  THEN 1 END) AS absent,
          COUNT(CASE WHEN status = 'LATE'    THEN 1 END) AS late,
          COUNT(CASE WHEN status = 'AWOL'    THEN 1 END) AS awol
        FROM "AttendanceRecord"
        WHERE "date" >= NOW() - INTERVAL '14 days'
        GROUP BY DATE("date")
        ORDER BY DATE("date") ASC
      `,
      prisma.deployment.groupBy({
        by:      ['siteId'],
        _count:  { id: true },
        where:   { date: { gte: monthStart } },
        orderBy: { _count: { id: 'desc' } },
        take:    5,
      }),
    ]);

    const siteIds = topSites.map((s) => s.siteId);
    const sites = siteIds.length
      ? await prisma.site.findMany({
          where:   { id: { in: siteIds } },
          include: { client: { select: { clientName: true } } },
        })
      : [];

    const byStatus = statusCounts.reduce(
      (acc, s) => { acc[s.employmentStatus] = s._count.id; return acc; },
      {} as Record<string, number>,
    );

    return {
      totalActive:         byStatus['ACTIVE']     ?? 0,
      totalSuspended:      byStatus['SUSPENDED']  ?? 0,
      totalTerminated:     byStatus['TERMINATED'] ?? 0,
      totalGuards:         statusCounts.reduce((sum, s) => sum + s._count.id, 0),
      expiringContracts,
      pendingDisciplinary,
      deployedToday,
      absentToday,
      newThisMonth,
      guardsByStatus: statusCounts.map((s) => ({
        status: s.employmentStatus,
        count:  s._count.id,
      })),
      attendanceTrend: attendanceTrend.map((r) => ({
        date:    r.date.toISOString().split('T')[0],
        present: Number(r.present),
        absent:  Number(r.absent),
        late:    Number(r.late),
        awol:    Number(r.awol),
      })),
      topSitesByDeployment: topSites.map((ts) => {
        const site = sites.find((s) => s.id === ts.siteId);
        return {
          siteName:   site?.siteName   ?? 'Unknown',
          clientName: site?.client.clientName ?? 'Unknown',
          count:      ts._count.id,
        };
      }),
    };
  }
  // ── Salary Increments ──────────────────────────────────────────────────────

  async runSalaryIncrements(): Promise<void> {
    const today = new Date();
    const todayMonth = today.getMonth();
    const todayDay   = today.getDate();
    const oneYearAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    const yearStart  = new Date(today.getFullYear(), 0, 1);

    // Fetch all active permanent guards who haven't been incremented this year
    // and whose effective service start (or contract start) is at least 1 year ago
    const candidates = await prisma.guard.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        contractType:     'PERMANENT',
        OR: [
          { lastIncrementDate: null },
          { lastIncrementDate: { lt: yearStart } },
        ],
      },
      select: {
        id:                    true,
        firstName:             true,
        lastName:              true,
        salaryRate:            true,
        incrementCount:        true,
        lastIncrementDate:     true,
        contractStart:         true,
        effectiveServiceStart: true,
      },
    });

    // Filter to those whose anniversary falls today
    const eligible = candidates.filter((guard) => {
      const serviceStart = guard.effectiveServiceStart ?? guard.contractStart;
      if (!serviceStart) return false;
      if (serviceStart > oneYearAgo) return false; // less than 1 year of service
      const anniversary = new Date(serviceStart);
      anniversary.setFullYear(today.getFullYear());
      return anniversary.getMonth() === todayMonth && anniversary.getDate() === todayDay;
    });

    for (const guard of eligible) {
      const increment = guard.incrementCount === 0 ? 20000 : 10000;
      const newSalary  = guard.salaryRate + increment;

      await prisma.guard.update({
        where: { id: guard.id },
        data: {
          salaryRate:        newSalary,
          incrementCount:    { increment: 1 },
          lastIncrementDate: today,
        },
      });

      await notificationService.sendToRole({
        role:    ROLES.ASSISTANT_MANAGER,
        type:    'SYSTEM',
        title:   'Salary Increment Applied',
        message: `Guard ${guard.firstName} ${guard.lastName}'s salary has been incremented from UGX ${guard.salaryRate.toLocaleString()} to UGX ${newSalary.toLocaleString()}.`,
      });

      await notificationService.sendToRole({
        role:    ROLES.ACCOUNTS_OFFICER,
        type:    'SYSTEM',
        title:   'Salary Increment Applied',
        message: `Guard ${guard.firstName} ${guard.lastName}'s salary has been incremented from UGX ${guard.salaryRate.toLocaleString()} to UGX ${newSalary.toLocaleString()}.`,
      });

      await writeAuditLog({
          action:   'SALARY_INCREMENTED',
          entity:   'guard',
          entityId: guard.id,
          oldValue: { salaryRate: guard.salaryRate },
          newValue: { salaryRate: newSalary, increment },
        });

      console.log(`✅ Salary incremented: ${guard.firstName} ${guard.lastName} — UGX ${guard.salaryRate} → ${newSalary}`);
    }

    console.log(`Salary increment run complete. ${eligible.length} guard(s) updated.`);
  }

  // ── Generate ID Card ───────────────────────────────────────────────────────

  async generateIdCard(guardId: string): Promise<Buffer> {
    const guard = await prisma.guard.findUnique({
      where:  { id: guardId },
      select: {
        systemId:  true,
        firstName: true,
        lastName:  true,
        rank:      true,
        photoUrl:  true,
      },
    });
    if (!guard) throw new NotFoundError('Guard not found');

    // Guards should always have a systemId (assigned on creation), but self-heal
    // for any that slipped through without one rather than printing a fake,
    // never-persisted ID that wouldn't match what's shown on their profile.
    let systemId = guard.systemId;
    if (!systemId) {
      systemId = await generateGuardId();
      await prisma.guard.update({ where: { id: guardId }, data: { systemId } });
    }

    const photoPath = guard.photoUrl
      ? path.join(process.cwd(), 'public', guard.photoUrl)
      : '';

    const pdfBuffer = await generateIdCardPdf({
      systemId,
      fullName: `${guard.firstName} ${guard.lastName}`,
      position: guard.rank?.replace(/_/g, ' ') ?? 'Security Guard',
      photoPath,
    });

    const dir = path.join(process.cwd(), 'public', 'uploads', 'id-cards');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${guardId}.pdf`), pdfBuffer);

    return pdfBuffer;
  }
}

export const guardService = new GuardService();
