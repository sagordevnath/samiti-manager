import type { ErrorCode } from '@samity/shared';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const BadRequest = (message = 'Bad request', details?: unknown) => new AppError(400, 'VALIDATION_ERROR', message, details);
export const Unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
export const Forbidden = (message = 'Insufficient permissions') => new AppError(403, 'FORBIDDEN', message);
export const NotFound = (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message);
export const Conflict = (message = 'Resource conflict') => new AppError(409, 'CONFLICT', message);
