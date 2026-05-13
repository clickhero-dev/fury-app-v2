import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../lib/shared.js';
import { ZodError } from 'zod';

class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(
  err: Error | AppError | ZodError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error('Error:', err);

  const response: ApiResponse<null> = {
    success: false,
    timestamp: new Date().toISOString(),
  };

  if (err instanceof AppError) {
    response.error = {
      code: err.code,
      message: err.message,
      details: err.details,
    };
    return res.status(err.statusCode).json(response);
  }

  if (err instanceof ZodError) {
    response.error = {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: {
        errors: err.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
          code: e.code,
        })),
      },
    };
    return res.status(400).json(response);
  }

  response.error = {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  };
  res.status(500).json(response);
}

export { AppError };
