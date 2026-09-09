import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../db/prisma';
import { generateStaffId } from '../lib/systemId';
import { QueueService } from '../jobs/QueueService';
import { notificationService } from './notificationService';
import { redisConnection } from '../lib/redis';
import { NotFoundError, AppError } from '../errors/AppError';
import { ROLE_CONFIG, ROLES } from '@stap/shared';
import { APP_NAME } from '../config/branding';
import type {
  CreateStaffInput,
  UpdateStaffInput,
  StaffResponse,
  StaffListResponse,
  StaffRole,
} from '@stap/shared';

/**
 * Staff directory.
 *
 * `status` on User stays the single source of truth for whether an account may
 * log in — this service reads and writes it, and surfaces it to the frontend as
 * the friendlier `isActive` boolean. The deactivation columns record only who
 * turned an account off and why.
 */

/** Roles that are people the business tracks, not people who use the system. */
const NON_STAFF_ROLES = [ROLES.GUARD, ROLES.CLIENT];

const STAFF_SELECT = {
  id:                 true,
  systemId:           true,
  name:               true,
  email:              true,
  role:               true,
  phone:              true,
  department:         true,
  jobTitle:           true,
  status:             true,
  lastLoginAt:        true,
  deactivatedAt:      true,
  deactivationReason: true,
  emergencyContact:   true,
  emergencyPhone:     true,
  createdAt:          true,
  updatedAt:          true,
} as const;

/** Ambiguous glyphs (0/O, 1/l/I) are left out — these get read off an email. */
const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';

function sanitise(user: any): StaffResponse {
  return {
    id:                 user.id,
    systemId:           user.systemId ?? null,
    name:               user.name,
    email:              user.email,
    role:               user.role as StaffRole,
    phone:              user.phone ?? null,
    department:         user.department ?? null,
    jobTitle:           user.jobTitle ?? null,
    isActive:           user.status === 'ACTIVE',
    status:             user.status,
    lastLoginAt:        user.lastLoginAt?.toISOString() ?? null,
    deactivatedAt:      user.deactivatedAt?.toISOString() ?? null,
    deactivationReason: user.deactivationReason ?? null,
    emergencyContact:   user.emergencyContact ?? null,
    emergencyPhone:     user.emergencyPhone ?? null,
    createdAt:          user.createdAt.toISOString(),
    updatedAt:          user.updatedAt.toISOString(),
    roleConfig:         ROLE_CONFIG[user.role] ?? null,
    ...(user.auditLogs
      ? {
          recentActivity: user.auditLogs.map((l: any) => ({
            id:        l.id,
            action:    l.action,
            entity:    l.entity,
            createdAt: l.createdAt.toISOString(),
          })),
        }
      : {}),
  };
}

class StaffService {
  /**
   * A password a human has to retype off an email once, then change. Drawn from
   * the CSPRNG with a rejection loop, so no character is more likely than any
   * other despite the alphabet not dividing 256 evenly.
   */
  generatePassword(length = 12): string {
    const max = 256 - (256 % PASSWORD_CHARS.length);
    let password = '';
    while (password.length < length) {
      for (const byte of crypto.randomBytes(length)) {
        if (byte >= max) continue;
        password += PASSWORD_CHARS[byte % PASSWORD_CHARS.length];
        if (password.length === length) break;
      }
    }
    return password;
  }

  async list(filters: {
    role?:     StaffRole;
    isActive?: boolean;
    search?:   string;
    page:      number;
    limit:     number;
  }): Promise<StaffListResponse> {
    const where: any = { role: filters.role ?? { notIn: NON_STAFF_ROLES } };

    // ACTIVE is the only status that can log in, so "inactive" has to mean
    // everything else — INACTIVE and SUSPENDED both.
    if (filters.isActive !== undefined) {
      where.status = filters.isActive ? 'ACTIVE' : { not: 'ACTIVE' };
    }

    const term = filters.search?.trim();
    if (term) {
      where.OR = [
        { name:       { contains: term, mode: 'insensitive' } },
        { email:      { contains: term, mode: 'insensitive' } },
        { phone:      { contains: term, mode: 'insensitive' } },
        { department: { contains: term, mode: 'insensitive' } },
        { jobTitle:   { contains: term, mode: 'insensitive' } },
      ];
    }

    const [users, total, countByRole] = await Promise.all([
      prisma.user.findMany({
        where,
        select:  STAFF_SELECT,
        // Deactivated accounts sink to the bottom — ACTIVE sorts before
        // INACTIVE and SUSPENDED alphabetically, so ascending is what we want.
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        skip:    (filters.page - 1) * filters.limit,
        take:    filters.limit,
      }),
      prisma.user.count({ where }),
      // Head-count for the stat cards. Deliberately ignores the active filters
      // so the cards show the whole directory, not the current slice.
      prisma.user.groupBy({
        by:     ['role'],
        where:  { role: { notIn: NON_STAFF_ROLES }, status: 'ACTIVE' },
        _count: { _all: true },
      }),
    ]);

    return {
      data:        users.map(sanitise),
      total,
      page:        filters.page,
      limit:       filters.limit,
      pages:       Math.max(1, Math.ceil(total / filters.limit)),
      countByRole: Object.fromEntries(countByRole.map((c) => [c.role, c._count._all])),
    };
  }

  async getById(id: string): Promise<StaffResponse> {
    const user = await prisma.user.findUnique({
      where:  { id },
      select: {
        ...STAFF_SELECT,
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take:    10,
          select:  { id: true, action: true, entity: true, createdAt: true },
        },
      },
    });

    if (!user) throw new NotFoundError('Staff member not found');
    if (NON_STAFF_ROLES.includes(user.role as any)) {
      throw new NotFoundError('Staff member not found');
    }

    return sanitise(user);
  }

  async create(data: CreateStaffInput, createdById: string): Promise<StaffResponse> {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new AppError(`A user with email "${data.email}" already exists.`, 409);
    }

    const password     = data.password ?? this.generatePassword();
    const passwordHash = await bcrypt.hash(password, 12);
    const systemId     = await generateStaffId();

    const user = await prisma.user.create({
      data: {
        systemId,
        name:       data.name,
        email:      data.email,
        passwordHash,
        role:       data.role as any,
        phone:      data.phone ?? null,
        department: data.department ?? null,
        jobTitle:   data.jobTitle ?? null,
        status:     'ACTIVE',
      },
      select: STAFF_SELECT,
    });

    // The account works from here on. A queue outage must not fail the request,
    // or the caller sees an error for a user that now exists and every retry
    // comes back "email already exists".
    try {
      await QueueService.sendEmail({
        to:       user.email,
        subject:  `Welcome to ${APP_NAME} — Your Account Details`,
        template: 'welcome',
        data: {
          name:     user.name,
          email:    user.email,
          password,
          role:     ROLE_CONFIG[user.role]?.label ?? user.role,
          loginUrl: `${process.env.FRONTEND_URL ?? ''}/login`,
        },
      });
    } catch (err) {
      console.error('⚠️  Failed to queue welcome email for', user.email, err);
    }

    try {
      await QueueService.logAudit({
        userId:   createdById,
        action:   'STAFF_CREATED',
        entity:   'User',
        entityId: user.id,
        newValue: { name: user.name, email: user.email, role: user.role },
      });
    } catch (err) {
      console.error('⚠️  Failed to queue STAFF_CREATED audit log for', user.id, err);
    }

    return sanitise(user);
  }

  async update(id: string, data: UpdateStaffInput, updatedById: string): Promise<StaffResponse> {
    const user = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, role: true },
    });
    if (!user || NON_STAFF_ROLES.includes(user.role as any)) {
      throw new NotFoundError('Staff member not found');
    }

    // Nobody promotes themselves. Escalating your own role is exactly the move
    // this module has to make impossible, however senior the caller is.
    if (updatedById === id && data.role && data.role !== user.role) {
      throw new AppError('You cannot change your own role.', 400);
    }

    // Every field is optional and nullable — spread only what was actually
    // sent, so a partial update never blanks a column the caller omitted.
    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(data.name             !== undefined ? { name:             data.name }             : {}),
        ...(data.phone            !== undefined ? { phone:            data.phone }            : {}),
        ...(data.department       !== undefined ? { department:       data.department }       : {}),
        ...(data.jobTitle         !== undefined ? { jobTitle:         data.jobTitle }         : {}),
        ...(data.role             !== undefined ? { role:             data.role as any }      : {}),
        ...(data.emergencyContact !== undefined ? { emergencyContact: data.emergencyContact } : {}),
        ...(data.emergencyPhone   !== undefined ? { emergencyPhone:   data.emergencyPhone }   : {}),
      },
      select: STAFF_SELECT,
    });

    // A role change rewrites what the access token is allowed to reach, so the
    // old one must not outlive it.
    if (data.role && data.role !== user.role) {
      await this.revokeSessions(id);
    }

    await QueueService.logAudit({
      userId:   updatedById,
      action:   'STAFF_UPDATED',
      entity:   'User',
      entityId: id,
      newValue: { changes: data as Record<string, unknown> },
    });

    return sanitise(updated);
  }

  async deactivate(id: string, reason: string, deactivatedById: string): Promise<StaffResponse> {
    if (id === deactivatedById) {
      throw new AppError('You cannot deactivate your own account.', 400);
    }

    const user = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, role: true, status: true },
    });
    if (!user || NON_STAFF_ROLES.includes(user.role as any)) {
      throw new NotFoundError('Staff member not found');
    }
    if (user.status !== 'ACTIVE') {
      throw new AppError('This account is already deactivated.', 400);
    }

    // The last Director is the only account that can restore any of the others.
    // Deactivating it locks everyone out of the staff module for good.
    if (user.role === ROLES.DIRECTOR) {
      const activeDirectors = await prisma.user.count({
        where: { role: ROLES.DIRECTOR as any, status: 'ACTIVE' },
      });
      if (activeDirectors <= 1) {
        throw new AppError(
          'This is the last active Director account. Promote another Director before deactivating it.',
          400,
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        status:             'INACTIVE',
        deactivatedAt:      new Date(),
        deactivatedById,
        deactivationReason: reason,
      },
      select: STAFF_SELECT,
    });

    await this.revokeSessions(id);

    await QueueService.logAudit({
      userId:   deactivatedById,
      action:   'STAFF_DEACTIVATED',
      entity:   'User',
      entityId: id,
      newValue: { reason },
    });

    return sanitise(updated);
  }

  async reactivate(id: string, reactivatedById: string): Promise<StaffResponse> {
    const user = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, role: true, status: true },
    });
    if (!user || NON_STAFF_ROLES.includes(user.role as any)) {
      throw new NotFoundError('Staff member not found');
    }
    if (user.status === 'ACTIVE') {
      throw new AppError('This account is already active.', 400);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        status:             'ACTIVE',
        deactivatedAt:      null,
        deactivatedById:    null,
        deactivationReason: null,
      },
      select: STAFF_SELECT,
    });

    // Failed-login attempts accumulated while the account was off would lock a
    // freshly restored account out of its own first login.
    try {
      await redisConnection.del(`auth:failed:${id}`);
    } catch { /* Redis may not have the key */ }

    await QueueService.logAudit({
      userId:   reactivatedById,
      action:   'STAFF_REACTIVATED',
      entity:   'User',
      entityId: id,
    });

    return sanitise(updated);
  }

  async resetPassword(id: string, requestedById: string): Promise<{ success: true }> {
    const user = await prisma.user.findUnique({
      where:  { id },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user || NON_STAFF_ROLES.includes(user.role as any)) {
      throw new NotFoundError('Staff member not found');
    }

    const newPassword  = this.generatePassword();
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({ where: { id }, data: { passwordHash } });
    await this.revokeSessions(id);

    try {
      await QueueService.sendEmail({
        to:       user.email,
        subject:  `${APP_NAME} — Password Reset`,
        template: 'password-reset',
        data:     { name: user.name, email: user.email, password: newPassword },
      });
    } catch (err) {
      console.error('⚠️  Failed to queue password reset email for', user.email, err);
    }

    await notificationService.send({
      userId:  id,
      type:    'SYSTEM',
      title:   'Password Reset',
      message: 'Your password has been reset by an administrator. Check your email for the new password, and change it once you are in.',
    });

    await QueueService.logAudit({
      userId:   requestedById,
      action:   'STAFF_PASSWORD_RESET',
      entity:   'User',
      entityId: id,
    });

    return { success: true };
  }

  /**
   * Drops the stored refresh token so the next silent refresh fails and the
   * browser is bounced to /login. The access token already issued stays valid
   * until it expires — the refresh window is the enforcement point.
   */
  private async revokeSessions(id: string): Promise<void> {
    try {
      await redisConnection.del(`refresh:${id}`);
    } catch { /* Redis may not have the key */ }
  }
}

export const staffService = new StaffService();
