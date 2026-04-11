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
