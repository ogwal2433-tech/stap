import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { UnauthorisedError } from '../errors/AppError';
import { logSecurityEvent, logged } from '../lib/securityLog';
import type { UserRole } from '@security360/shared';

export const authenticate: RequestHandler = (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    logSecurityEvent(req, 'UNAUTHORISED_ACCESS', {
      required: 'authentication',
      reason:   authHeader ? 'Malformed Authorization header' : 'No token',
    });
    return next(logged(new UnauthorisedError()));
  }

  const token = authHeader.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.sub,
      role: payload.role as UserRole,
      name: payload.name,
      email: payload.email,
      clientId: payload.clientId ?? null,
    };
    next();
  } catch (err) {
    // An expired token is how every session ends — the app renews it and
    // retries. A token failing for any other reason (bad signature, malformed,
    // tampered) is the one worth recording.
    if ((err as Error)?.name !== 'TokenExpiredError') {
      logSecurityEvent(req, 'INVALID_TOKEN', {
        required: 'valid token',
        reason:   (err as Error)?.message ?? 'Invalid token',
      });
    }
    next(logged(new UnauthorisedError()));
  }
};
