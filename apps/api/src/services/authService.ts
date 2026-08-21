import bcrypt from 'bcryptjs';
import prisma from '../db/prisma';
import { redisConnection } from '../lib/redis';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { QueueService } from '../jobs/QueueService';
import { AccountLockedError, UnauthorisedError, AppError } from '../errors/AppError';
import type { LoginResponse } from '@stap/shared';
import type { UserRole } from '@stap/shared';

const MAX_FAILED_ATTEMPTS = 5;
const FAILED_ATTEMPT_TTL = 30 * 60; // 30 minutes in seconds
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60; // 7 days in seconds

function failedKey(userId: string) {
  return `auth:failed:${userId}`;
}

function refreshKey(userId: string) {
  return `refresh:${userId}`;
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: LoginResponse['user'];
}

export class AuthService {
  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResult | null> {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, passwordHash: true, role: true, status: true, clientId: true },
    });

    if (!user) {
      await QueueService.logAudit({
        action: 'LOGIN_FAILURE',
        entity: 'auth',
        entityId: 'unknown',
        ipAddress,
        userAgent,
      });
      return null;
    }

    // Check lockout before verifying password
    const failedCountRaw = await redisConnection.get(failedKey(user.id));
    const failedCount = parseInt(failedCountRaw ?? '0', 10);

    if (failedCount >= MAX_FAILED_ATTEMPTS) {
      await QueueService.logAudit({
        userId: user.id,
        action: 'LOGIN_FAILURE',
        entity: 'auth',
        entityId: user.id,
        ipAddress,
        userAgent,
      });
      throw new AccountLockedError();
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatch) {
      await redisConnection.incr(failedKey(user.id));
      await redisConnection.expire(failedKey(user.id), FAILED_ATTEMPT_TTL);
      await QueueService.logAudit({
        userId: user.id,
        action: 'LOGIN_FAILURE',
        entity: 'auth',
        entityId: user.id,
        ipAddress,
        userAgent,
      });
      return null;
    }

    // Deactivated accounts are refused only once the password has checked out.
    // Refusing earlier would tell anyone typing an email whether it belongs to
    // a real — if suspended — member of staff.
    if (user.status !== 'ACTIVE') {
      await QueueService.logAudit({
        userId: user.id,
        action: 'LOGIN_DENIED_INACTIVE',
        entity: 'auth',
        entityId: user.id,
        ipAddress,
        userAgent,
      });
      throw new AppError(
        'Your account has been deactivated. Please contact your administrator.',
        403,
      );
    }

    // Successful login — reset failed attempts
    await redisConnection.del(failedKey(user.id));

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role as UserRole,
      name: user.name,
      email: user.email,
      clientId: user.clientId,
    });
    const refreshToken = signRefreshToken(user.id);

    // Store refresh token in Redis (single-session enforcement)
    await redisConnection.setex(refreshKey(user.id), REFRESH_TOKEN_TTL, refreshToken);

    // Drives the "Last Login" column in the staff directory. A write failure
    // here must not cost the user their session — the tokens are already issued.
    try {
      await prisma.user.update({
        where: { id: user.id },
        data:  { lastLoginAt: new Date() },
      });
    } catch (err) {
      console.error('⚠️  Failed to record lastLoginAt for', user.id, err);
    }

    await QueueService.logAudit({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      entity: 'auth',
      entityId: user.id,
      ipAddress,
      userAgent,
    });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role as UserRole },
    };
  }

  async refresh(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorisedError('Invalid or expired refresh token');
    }

    const stored = await redisConnection.get(refreshKey(payload.sub));
    if (!stored || stored !== refreshToken) {
      throw new UnauthorisedError('Refresh token has been revoked');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, name: true, email: true, role: true, status: true, clientId: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorisedError();
    }

    const newAccessToken = signAccessToken({
      sub: user.id,
      role: user.role as UserRole,
      name: user.name,
      email: user.email,
      clientId: user.clientId,
    });
    const newRefreshToken = signRefreshToken(user.id);

    // Rotate: replace old refresh token in Redis
    await redisConnection.setex(refreshKey(user.id), REFRESH_TOKEN_TTL, newRefreshToken);

    await QueueService.logAudit({
      userId: user.id,
      action: 'TOKEN_REFRESH',
      entity: 'auth',
      entityId: user.id,
      ipAddress,
      userAgent,
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: string, ipAddress?: string, userAgent?: string): Promise<void> {
    await redisConnection.del(refreshKey(userId));

    await QueueService.logAudit({
      userId,
      action: 'LOGOUT',
      entity: 'auth',
      entityId: userId,
      ipAddress,
      userAgent,
    });
  }
}

export const authService = new AuthService();
