import type { RequestHandler } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: (result.error as ZodError).flatten(),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/** Like `validate`, but parses `req.query` instead of `req.body`. */
export function validateQuery(schema: ZodSchema): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: (result.error as ZodError).flatten(),
      });
      return;
    }
    // req.query is a read-only getter in router@2.x — use defineProperty to override it
    Object.defineProperty(req, 'query', {
      value: result.data as typeof req.query,
      writable: true,
      configurable: true,
    });
    next();
  };
}
