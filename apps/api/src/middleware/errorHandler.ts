import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 4-argument signature required by Express
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
};
