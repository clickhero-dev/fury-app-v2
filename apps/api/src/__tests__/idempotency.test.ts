// =============================================================================
// Testes unitários da lib de idempotência (publish-now).
// BDD (nível unit): comportamento do store Redis — inflight NX, replay estrito,
// isolamento por tenant, release.
// O mock de redis é FIEL ao ioredis: `set(key, val, 'EX', ttl, 'NX')` retorna
// 'OK' apenas se a key NÃO existia (senão null) — sem flag NX, set sempre
// aplica e retorna 'OK' (pitfall real: lock decorativo, ver fury-api-testing).
// =============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Redis from 'ioredis';

function makeFakeRedis() {
  const data = new Map<string, string>();
  const redis = {
    get: vi.fn(async (k: string) => data.get(k) ?? null),
    set: vi.fn(async (k: string, v: string, ...rest: unknown[]) => {
      // fiel ao ioredis: ['EX', ttl, 'NX'] → NX de verdade
      const flag = rest[2];
      if (flag !== 'NX') {
        data.set(k, v);
        return 'OK';
      }
      if (data.has(k)) return null;
      data.set(k, v);
      return 'OK';
    }),
    del: vi.fn(async (k: string) => {
      data.delete(k);
      return 1;
    }),
  };
  return { redis: redis as unknown as Redis, data };
}

import { IdempotencyStore } from '../lib/idempotency.js';

let fake: ReturnType<typeof makeFakeRedis>;
let store: IdempotencyStore;

beforeEach(() => {
  fake = makeFakeRedis();
  store = new IdempotencyStore(fake.redis);
});

describe('IdempotencyStore — publish-now', () => {
  it('Cenário: primeira requisição com key nova → tryBegin true (e usa NX de verdade)', async () => {
    const began = await store.tryBegin('tenant-1', 'key-A');
    expect(began).toBe(true);
    // fidelidade: SET com EX + NX
    expect(fake.redis.set).toHaveBeenCalledWith(
      expect.stringContaining('key-A'),
      expect.any(String),
      'EX',
      expect.any(Number),
      'NX',
    );
  });

  it('Cenário: requisição duplicada enquanto a primeira está em andamento → tryBegin false', async () => {
    expect(await store.tryBegin('tenant-1', 'key-A')).toBe(true);
    expect(await store.tryBegin('tenant-1', 'key-A')).toBe(false);
  });

  it('Cenário: resposta armazenada → replay devolve status e body EXATOS (estrito)', async () => {
    await store.tryBegin('tenant-1', 'key-A');
    const body = { success: true, data: { post: { id: 'post-1', status: 'failed', lastPublishError: 'Graph API: erro' } } };
    await store.commitResponse('tenant-1', 'key-A', 201, body);

    const stored = await store.getStoredResponse('tenant-1', 'key-A');
    expect(stored).toEqual({ status: 201, body });
  });

  it('Cenário: key sem resposta armazenada → getStoredResponse null (fluxo normal)', async () => {
    expect(await store.getStoredResponse('tenant-1', 'key-nova')).toBeNull();
  });

  it('Cenário: tenants diferentes não colidem com a mesma key', async () => {
    expect(await store.tryBegin('tenant-1', 'key-A')).toBe(true);
    expect(await store.tryBegin('tenant-2', 'key-A')).toBe(true);
  });

  it('Cenário: release (5xx / erro) destrava a key → próximo begin passa', async () => {
    await store.tryBegin('tenant-1', 'key-A');
    await store.release('tenant-1', 'key-A');
    expect(await store.tryBegin('tenant-1', 'key-A')).toBe(true);
  });

  it('Cenário: commit libera o inflight (replay seguinte não vê inflight)', async () => {
    await store.tryBegin('tenant-1', 'key-A');
    await store.commitResponse('tenant-1', 'key-A', 201, { ok: true });
    const stored = await store.getStoredResponse('tenant-1', 'key-A');
    expect(stored).not.toBeNull();
    // commit removeu o inflight (a resposta armazenada passa a mandar)
    expect(fake.redis.del).toHaveBeenCalled();
  });

  it('Cenário: TTLs configuráveis (resposta 24h, inflight 60s por default)', async () => {
    await store.tryBegin('tenant-1', 'key-A');
    await store.commitResponse('tenant-1', 'key-A', 201, { ok: true });
    // inflight: 'EX' 60 — commit: 'EX' 86400
    const setCalls = fake.redis.set.mock.calls as unknown as any[][];
    expect(setCalls.some((c) => c[2] === 'EX' && c[3] === 60)).toBe(true);
    expect(setCalls.some((c) => c[2] === 'EX' && c[3] === 86400)).toBe(true);
  });

  it('Cenário: resposta corrompida no Redis → getStoredResponse null (não quebra)', async () => {
    fake.data.set('idem:publish-now:tenant-1:resp:key-A', 'não-json{{{');
    expect(await store.getStoredResponse('tenant-1', 'key-A')).toBeNull();
  });
});
