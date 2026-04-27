import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { ROLES, type UserRole } from '@stap/shared';
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
} from '@stap/shared';

// Roles allowed to see the accountNumber field
const ACCOUNT_VISIBLE_ROLES: UserRole[] = [ROLES.DIRECTOR, ROLES.ASSISTANT_MANAGER];

class GuardService {
  // ── List ───────────────────────────────────────────────────────────────────

  async list(
    query: GuardListQuery,
    requestingUserRole: UserRole,
  ): Promise<PaginatedResponse<GuardResponse>> {
    const { page, limit, search, status, sortBy, sortOrder } = query;
    const skip = (page - 1) * limit;

    const where: import('@prisma/client').Prisma.GuardWhereInput = {};

    if (status) {
      where.employmentStatus = status;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { nationalId: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
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
    const existing = await prisma.guard.findUnique({
      where: { nationalId: data.nationalId },
      select: { id: true },
    });

    if (existing) {
      throw new AppError('A guard with this National ID already exists', 409);
    }

    // TODO Sprint 3 security: replace with AES-256 encryption using the
    // encryption service — never store plaintext bank account numbers
    const accountNumber = data.accountNumber ? '[ENCRYPTED]' : undefined;

    const { vettingData, ...guardFields } = data;

    const guard = await prisma.guard.create({
      data: {
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
        salaryRate:    guardFields.salaryRate,
        contractStart: new Date(guardFields.contractStart),
        contractEnd:   guardFields.contractEnd ? new Date(guardFields.contractEnd) : undefined,
        psoCertNumber: guardFields.psoCertNumber,
        // Section A
        gender:                  guardFields.gender,
        tribe:                   guardFields.tribe,
        placeOfBirth:            guardFields.placeOfBirth,
        educationLevel:          guardFields.educationLevel,
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
    if (guardFields.nationalId !== undefined)   updateData.nationalId   = guardFields.nationalId;
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

    const photoUrl = `/uploads/${filePath.replace(/.*\/public\/uploads\//, '')}`;

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
        site: { siteName: r.site.siteName },
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
      firstName: guard.firstName,
      lastName:  guard.lastName,
      otherNames:guard.otherNames ?? null,
      fullName,
      nationalId:guard.nationalId,
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

    return response;
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
}

export const guardService = new GuardService();
