// Middleware de idempotência do publish-now (fail-closed sobre Redis).
// Header `Idempotency-Key` obrigatório. Replay ESTRITO: key já respondida
// devolve a MESMA resposta (status + body). Key em voo → 409. Erro do store
// → 503 IDEMPOTENCY_STORE_UNAVAILABLE (não deixa passar sem idempotência).
// Respostas < 500 são armazenadas p/ replay (publicado E falha de publicação
// são desfechos de negócio, não de infraestrutura); >= 500 → release.

import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler.js';
import type { IdempotencyStore } from '../lib/idempotency.js';
import { IdempotencyStore as IdempotencyStoreImpl } from '../lib/idempotency.js';
import { getRedis } from '../lib/redis.js';

export function createIdempotencyMiddleware(store: IdempotencyStore) {
  return async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
      const key = req.get('Idempotency-Key');
      if (!key) {
        return next(new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Header Idempotency-Key é obrigatório neste endpoint.'));
      }
      const tenantId = (req as any).tenant?.tenantId;
      if (!tenantId) {
        return next(new AppError(401, 'UNAUTHORIZED', 'Autenticação necessária.'));
      }

      const stored = await store.getStoredResponse(tenantId, key);
      if (stored) {
        // Replay estrito — a MESMA resposta da 1ª requisição.
        res.status(stored.status);
        return res.json(stored.body);
      }

      const began = await store.tryBegin(tenantId, key);
      if (!began) {
        return next(new AppError(409, 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'Requisição com esta Idempotency-Key já está em andamento.'));
      }

      const originalJson = res.json.bind(res);
      const originalStatus = res.status.bind(res);
      res.status = (code: number) => {
        originalStatus(code);
        return res;
      };
      res.json = (body: any) => {
        const status = res.statusCode;
        if (status >= 500) {
          void store.release(tenantId, key);
        } else {
          void store.commitResponse(tenantId, key, status, body);
        }
        return originalJson(body);
      };

      return next();
    } catch (err) {
      return next(new AppError(503, 'IDEMPOTENCY_STORE_UNAVAILABLE', 'Serviço de idempotência indisponível. Tente novamente.'));
    }
  };
}

/** Instância de rota: store Redis compartilhado (lazy — conecta no 1º request). */
export const idempotencyMiddleware = createIdempotencyMiddleware(
  new IdempotencyStoreImpl(getRedis()),
);
