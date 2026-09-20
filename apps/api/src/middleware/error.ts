import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/** Wrap async route handlers so rejections hit the central handler. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/** Central error handler — must be registered last. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let normalized: NormalizedError;

  if (err instanceof ZodError) {
    normalized = { statusCode: 400, code: 'VALIDATION_ERROR', message: 'Invalid request data', details: err.flatten() };
  } else if (err instanceof AppError) {
    normalized = { statusCode: err.statusCode, code: err.code, message: err.message, details: err.details };
  } else {
    logger.error({ err, path: req.path }, 'unhandled error');
    normalized = { statusCode: 500, code: 'INTERNAL', message: 'Internal server error' };
  }

  if (res.headersSent) {
    _next(err);
    return;
  }

  res.status(normalized.statusCode).json({ error: normalized });
}
