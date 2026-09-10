import bcrypt from 'bcryptjs';
import prisma from '../db/prisma';
import { redisConnection } from '../lib/redis';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { QueueService } from '../jobs/QueueService';
import { errorLogger } from './errorLogger';
import { isValidBcryptHash } from '../lib/passwordHash';
import { AccountLockedError, UnauthorisedError, AppError } from '../errors/AppError';
import { REFRESH_TOKEN_TTL_SECONDS } from '../config/session';
import type { LoginResponse } from '@stap/shared';
import type { UserRole } from '@stap/shared';

const MAX_FAILED_ATTEMPTS = 5;
const FAILED_ATTEMPT_TTL = 30 * 60; // 30 minutes in seconds
// Kept equal to the refresh token's own expiry by construction: a Redis TTL
// shorter than the JWT signs people out with "token has been revoked".
const REFRESH_TOKEN_TTL = REFRESH_TOKEN_TTL_SECONDS;

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

/**
 * Why a login was refused, so the route can say something specific.
 *
 * EMAIL_NOT_FOUND and WRONG_PASSWORD are answered before the caller has proved
 * anything, so telling them apart tells an unauthenticated visitor which email
 * addresses have accounts here — a list worth having if you intend to phish or
 * credential-stuff them. They are distinguished only when verbose auth errors
 * are switched on; otherwise both read the same. Everything else is decided
 * after the password checked out, and can be as specific as it likes.
 */
export type LoginFailure = 'EMAIL_NOT_FOUND' | 'WRONG_PASSWORD';

/**
 * Detailed pre-authentication login errors.
 *
 * On in development, off in production, and settable either way with
 * AUTH_VERBOSE_ERRORS. Turning it on in production is a deliberate trade of
 * user enumeration for easier support, not a default.
 */
export const verboseAuthErrors = (): boolean =>
  process.env.AUTH_VERBOSE_ERRORS
    ? process.env.AUTH_VERBOSE_ERRORS === 'true'
    : process.env.NODE_ENV !== 'production';

/** What the client is told for each pre-auth failure. */
export function loginFailureMessage(reason: LoginFailure): string {
  if (!verboseAuthErrors()) return 'Invalid credentials';
  return reason === 'EMAIL_NOT_FOUND'
    ? 'No account found with this email address.'
    : 'Incorrect password. Please try again.';
}

export class AuthService {
  async login(
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<LoginResult | LoginFailure> {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true, name: true, email: true, passwordHash: true, role: true, status: true, clientId: true,
        roleRecord: { select: { isActive: true, label: true } },
      },
    });

    if (!user) {
      await QueueService.logAudit({
        action: 'LOGIN_FAILURE',
        entity: 'auth',
        entityId: 'unknown',
        ipAddress,
        userAgent,
      });
      return 'EMAIL_NOT_FOUND';
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

    // Raised before comparing, because the comparison cannot tell us apart from
    // a wrong password. The caller still gets the same generic answer — whether
    // an account's hash is broken is not something an unauthenticated visitor
    // should be able to probe for — but it now says so where operators look.
    if (!isValidBcryptHash(user.passwordHash)) {
      void errorLogger.log({
        message:   `Stored password hash for ${user.email} is not a valid bcrypt hash. This account cannot authenticate until it is reset.`,
        errorCode: 'CORRUPT_PASSWORD_HASH',
        severity:  'CRITICAL',
        category:  'AUTH',
        route:     '/api/v1/auth/login',
        method:    'POST',
        userId:    user.id,
        userRole:  user.role,
        ipAddress,
        userAgent,
        // Length and prefix are enough to recognise the shell-expansion case
        // without putting any part of a credential into the log.
        context: {
          hashLength:   user.passwordHash.length,
          expectedLength: 60,
          startsWith:   user.passwordHash.slice(0, 4),
          expectedStart: '$2a$',
          remedy:       'Reset the password through the application rather than by hand: POST /api/v1/staff/:id/reset-password, or apps/api/src/db/setPassword.ts.',
        },
      });
      // Deliberately reported as a wrong password: the account exists, and the
      // real reason is already on the System Errors page for whoever can act
      // on it. Nothing useful reaches the person at the login form.
      return 'WRONG_PASSWORD';
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
      return 'WRONG_PASSWORD';
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
      // Safe to name the exact status: the password already checked out, so
      // this reaches the account's owner rather than someone probing for it.
      // SUSPENDED and INACTIVE mean different things to whoever they ask next.
      throw new AppError(
        user.status === 'SUSPENDED'
          ? 'Your account has been suspended. Please contact your administrator.'
          : 'Your account has been deactivated. Please contact your administrator.',
        403,
      );
    }

    // A disabled role signs nobody in. Checked after the password for the same
    // reason as status above: only the account's owner learns why.
    if (!user.roleRecord.isActive) {
      await QueueService.logAudit({
        userId: user.id,
        action: 'LOGIN_DENIED_ROLE_DISABLED',
        entity: 'auth',
        entityId: user.id,
        ipAddress,
        userAgent,
      });
      throw new AppError(
        `The ${user.roleRecord.label} role has been disabled. Please contact your administrator.`,
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
      select: {
        id: true, name: true, email: true, role: true, status: true, clientId: true,
        roleRecord: { select: { isActive: true } },
      },
    });

    // A disabled role stops refreshing too, so an open session ends when its
    // access token does — within the token's lifetime, not at the next sign-in.
    if (!user || user.status !== 'ACTIVE' || !user.roleRecord.isActive) {
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
