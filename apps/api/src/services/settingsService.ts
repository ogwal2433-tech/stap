import bcrypt from 'bcryptjs';
import prisma from '../db/prisma';
import { QueueService } from '../jobs/QueueService';
import { NotFoundError, AppError, ForbiddenError } from '../errors/AppError';
import { notificationService } from './notificationService';
import { redisConnection } from '../lib/redis';
import type { SystemSettingResponse, UserResponse, PaginatedResponse, UserRole } from '@stap/shared';

// ── Helpers ────────────────────────────────────────────────────────────────────

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
    const user = await prisma.user.create({
      data: { name: data.name, email: data.email, passwordHash, role: data.role as any },
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
