import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * T4 — Worker metrics-sync (feature 014).
 * Unit: scheduler BullMQ (repeatable 1h), lock Redis (anti-execução simultânea
 * em multi-instância), warmup no startup (background, não bloqueia), e
 * loop de syncAll isolando falha por tenant.
 * Redis/fila mockados (fronteira de integração).
 */

/**
 * Mock FIEL ao ioredis para o contrato do lock:
 * - SET key val EX ttl (sem 'NX'): SEMPRE sobrescreve e retorna 'OK' — nunca null.
 * - SET key val EX ttl 'NX': só grava se não existe (null se existir).
 * - eval(script, numKeys, key, owner): compare-and-del atômico (release seguro).
 * Um mock que simula NX "de brinde" esconde um bug de 1 linha — por isso o arg
 * 'NX' é exigido aqui, exatamente como o Redis real se comporta.
 */
const locks = new Map<string, string>();

const redisMock = {
  set: vi.fn(async (key: string, val: string, _mode?: string, _ttl?: number, flag?: string) => {
    if (flag !== 'NX') return 'OK'; // ioredis: SET puro sobrescreve sempre
    if (locks.has(key)) return null;
    locks.set(key, val);
    return 'OK';
  }),
  eval: vi.fn(async (_script: string, _numKeys: number, key: string, owner: string) => {
    // if redis.call("get",KEYS[1]) == ARGV[1] then del else 0
    if (locks.get(key) === owner) {
      locks.delete(key);
      return 1;
    }
    return 0;
  }),
  del: vi.fn(async (key: string) => {
    locks.delete(key);
    return 1;
  }),
};

vi.mock('../lib/redis.js', () => ({
  getRedis: () => redisMock,
}));

// BullMQ mockado: captura o pattern do repeatable e permite "disparar" o handler
let capturedHandler: ((job: any) => Promise<void>) | null = null;
const queueAdd = vi.fn(async (name: string, data: unknown, opts: any) => ({ id: 'job1' }));
vi.mock('bullmq', () => ({
  Worker: class {
    constructor(_name: string, handler: any) {
      capturedHandler = handler;
    }
    on() {}
    async close() {}
  },
  Queue: class {
    add = queueAdd;
    async close() {}
  },
}));

// syncTenant/syncAll mockados — worker só orquestra
const syncTenantMock = vi.fn();
const syncAllMock = vi.fn(async (tenantIds: string[]) =>
  tenantIds.map((tenantId) => ({ tenantId, ok: true, upserted: 1 }))
);
const listTenantIdsMock = vi.fn(async () => ['t1', 't2']);

vi.mock('../services/campaigns/metrics-sync.service.js', () => ({
  MetaInsightsSyncService: class {
    syncTenant = syncTenantMock;
    syncAll = syncAllMock;
    static RESYNC_DAYS = 3;
  },
}));

// db mockado p/ listar tenants (workers são exceção documentada da constituição)
vi.mock('@fury/db', () => ({
  db: {
    query: {
      tenants: { findMany: async () => [{ id: 't1' }, { id: 't2' }] },
    },
  },
}));

import {
  startMetricsSyncWorker,
  stopMetricsSyncWorker,
  runMetricsSyncNow,
  METRICS_SYNC_CRON,
} from '../workers/metrics-sync.worker.js';

describe('metrics-sync worker', () => {
  beforeEach(() => {
    locks.clear();
    queueAdd.mockClear();
    syncAllMock.mockClear();
    listTenantIdsMock.mockClear();
    capturedHandler = null;
  });

  it('start agenda repeatable com pattern horário (0 * * * *)', async () => {
    await startMetricsSyncWorker();
    expect(queueAdd).toHaveBeenCalledTimes(1);
    expect(queueAdd.mock.calls[0]![2]?.repeat?.pattern).toBe('0 * * * *');
    expect(METRICS_SYNC_CRON).toBe('0 * * * *');
    await stopMetricsSyncWorker();
  });

  it('handler do job roda syncAll de todos os tenants (worker processa fila)', async () => {
    await startMetricsSyncWorker();
    expect(capturedHandler).toBeTruthy();
    await capturedHandler!({ id: 'j1', data: {} });
    expect(syncAllMock).toHaveBeenCalledWith(['t1', 't2']);
    await stopMetricsSyncWorker();
  });

  it('lock Redis: 2ª execução simultânea pula (SET NX)', async () => {
    locks.set('lock:metrics-sync', 'owner1'); // outra instância segurando

    const result = await runMetricsSyncNow({ data: { source: 'manual' } });

    expect(result.skipped).toBe(true);
    expect(syncAllMock).not.toHaveBeenCalled();
  });

  it('lock é adquirido via SET com flag NX (contrato ioredis — regressão do lock decorativo)', async () => {
    // ioredis: SET sem NX sobrescreve sempre e retorna 'OK' — o código DEVE
    // passar 'NX' como flag; o mock fiel só bloqueia quando o arg vem.
    await runMetricsSyncNow({ data: { source: 'manual' } });

    expect(redisMock.set).toHaveBeenCalledWith(
      'lock:metrics-sync',
      expect.any(String),
      'EX',
      expect.any(Number),
      'NX'
    );
  });

  it('release segura: lock de OUTRO owner (expirou + outra instância pegou) não é deletado', async () => {
    locks.set('lock:metrics-sync', 'owner2'); // lock alheio (A expirou, B pegou)

    // sem lock próprio: ciclo pula e NUNCA deleta o lock do outro owner
    const result = await runMetricsSyncNow({ data: { source: 'manual' } });
    expect(result.skipped).toBe(true);
    expect(locks.get('lock:metrics-sync')).toBe('owner2'); // intacto
    expect(redisMock.del).not.toHaveBeenCalled();
  });

  it('lock é liberado após execução (mesmo com erro de tenant)', async () => {
    syncAllMock.mockImplementation(async () => {
      throw new Error('boom'); // erro global inesperado
    });
    await expect(runMetricsSyncNow({ data: { source: 'manual' } })).rejects.toThrow('boom');
    expect(locks.has('lock:metrics-sync')).toBe(false);
    // próxima execução consegue pegar o lock
    syncAllMock.mockImplementation(async (ids) => ids.map((tenantId) => ({ tenantId, ok: true, upserted: 1 })));
    const result = await runMetricsSyncNow({ data: { source: 'manual' } });
    expect(result.skipped).toBe(false);
  });

  it('warmup: dispara sync em background sem esperar (fire-and-forget)', async () => {
    await startMetricsSyncWorker({ warmup: true });
    // warmup não deve aguardar o sync — retorna imediatamente
    // e o sync roda em background (syncAllMock chamado assincronamente)
    await new Promise((r) => setTimeout(r, 20));
    expect(syncAllMock).toHaveBeenCalled();
    await stopMetricsSyncWorker();
  });

  it('start é idempotente (não re-agenda se já rodando)', async () => {
    await startMetricsSyncWorker();
    await startMetricsSyncWorker();
    expect(queueAdd).toHaveBeenCalledTimes(1);
    await stopMetricsSyncWorker();
  });
});
