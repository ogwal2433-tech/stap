import fs from 'fs';
import path from 'path';
import prisma from '../db/prisma';
import { generateIdCardPdf } from '../lib/idCard/generateIdCardPdf';
import { QueueService } from '../jobs/QueueService';
import { notificationService } from './notificationService';
import { settingsService } from './settingsService';
import { NotFoundError, AppError } from '../errors/AppError';
import { ROLES, type UserRole } from '@stap/shared';
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
} from '@stap/shared';

// Roles allowed to see the accountNumber field
const ACCOUNT_VISIBLE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

class GuardService {
  // ── List ───────────────────────────────────────────────────────────────────

  async list(
    query: GuardListQuery,
    requestingUserRole: UserRole,
  ): Promise<PaginatedResponse<GuardResponse>> {
    const { page, limit, search, status, rank, contractType, probationStatus, nidStatus, isIncompleteNID, onLeave, sortBy, sortOrder } = query;
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
        isIncompleteNID:         !guardFields.nationalId,
        probationStatus:         'ON_PROBATION',
        probationEndDate:        data.probationEndDate ? new Date(data.probationEndDate) : undefined,
        registeredNames:         guardFields.registeredNames,
        maritalStatus:           guardFields.maritalStatus,
        spouseName:              guardFields.spouseName,
        spouseWorkplace:         guardFields.spouseWorkplace,
        spouseTelephone:         guardFields.spouseTelephone,
        preferredPaymentContact: guardFields.preferredPaymentContact,
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

    const contractEnd =
      status === 'TERMINATED' && !guard.contractEnd ? new Date() : guard.contractEnd;

    const updated = await prisma.guard.update({
      where: { id },
      data: {
        employmentStatus: status as 'ACTIVE' | 'SUSPENDED' | 'TERMINATED',
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
      nationalId: guard.nationalId ?? null,
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
    if (!['SUSPENDED', 'TERMINATED'].includes(guard.employmentStatus)) {
      throw new AppError(`Guard is currently ${guard.employmentStatus}. Only Suspended or Terminated guards can be reinstated.`, 400);
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

    await prisma.auditLog.create({
      data: {
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
      throw new AppError('Only ACTIVE guards can be transferred.', 400);
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

    await prisma.deploymentHistory.create({
      data: {
        guardId,
        siteId:      data.toSiteId,
        startDate:   new Date(data.transferDate),
        shiftType:   'DAY',
        supervisorId: authorisedBy,
      },
    });

    await notificationService.sendToRole({
      role:    ROLES.OPERATIONS_SUPERVISOR,
      type:    'SYSTEM',
      title:   'Guard Transferred',
      message: `Guard ${guard.firstName} ${guard.lastName} has been transferred to ${toSite.siteName}. Reason: ${data.reason}`,
    });

    await prisma.auditLog.create({
      data: {
        action:   'GUARD_TRANSFERRED',
        entity:   'guard',
        entityId: guardId,
        newValue: {
          toSiteId:   data.toSiteId,
          toSiteName: toSite.siteName,
          reason:     data.reason,
        },
      },
    });

    return this.mapTransferResponse(transfer);
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

      await prisma.auditLog.create({
        data: {
          action:   'PROBATION_COMPLETED',
          entity:   'guard',
          entityId: guard.id,
          newValue: { probationStatus: 'CONFIRMED' },
        },
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

      await prisma.auditLog.create({
        data: {
          action:   'SALARY_INCREMENTED',
          entity:   'guard',
          entityId: guard.id,
          oldValue: { salaryRate: guard.salaryRate },
          newValue: { salaryRate: newSalary, increment },
        },
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

    const photoPath = guard.photoUrl
      ? path.join(process.cwd(), 'public', guard.photoUrl)
      : '';

    const pdfBuffer = await generateIdCardPdf({
      systemId: guard.systemId ?? `SSLG${guardId.slice(0, 6).toUpperCase()}`,
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
