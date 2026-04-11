import type { RequestHandler } from 'express';
import prisma from '../db/prisma';
import { ForbiddenError } from '../errors/AppError';

/**
 * Middleware stub for 2FA enforcement on sensitive routes.
 *
 * Current behaviour (Sprint 1):
 *  - If the user has 2FA disabled: allow through immediately (no DB hit in prod — TODO cache).
 *  - If the user has 2FA enabled and the token type is "2fa_pending": block with 403.
 *  - If the user has 2FA enabled and the token type is "access": allow through
 *    (2FA was already completed during this session).
 *
 * Must be placed AFTER authenticate middleware.
 *
 * TODO Sprint 3 (TST-003): implement full TOTP verification flow —
 *  - Accept TOTP code in request body / header
 *  - Validate against twoFactorSecret (speakeasy / otpauth)
 *  - Validate backup codes (bcrypt compare, one-time use)
 *  - Exchange 2fa_pending tempToken for a real accessToken on success
 */
export const requireTwoFactor: RequestHandler = async (req, _res, next) => {
  if (!req.user) {
    // authenticate should have run first — skip silently (authenticate handles 401)
    return next();
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { twoFactorEnabled: true },
    });

    if (!user?.twoFactorEnabled) {
      // 2FA not enabled — allow through
      return next();
    }

    // User has 2FA enabled — check token type from the JWT payload
    // The verifyAccessToken sets req.user from the "access" typed token.
    // A "2fa_pending" token cannot reach here via authenticate (wrong type guard),
    // but we keep this check for future explicit handling.
    next(
      new ForbiddenError(
        '2FA verification required',
      ),
    );
  } catch (err) {
    next(err);
  }
};
