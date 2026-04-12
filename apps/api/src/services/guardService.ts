import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError } from '../errors/AppError';
import { ROLES, type UserRole } from '@stap/shared';
import type {
  CreateGuardInput,
  UpdateGuardInput,
  GuardListQuery,
  GuardResponse,
  PaginatedResponse,
  DeploymentHistoryEntry,
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

    const guard = await prisma.guard.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        otherNames: data.otherNames,
        nationalId: data.nationalId,
        phone: data.phone,
        dateOfBirth: new Date(data.dateOfBirth),
        nextOfKinName: data.nextOfKinName,
        nextOfKinPhone: data.nextOfKinPhone,
        bankName: data.bankName,
        accountNumber,
        salaryRate: data.salaryRate,
        contractStart: new Date(data.contractStart),
        contractEnd: data.contractEnd ? new Date(data.contractEnd) : undefined,
        psoCertNumber: data.psoCertNumber,
      },
      include: {
        _count: {
          select: { deployments: true, attendance: true, disciplinary: true, documents: true },
        },
      },
    });

    await QueueService.logAudit({
      userId: createdBy,
      action: 'GUARD_CREATED',
      entity: 'guard',
      entityId: guard.id,
      // Never log sensitive fields in audit
      newValue: { firstName: guard.firstName, lastName: guard.lastName, nationalId: guard.nationalId },
    });

    return this.sanitiseGuard(guard, ROLES.DIRECTOR, false);
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

    const updateData: Parameters<typeof prisma.guard.update>[0]['data'] = {};

    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.otherNames !== undefined) updateData.otherNames = data.otherNames;
    if (data.nationalId !== undefined) updateData.nationalId = data.nationalId;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.dateOfBirth !== undefined) updateData.dateOfBirth = new Date(data.dateOfBirth);
    if (data.nextOfKinName !== undefined) updateData.nextOfKinName = data.nextOfKinName;
    if (data.nextOfKinPhone !== undefined) updateData.nextOfKinPhone = data.nextOfKinPhone;
    if (data.bankName !== undefined) updateData.bankName = data.bankName;
    if (data.accountNumber !== undefined) {
      // TODO Sprint 3 security: AES-256 encryption
      updateData.accountNumber = data.accountNumber ? '[ENCRYPTED]' : null;
    }
    if (data.salaryRate !== undefined) updateData.salaryRate = data.salaryRate;
    if (data.contractStart !== undefined) updateData.contractStart = new Date(data.contractStart);
    if (data.contractEnd !== undefined)
      updateData.contractEnd = data.contractEnd ? new Date(data.contractEnd) : null;
    if (data.psoCertNumber !== undefined) updateData.psoCertNumber = data.psoCertNumber;

    const updated = await prisma.guard.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: { deployments: true, attendance: true, disciplinary: true, documents: true },
        },
      },
    });

    await QueueService.logAudit({
      userId: updatedBy,
      action: 'GUARD_UPDATED',
      entity: 'guard',
      entityId: id,
      oldValue: { firstName: existing.firstName, lastName: existing.lastName },
      newValue: { firstName: updated.firstName, lastName: updated.lastName },
    });

    return this.sanitiseGuard(updated, ROLES.DIRECTOR, false);
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

    // When terminating, set contractEnd to today if not already set
    const contractEnd =
      status === 'TERMINATED' && !guard.contractEnd ? new Date() : guard.contractEnd;

    const updated = await prisma.guard.update({
      where: { id },
      data: {
        employmentStatus: status as 'ACTIVE' | 'SUSPENDED' | 'TERMINATED',
        ...(contractEnd !== guard.contractEnd && { contractEnd }),
      },
      include: {
        _count: {
          select: { deployments: true, attendance: true, disciplinary: true, documents: true },
        },
      },
    });

    // Create a disciplinary record for suspension or termination
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

    // Build a web-accessible URL from the file path
    const photoUrl = `/uploads/${filePath.replace(/.*\/public\/uploads\//, '')}`;

    const updated = await prisma.guard.update({
      where: { id },
      data: { photoUrl },
      include: {
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

  private sanitiseGuard(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    guard: any,
    role?: UserRole,
    listMode = false,
  ): GuardResponse {
    const showAccountNumber = !listMode && role && ACCOUNT_VISIBLE_ROLES.includes(role);

    const fullName = [guard.firstName, guard.otherNames, guard.lastName]
      .filter(Boolean)
      .join(' ');

    const response: GuardResponse = {
      id: guard.id,
      firstName: guard.firstName,
      lastName: guard.lastName,
      otherNames: guard.otherNames ?? null,
      fullName,
      nationalId: guard.nationalId,
      phone: guard.phone,
      photoUrl: guard.photoUrl ?? null,
      dateOfBirth: guard.dateOfBirth instanceof Date
        ? guard.dateOfBirth.toISOString()
        : guard.dateOfBirth,
      nextOfKinName: guard.nextOfKinName,
      nextOfKinPhone: guard.nextOfKinPhone,
      bankName: guard.bankName ?? null,
      salaryRate: guard.salaryRate,
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
    };

    if (showAccountNumber) {
      response.accountNumber = guard.accountNumber ?? null;
    }

    if (guard._count) {
      response._count = guard._count;
    }

    return response;
  }
}

export const guardService = new GuardService();
