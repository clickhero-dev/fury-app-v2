// Idempotência do endpoint publish-now (Redis, fail-closed).
// Chaves: inflight `idem:publish-now:{tenantId}:{key}` (SET NX EX) e
// resposta `idem:publish-now:{tenantId}:resp:{key}` (SETEX 24h).
// Replay ESTRITO: a mesma key devolve a MESMA resposta (status + body) da 1ª
// requisição. Erro de infraestrutura (5xx) NÃO é armazenado (release → o
// cliente pode reenviar). Ver plan: .hermes/plans/2026-09-23_135445-publish-now-endpoint.md

import type Redis from 'ioredis';

const INFLIGHT_TTL_SECONDS = 60;
const RESPONSE_TTL_SECONDS = 24 * 60 * 60;

export interface StoredResponse {
  status: number;
  body: unknown;
}

export class IdempotencyStore {
  constructor(private readonly redis: Redis) {}

  private inflightKey(tenantId: string, key: string): string {
    return `idem:publish-now:${tenantId}:${key}`;
  }

  private respKey(tenantId: string, key: string): string {
    return `idem:publish-now:${tenantId}:resp:${key}`;
  }

  /** Resposta da 1ª requisição com esta key, se já armazenada (replay estrito). */
  async getStoredResponse(tenantId: string, key: string): Promise<StoredResponse | null> {
    try {
      const raw = await this.redis.get(this.respKey(tenantId, key));
      if (!raw) return null;
      return JSON.parse(raw) as StoredResponse;
    } catch {
      return null; // resposta corrompida → trata como inexistente
    }
  }

  /**
   * Marca a key como em andamento (SET NX EX). False = outro request com a
   * mesma key está em voo (409 IDEMPOTENCY_REQUEST_IN_PROGRESS).
   */
  async tryBegin(tenantId: string, key: string): Promise<boolean> {
    const acquired = await this.redis.set(
      this.inflightKey(tenantId, key),
      '1',
      'EX',
      INFLIGHT_TTL_SECONDS,
      'NX',
    );
    return acquired === 'OK';
  }

  /** Armazena a resposta da 1ª requisição (replay estrito) e libera o inflight. */
  async commitResponse(tenantId: string, key: string, status: number, body: unknown): Promise<void> {
    await this.redis.set(
      this.respKey(tenantId, key),
      JSON.stringify({ status, body }),
      'EX',
      RESPONSE_TTL_SECONDS,
    );
    await this.redis.del(this.inflightKey(tenantId, key));
  }

  /** Libera o inflight sem armazenar resposta (erro de infraestrutura / 5xx). */
  async release(tenantId: string, key: string): Promise<void> {
    await this.redis.del(this.inflightKey(tenantId, key));
  }
}
