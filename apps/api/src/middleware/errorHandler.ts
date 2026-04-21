import e, { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Always log the full error — this is what we need to see
  console.error('❌ ERROR:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
  });

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.flatten(),
    });
  }

  if (err instanceof AppError) {
    const body: Record<string, unknown> = { success: false, error: err.message };
    if (err.statusCode === 409) body.code = 'DUPLICATE_ENTRY';
    return res.status(err.statusCode).json(body);
  }

  // Default 500
  return res.status(500).json({
    success: false,
    // error: process.env.NODE_ENV === 'production'
    //   ? 'Internal server error'
    //   : err.message,
    error: err.message,
  });
}