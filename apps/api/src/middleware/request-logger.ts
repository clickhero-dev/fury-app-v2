import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db, requestLogs } from '@fury/db';
import { sanitizeBody, sanitizeHeaders } from '../lib/sanitize-log-data.js';

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BUFFER_SIZE = 100;
const MAX_BODY_BYTES = 32_768;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RequestLogEntry = typeof requestLogs.$inferInsert;

const buffer: RequestLogEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

function resolveRequestId(req: Request): string {
  const header = req.headers['x-request-id'];
  const raw = typeof header === 'string' ? header.trim() : '';
  return raw && UUID_RE.test(raw) ? raw : randomUUID();
}

function captureRequestBody(req: Request): unknown {
  if (req.body == null || typeof req.body !== 'object') {
    return null;
  }

  try {
    const serialized = JSON.stringify(req.body);
    if (serialized.length > MAX_BODY_BYTES) {
      return { _truncated: true, sizeBytes: serialized.length };
    }
    return sanitizeBody(req.body);
  } catch {
    return { _unserializable: true };
  }
}

async function flushBuffer() {
  if (isFlushing || buffer.length === 0) {
    return;
  }

  isFlushing = true;
  const batch = buffer.splice(0, buffer.length);

  try {
    await db.insert(requestLogs).values(batch);
  } catch (err) {
    console.error('[request-logger] flush failed:', err);
  } finally {
    isFlushing = false;
    if (buffer.length > 0) {
      scheduleFlush();
    }
  }
}

function scheduleFlush() {
  if (flushTimer) {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushBuffer();
  }, FLUSH_INTERVAL_MS);
}

export async function flushRequestLogs() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushBuffer();
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = resolveRequestId(req);
  const safeBody = captureRequestBody(req);

  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    buffer.push({
      requestId,
      tenantId: req.tenant?.tenantId ?? req.user?.tenantId ?? null,
      userId: req.user?.userId ?? null,
      method: req.method,
      path: req.originalUrl.slice(0, 500),
      pathTemplate: req.route?.path ? String(req.route.path).slice(0, 500) : null,
      statusCode: res.statusCode,
      responseTimeMs: Date.now() - start,
      ipAddress: req.ip ?? null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      requestHeaders: sanitizeHeaders(req.headers as Record<string, unknown>),
      requestBody: safeBody,
    });

    if (buffer.length >= MAX_BUFFER_SIZE) {
      void flushBuffer();
    } else {
      scheduleFlush();
    }
  });

  next();
}
