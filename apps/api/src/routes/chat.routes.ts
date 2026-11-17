import { Router } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createChatDelegation } from '../lib/chat-delegation.js';
import { AppError } from '../middleware/errorHandler.js';

interface ChatProxyOptions { baseUrl: string; secret: string; fetcher?: typeof fetch }

export function createChatProxy(options: ChatProxyOptions): Router {
  const router = Router();
  router.use(async (req, res, next) => {
    if (!req.user || !req.user.tenantId) return next(new AppError(401, 'UNAUTHORIZED', 'Autenticação necessária'));
    // A fixed allowlist prevents this proxy from becoming an arbitrary internal HTTP client.
    const retry = /^\/conversations\/[a-zA-Z0-9-]+\/retry\/?$/.test(req.path) && req.method === 'POST';
    const clarify = /^\/conversations\/[a-zA-Z0-9-]+\/clarifications\/[a-zA-Z0-9-]+\/answer\/?$/.test(req.path) && req.method === 'POST';
    if (!retry && !clarify && !/^\/(?:conversations(?:\/[a-zA-Z0-9-]+(?:\/messages)?)?|approvals\/[a-zA-Z0-9-]+\/confirm)\/?$/.test(req.path)) {
      return next(new AppError(404, 'NOT_FOUND', 'Recurso não encontrado'));
    }
    try {
      const token = createChatDelegation(req.user, options.secret);
      const url = new URL(req.originalUrl.split('?')[1] ? `${req.path}?${req.originalUrl.split('?').slice(1).join('?')}` : req.path, options.baseUrl);
      const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: req.get('accept') ?? 'application/json' };
      const hasBody = !['GET', 'HEAD'].includes(req.method);
      if (hasBody) headers['content-type'] = 'application/json';
      const controller = new AbortController();
      // Confirmações podem aguardar geração de mídia na API principal.
      const timeoutMs = req.path.startsWith('/approvals/') ? 150000 : 30000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await (options.fetcher ?? fetch)(url.toString(), {
          method: req.method, headers, body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
          redirect: 'error', signal: controller.signal,
        });
      } finally { clearTimeout(timer); }
      res.status(response.status);
      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('content-type', contentType);
      if (contentType?.includes('text/event-stream')) {
        res.setHeader('cache-control', 'no-cache, no-transform');
        res.setHeader('x-accel-buffering', 'no');
        res.flushHeaders();
      }
      if (!response.body) return res.end();
      await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), res);
    } catch (err) {
      if (res.headersSent) { res.destroy(); return; }
      return next(new AppError(503, 'CHAT_UNAVAILABLE', 'O assistente está indisponível no momento'));
    }
  });
  return router;
}
