import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { UnauthorisedError } from '../errors/AppError';
import type { UserRole } from '@stap/shared';

export const authenticate: RequestHandler = (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new UnauthorisedError());
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
  } catch {
    next(new UnauthorisedError());
  }
};
