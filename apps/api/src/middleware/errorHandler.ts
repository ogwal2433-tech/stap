import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';

const isDev = process.env.NODE_ENV !== 'production';

export function errorHandler(
  err: Error,
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

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error:   'Validation failed',
      details: err.flatten(),
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