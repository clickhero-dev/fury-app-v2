import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import { authMiddleware } from './auth.middleware.js';
import { superadminMiddleware } from './superadmin.middleware.js';

function matchesSecret(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
}

function challengeBasicAuth(res: Response): void {
  res.setHeader('WWW-Authenticate', 'Basic realm="Fury Bull Board", charset="UTF-8"');
}

/**
 * Browser navigation cannot attach the app's Bearer token. Allow the configured
 * superadmin credentials via HTTP Basic Auth while retaining Bearer auth for
 * API clients and authenticated browser contexts.
 */
export function bullBoardAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization ?? '';

  if (authorization.startsWith('Bearer ')) {
    authMiddleware(req, res, (error?: unknown) => {
      if (error) return next(error);
      return superadminMiddleware(req, res, next);
    });
    return;
  }

  const configuredEmail = process.env.SUPERADMIN_EMAIL;
  const configuredPassword = process.env.SUPERADMIN_PASSWORD;
  if (!configuredEmail || !configuredPassword) {
    return next(new AppError(503, 'BULL_BOARD_AUTH_NOT_CONFIGURED', 'Credenciais de superadmin não configuradas'));
  }

  const encodedCredentials = authorization.startsWith('Basic ')
    ? authorization.slice('Basic '.length)
    : '';
  let suppliedEmail = '';
  let suppliedPassword = '';
  try {
    const decoded = Buffer.from(encodedCredentials, 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator >= 0) {
      suppliedEmail = decoded.slice(0, separator);
      suppliedPassword = decoded.slice(separator + 1);
    }
  } catch {
    // Invalid credentials receive the same generic challenge as missing credentials.
  }

  if (matchesSecret(suppliedEmail, configuredEmail) && matchesSecret(suppliedPassword, configuredPassword)) {
    return next();
  }

  challengeBasicAuth(res);
  res.status(401).send('Bull Board authentication required');
}
