import { AsyncLocalStorage } from 'node:async_hooks';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { PartnerRepository } from '../repository/partner.repository.js';
import { decryptAccessToken } from './meta-api.js';

/**
 * Qual chave de IA usar em cada chamada (cada um com a sua, sem exceção):
 * - cliente ady direto → chave da ady (.env)
 * - parceiro (conta própria e clientes dele) com chave → a do parceiro
 * - parceiro sem chave (ou excluído) → bloqueia; nunca usa a da ady
 * - tarefa do sistema → só com runAsAdy explícito
 * - sem contexto → erro (falha visível em vez de gastar a chave da ady)
 */
type AiContext = { tenantId: string } | { system: true };
const als = new AsyncLocalStorage<AiContext>();

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { expiresAt: number; value: ResolvedAiKey }>();

export interface ResolvedAiKey {
  key: string;
  // 'ady' ou o id do parceiro: separa cache de saldo por dono da chave
  scope: string;
}

export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return als.run({ tenantId }, fn);
}

// tarefa da própria ady (ex.: super_admin formatando aviso)
export function runAsAdy<T>(fn: () => T): T {
  return als.run({ system: true }, fn);
}

// abre o contexto do cliente da requisição (usar depois de multer, que perde o contexto)
export function aiContextMiddleware(req: Request, _res: Response, next: NextFunction) {
  const tenantId = req.tenant?.tenantId;
  if (!tenantId) return next();
  runWithTenant(tenantId, next);
}

// chave trocada ou removida: vale na hora nesta instância
export function clearAiKeyCache(): void {
  cache.clear();
}

function adyKey(): ResolvedAiKey {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new AppError(500, 'OPENROUTER_API_KEY_MISSING', 'OPENROUTER_API_KEY não configurada.');
  return { key, scope: 'ady' };
}

export async function resolveAiKey(repo: Pick<PartnerRepository, 'findAiKeyByTenant'> = new PartnerRepository()): Promise<ResolvedAiKey> {
  const ctx = als.getStore();
  if (!ctx) {
    console.error('[ai-key] chamada de IA sem cliente no contexto', new Error().stack?.split('\n').slice(2, 6).join(' | '));
    throw new AppError(500, 'AI_CONTEXT_MISSING', 'IA indisponível no momento.');
  }
  if ('system' in ctx) return adyKey();

  const hit = cache.get(ctx.tenantId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const row = await repo.findAiKeyByTenant(ctx.tenantId);
  if (!row) throw new AppError(403, 'AI_UNAVAILABLE', 'IA indisponível no momento.');
  if (!row.partnerId) return adyKey();
  if (!row.encrypted) throw new AppError(503, 'AI_UNAVAILABLE', 'IA indisponível no momento. Fale com seu parceiro.');

  const value = { key: decryptAccessToken(row.encrypted), scope: row.partnerId };
  cache.set(ctx.tenantId, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}
