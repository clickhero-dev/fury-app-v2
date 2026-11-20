import type { NextFunction, Request, Response } from 'express';
import { isReady } from '../lib/api-state.js';

/** Mantém somente o endpoint de diagnóstico disponível enquanto a API inicia. */
export function startupGate(req: Request, res: Response, next: NextFunction): void {
  if (req.baseUrl + req.path === '/api/health' || req.baseUrl + req.path === '/api/health/') {
    next();
    return;
  }

  if (!isReady()) {
    res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
    return;
  }

  next();
}
