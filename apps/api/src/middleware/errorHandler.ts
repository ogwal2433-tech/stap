import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { errorLogger } from '../services/errorLogger';
import { logSecurityEvent } from '../lib/securityLog';

const isDev = process.env.NODE_ENV !== 'production';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Log full error server-side — never log req.body (may contain passwords)
  console.error('❌ ERROR:', {
    message: err.message,
    path:    req.path,
    method:  req.method,
    ...(isDev && { stack: err.stack }),
  });

  // Persist to the database (fire-and-forget — never blocks the response).
  // 5xx are real bugs; 4xx (except 404, which is just noise) are worth a WARN.
  const statusCode = err.statusCode ?? err.status ?? 500;

  // Refusals raised outside the permission and role middleware — a service's
  // own check, client isolation, 2FA enforcement. The middleware records its
  // own, with the permission that was missing, and marks the error, so this
  // picks up only the rest. 401s are not recorded here: /auth/refresh answers
  // 401 to every signed-out visitor, and the ones that matter are recorded by
  // authenticate.
  if (statusCode === 403 && !err?.securityLogged) {
    logSecurityEvent(req, 'ACCESS_DENIED', { reason: err?.message ?? null });
  }
  if (statusCode >= 500) {
    void errorLogger.logFromRequest(err, req, 'ERROR');
  } else if (statusCode >= 400 && statusCode !== 404) {
    void errorLogger.logFromRequest(err, req, 'WARN');
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error:   'Validation failed',
      details: err.flatten(),
    });
  }

  // Prisma unique constraint — a pre-flight "does it exist?" check can still
  // lose a race, and a 500 here reads as an unexplained failure to the user.
  if (err?.code === 'P2002') {
    const field = Array.isArray(err?.meta?.target) ? err.meta.target[0] : err?.meta?.target;
    return res.status(409).json({
      success: false,
      error:   field
        ? `A record with this ${field} already exists. Please use a different ${field}.`
        : 'A record with these details already exists.',
      code:    'DUPLICATE_ENTRY',
    });
  }

  if (err instanceof AppError) {
    const body: Record<string, unknown> = { success: false, error: err.message };
    if (err.statusCode === 409) body.code = 'DUPLICATE_ENTRY';
    return res.status(err.statusCode).json(body);
  }

  // 500 — hide internal details in production
  return res.status(500).json({
    success: false,
    error:   isDev ? err.message : 'Internal server error',
    ...(isDev && { stack: err.stack }),
  });
}