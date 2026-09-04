import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

export function loggerMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({ method: req.method, path: req.path, statusCode: res.statusCode, durationMs: duration }, 'request');
  });

  next();
}