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
let flushFailures = 0;

function resolveRequestId(req: Request): string {
  const header = req.headers['x-request-id'];
  const raw = typeof header === 'string' ? header.trim() : '';
  return raw && UUID_RE.test(raw) ? raw : randomUUID();
}

function extractQueryString(req: Request): string | null {
  const qs = req.url?.split('?')[1];
  return qs && qs.length <= 2048 ? qs : null;
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
  // Snapshot so new entries aren't lost if insert fails
  const batch = [...buffer];

  try {
    await db.insert(requestLogs).values(batch);
    // Only remove successfully written entries from buffer
    buffer.splice(0, batch.length);
    flushFailures = 0;
  } catch (err) {
    flushFailures++;
    console.error(`[request-logger] flush failed (attempt #${flushFailures}):`, err);
    // Keep entries in buffer for retry — schedule another flush
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
  // Drain completely: keep flushing until buffer is empty
  while (buffer.length > 0) {
    await flushBuffer();
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = resolveRequestId(req);
  const safeBody = captureRequestBody(req);

  res.setHeader('x-request-id', requestId);

  function captureLog() {
    buffer.push({
      requestId,
      tenantId: req.tenant?.tenantId ?? req.user?.tenantId ?? null,
      userId: req.user?.userId ?? null,
      method: req.method,
      path: req.originalUrl.slice(0, 2048),
      queryString: extractQueryString(req),
      statusCode: res.statusCode,
      responseTimeMs: Date.now() - start,
      ipAddress: req.ip ?? null,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      referer: typeof req.headers['referer'] === 'string' ? req.headers['referer'].slice(0, 2048) : null,
      requestHeaders: sanitizeHeaders(req.headers as Record<string, unknown>),
      requestBody: safeBody,
    });

    if (buffer.length >= MAX_BUFFER_SIZE) {
      void flushBuffer();
    } else {
      scheduleFlush();
    }
  }

  // finish: response fully sent. close: connection terminated (covers aborted requests).
  // Listen to both — deduplicate via a fired flag.
  let captured = false;
  res.on('finish', () => {
    if (captured) return;
    captured = true;
    captureLog();
  });
  res.on('close', () => {
    if (captured) return;
    captured = true;
    captureLog();
  });

  next();
}
