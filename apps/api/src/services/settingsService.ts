import bcrypt from 'bcryptjs';
import prisma from '../db/prisma';
import { generateStaffId } from '../lib/systemId';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError, ForbiddenError } from '../errors/AppError';
import { notificationService } from './notificationService';
import { redisConnection } from '../lib/redis';
import type {
  SystemSettingResponse,
  UserResponse,
  PaginatedResponse,
  UserRole,
  DeductionTypeResponse,
  CreateDeductionTypeInput,
  UpdateDeductionTypeInput,
} from '@stap/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDeductionType(t: any): DeductionTypeResponse {
  return {
    id:            t.id,
    name:          t.name,
    code:          t.code,
    defaultAmount: t.defaultAmount ?? null,
    description:   t.description ?? null,
    isAutomatic:   t.isAutomatic,
    displayOrder:  t.displayOrder,
    isActive:      t.isActive,
    createdAt:     t.createdAt.toISOString(),
  };
}

function fmtSetting(s: any): SystemSettingResponse {
  return {
    id:       s.id,
    key:      s.key,
    value:    s.value,
    label:    s.label,
    group:    s.group,
    dataType: s.dataType,
  };
}

function fmtUser(u: any): UserResponse {
  return {
    id:        u.id,
    systemId:  u.systemId ?? null,
    name:      u.name,
    email:     u.email,
    role:      u.role,
    status:    u.status,
    createdAt: u.createdAt.toISOString(),
  };
}

function validateSettingValue(dataType: string, value: string): void {
  if (dataType === 'number') {
    if (isNaN(Number(value))) throw new AppError(`Value "${value}" is not a valid number`, 400);
  } else if (dataType === 'boolean') {
    if (value !== 'true' && value !== 'false') {
      throw new AppError(`Value "${value}" must be "true" or "false"`, 400);
    }
  }
}

// ── SettingsService ────────────────────────────────────────────────────────────

class SettingsService {
  async getAll(): Promise<SystemSettingResponse[]> {
    const settings = await prisma.systemSetting.findMany({
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
    return settings.map(fmtSetting);
  }

  async getGroup(group: string): Promise<SystemSettingResponse[]> {
    const settings = await prisma.systemSetting.findMany({
      where:   { group: group.toUpperCase() },
      orderBy: { key: 'asc' },
    });
    return settings.map(fmtSetting);
  }

  async get(key: string): Promise<string | null> {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    return setting?.value ?? null;
  }

  async update(key: string, value: string, updatedBy: string): Promise<SystemSettingResponse> {
    const existing = await prisma.systemSetting.findUnique({ where: { key } });
    if (!existing) throw new NotFoundError(`Setting "${key}" not found`);

    validateSettingValue(existing.dataType, value);

    const updated = await prisma.systemSetting.update({
      where: { key },
      data:  { value, updatedBy },
    });

    await QueueService.logAudit({
      userId:   updatedBy,
      action:   'SETTING_UPDATED',
      entity:   'SystemSetting',
      entityId: existing.id,
      oldValue: { key, value: existing.value },
      newValue: { key, value },
    });

    return fmtSetting(updated);
  }

  async updateMany(
    settings: { key: string; value: string }[],
    updatedBy: string,
  ): Promise<SystemSettingResponse[]> {
    const results: SystemSettingResponse[] = [];
    for (const s of settings) {
      results.push(await this.update(s.key, s.value, updatedBy));
    }
    return results;
  }

  // ── User Management ──────────────────────────────────────────────────────────

  async listUsers(query: {
    role?: string;
    status?: string;
    page: number;
    limit: number;
  }): Promise<PaginatedResponse<UserResponse>> {
    const { role, status, page, limit } = query;
    const skip  = (page - 1) * limit;
    const where: any = {};
    if (role)   where.role   = role;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      data: data.map(fmtUser),
      pagination: { page, limit, total, totalPages, hasNext: page < totalPages, hasPrev: page > 1 },
    };
  }

  async createUser(
    data: { name: string; email: string; password: string; role: UserRole },
    createdBy: string,
  ): Promise<UserResponse> {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('A user with this email already exists', 409);

    const passwordHash = await bcrypt.hash(data.password, 12);
    const systemId     = await generateStaffId();
    const user = await prisma.user.create({
      data: { systemId, name: data.name, email: data.email, passwordHash, role: data.role as any },
    });

    await QueueService.sendEmail({
      to:       data.email,
      subject:  'Welcome to STAP Security Management Platform',
      template: 'welcome',
      data:     { name: data.name, email: data.email, password: data.password },
    });

    await QueueService.logAudit({
      userId:   createdBy,
      action:   'USER_CREATED',
      entity:   'User',
      entityId: user.id,
      newValue: { name: user.name, email: user.email, role: user.role },
    });

    return fmtUser(user);
  }

  async updateUser(
    id: string,
    data: { name?: string; role?: UserRole; status?: string },
    updatedBy: string,
  ): Promise<UserResponse> {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('User not found');

    const updated = await prisma.user.update({
      where: { id },
      data:  { name: data.name, role: data.role as any, status: data.status as any },
    });

    await QueueService.logAudit({
      userId:   updatedBy,
      action:   'USER_UPDATED',
      entity:   'User',
      entityId: id,
      newValue: data,
    });

    return fmtUser(updated);
  }

  async resetPassword(id: string, newPassword: string, resetBy: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User not found');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id }, data: { passwordHash } });

    // Invalidate any existing refresh tokens
    try {
      await redisConnection.del(`refresh:${id}`);
      await redisConnection.del(`failed:${id}`);
    } catch { /* Redis may not have keys */ }

    await notificationService.send({
      userId:  id,
      type:    'SYSTEM',
      title:   'Password Reset',
      message: 'Your password has been reset by an administrator. Please log in with your new password.',
    });

    await QueueService.logAudit({
      userId:   resetBy,
      action:   'PASSWORD_RESET',
      entity:   'User',
      entityId: id,
    });
  }

  // ── Deduction Type Management ────────────────────────────────────────────────

  async listDeductionTypes(activeOnly = false): Promise<DeductionTypeResponse[]> {
    const types = await prisma.deductionType.findMany({
      where:   activeOnly ? { isActive: true } : {},
      orderBy: { displayOrder: 'asc' },
    });
    return types.map(fmtDeductionType);
  }

  async createDeductionType(data: CreateDeductionTypeInput, createdBy: string): Promise<DeductionTypeResponse> {
    const dupName = await prisma.deductionType.findFirst({
      where: { name: { equals: data.name, mode: 'insensitive' } },
    });
    if (dupName) throw new AppError(`A deduction type named "${data.name}" already exists.`, 409);

    const code = data.code.toUpperCase().replace(/\s+/g, '_');
    const dupCode = await prisma.deductionType.findUnique({ where: { code } });
    if (dupCode) throw new AppError(`A deduction type with code "${code}" already exists.`, 409);

    const type = await prisma.deductionType.create({
      data: { ...data, code, defaultAmount: data.defaultAmount ?? null, isAutomatic: false },
    });

    await prisma.auditLog.create({
      data: {
        userId:   createdBy,
        action:   'DEDUCTION_TYPE_CREATED',
        entity:   'deductionType',
        entityId: type.id,
        newValue: { name: type.name, code: type.code },
      },
    });

    return fmtDeductionType(type);
  }

  async updateDeductionType(id: string, data: UpdateDeductionTypeInput, updatedBy: string): Promise<DeductionTypeResponse> {
    const existing = await prisma.deductionType.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Deduction type not found');

    if ((data as any).code) throw new AppError('Deduction type code cannot be changed after creation.', 400);

    if (data.name && data.name !== existing.name) {
      const dup = await prisma.deductionType.findFirst({
        where: { name: { equals: data.name, mode: 'insensitive' }, id: { not: id } },
      });
      if (dup) throw new AppError(`A deduction type named "${data.name}" already exists.`, 409);
    }

    const updated = await prisma.deductionType.update({
      where: { id },
      data: { ...data, defaultAmount: 'defaultAmount' in data ? (data.defaultAmount ?? null) : undefined },
    });

    await prisma.auditLog.create({
      data: {
        userId:   updatedBy,
        action:   'DEDUCTION_TYPE_UPDATED',
        entity:   'deductionType',
        entityId: id,
        oldValue: { name: existing.name, defaultAmount: existing.defaultAmount },
        newValue: data,
      },
    });

    return fmtDeductionType(updated);
  }

  async deactivateDeductionType(id: string, deactivatedBy: string): Promise<DeductionTypeResponse> {
    const type = await prisma.deductionType.findUnique({ where: { id } });
    if (!type) throw new NotFoundError('Deduction type not found');
    if (type.isAutomatic) throw new AppError(`"${type.name}" is a system-managed deduction type and cannot be deactivated.`, 400);

    const recentCount = await prisma.guardDeduction.count({
      where: { type: type.code, status: 'PENDING' },
    });

    const updated = await prisma.deductionType.update({ where: { id }, data: { isActive: false } });

    await prisma.auditLog.create({
      data: {
        userId:   deactivatedBy,
        action:   'DEDUCTION_TYPE_DEACTIVATED',
        entity:   'deductionType',
        entityId: id,
        newValue: { pendingDeductionsOfThisType: recentCount },
      },
    });

    return fmtDeductionType(updated);
  }

  async activateDeductionType(id: string): Promise<DeductionTypeResponse> {
    const type = await prisma.deductionType.findUnique({ where: { id } });
    if (!type) throw new NotFoundError('Deduction type not found');
    const updated = await prisma.deductionType.update({ where: { id }, data: { isActive: true } });
    return fmtDeductionType(updated);
  }

  async deleteDeductionType(id: string, deletedBy: string): Promise<void> {
    const type = await prisma.deductionType.findUnique({ where: { id } });
    if (!type) throw new NotFoundError('Deduction type not found');
    if (type.isAutomatic) throw new AppError(`"${type.name}" is a system-managed type and cannot be deleted.`, 400);

    const usageCount = await prisma.guardDeduction.count({ where: { type: type.code } });
    if (usageCount > 0) {
      throw new AppError(
        `Cannot delete "${type.name}" — it has been used in ${usageCount} deduction record(s). Deactivate it instead to hide it from the form.`,
        409,
      );
    }

    await prisma.deductionType.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId:   deletedBy,
        action:   'DEDUCTION_TYPE_DELETED',
        entity:   'deductionType',
        entityId: id,
        oldValue: { name: type.name, code: type.code },
      },
    });
  }

  async reorderDeductionTypes(orderedIds: string[]): Promise<DeductionTypeResponse[]> {
    await Promise.all(
      orderedIds.map((id, index) =>
        prisma.deductionType.update({ where: { id }, data: { displayOrder: index + 1 } }),
      ),
    );
    return this.listDeductionTypes();
  }

  async deactivateUser(id: string, deactivatedBy: string): Promise<void> {
    if (id === deactivatedBy) {
      throw new ForbiddenError('Cannot deactivate your own account');
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError('User not found');

    await prisma.user.update({ where: { id }, data: { status: 'INACTIVE' } });

    try {
      await redisConnection.del(`refresh:${id}`);
    } catch { /* ignore */ }

    await QueueService.logAudit({
      userId:   deactivatedBy,
      action:   'USER_DEACTIVATED',
      entity:   'User',
      entityId: id,
    });
  }
}

export const settingsService = new SettingsService();
