import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../lib/shared.js';
import { ZodError } from 'zod';
import { captureServerException } from '../lib/analytics.js';

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
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // JSON inválido: o body-parser anexa o corpo bruto (pode ter senha/chave); não registrar
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    console.error('Error: JSON inválido em', req.method, req.path);
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'Requisição inválida' },
      timestamp: new Date().toISOString(),
    });
  }
  console.error('Error:', err);

  // Tenant context (derivado de req, presente quando há autenticação)
  const tenantId = (req as Request & { tenantId?: string }).tenantId;

  const response: ApiResponse<null> = {
    success: false,
    timestamp: new Date().toISOString(),
  };

  let statusCode = 500;
  let code = 'INTERNAL_SERVER_ERROR';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    response.error = {
      code: err.code,
      message: err.message,
      details: err.details,
    };
  } else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
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
  } else {
    response.error = {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    };
  }

  // Erros 4xx são rejeições esperadas de entrada/autorização; registrá-los como
  // exception cria falsos incidentes no PostHog. Apenas falhas do servidor são
  // enviadas ao Error Tracking.
  if (statusCode >= 500) {
    captureServerException(err, {
      tenantId,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      code,
    });
  }

  res.status(statusCode).json(response);
}

export { AppError };
