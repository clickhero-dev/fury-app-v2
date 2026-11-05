// Funcionalidade: fila durável para a sincronização inicial de ativos Meta
/*
  Funcionalidade: processar sincronizações iniciais Meta com BullMQ

  Cenário: OAuth agenda um job BullMQ com nome descritivo
    Dado que a conexão Meta foi salva
    Quando o serviço agenda a sincronização inicial de ativos
    Então o job vai para a fila BullMQ meta-initial-sync com nome padronizado

  Cenário: backlog da Redis List é migrado sem perder o identificador
    Dado que existem jobs legados na lista meta:sync:queue
    Quando o worker BullMQ inicia
    Então os jobs são copiados com o mesmo ID para BullMQ e removidos do backlog legado

  Cenário: jobs Meta com nome da migração anterior continuam processáveis
    Dado um job de sync inicial enfileirado com o nome anterior
    Quando o worker recebe o job
    Então o fluxo existente processa os ativos

  Cenário: erro ao copiar mantém o job recuperável
    Dado que existe um job legado pendente
    Quando a gravação no BullMQ falha
    Então o payload permanece na lista de migração para uma nova tentativa

  Cenário: job BullMQ atualiza os ativos Meta salvos
    Dado que a conta Meta do job ainda está conectada
    Quando o worker processa a sincronização inicial
    Então os ativos atualizados são gravados no repositório do tenant
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const legacy: string[] = [];
  const migrating: string[] = [];
  const redis = {
    lindex: vi.fn(async (_key: string, index: number) => migrating[index] ?? null),
    lmove: vi.fn(async (_source: string, _destination: string, _from: string, _to: string) => {
      const item = legacy.shift();
      if (item !== undefined) migrating.push(item);
      return item ?? null;
    }),
    lrem: vi.fn(async (_key: string, _count: number, item: string) => {
      const index = migrating.indexOf(item);
      if (index < 0) return 0;
      migrating.splice(index, 1);
      return 1;
    }),
    set: vi.fn(async () => 'OK'),
    get: vi.fn(async () => 'migration-lock'),
    del: vi.fn(async () => 1),
    eval: vi.fn(async () => 1),
    rpush: vi.fn(async () => 1),
  };
  return {
    legacy,
    migrating,
    redis,
    queueName: '',
    queueAdd: vi.fn(async (..._args: any[]) => ({ id: 'new-job-id' })),
    queueClose: vi.fn(),
    workerName: '',
    workerProcessor: null as null | ((job: any) => Promise<unknown>),
    workerClose: vi.fn(),
    getUserAdAccounts: vi.fn(async () => ({ accounts: [{ id: 'act-2' }] })),
    findConnection: vi.fn(async () => ({ id: 'connection-1', accessToken: 'encrypted-token' })),
    patchConnection: vi.fn(async () => undefined),
  };
});

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    constructor(name: string) { state.queueName = name; }
    add(...args: any[]) { return state.queueAdd(...args); }
    close() { return Promise.resolve(state.queueClose()); }
  },
  Worker: class MockWorker {
    constructor(name: string, processor: (job: any) => Promise<unknown>) {
      state.workerName = name;
      state.workerProcessor = processor;
    }
    on() { return this; }
    close() { return Promise.resolve(state.workerClose()); }
  },
  MetricsTime: { ONE_WEEK: 7 * 24 * 60 * 60 * 1000 },
}));
vi.mock('../lib/redis.js', () => ({
  getRedis: () => state.redis,
}));
vi.mock('../lib/queue.js', () => ({ getRedisConnection: vi.fn(async () => state.redis) }));
vi.mock('../lib/meta-api.js', () => ({ getUserAdAccounts: state.getUserAdAccounts }));
vi.mock('../repository/meta.repository.js', () => ({
  MetaRepository: class {
    findMetaConnectionByMetaUserId(...args: any[]) { return state.findConnection(...args); }
    patchMetaConnection(...args: any[]) { return state.patchConnection(...args); }
  },
}));
vi.mock('../utils/crypto.js', () => ({ decryptMetaToken: vi.fn(() => 'access-token') }));

import { addSyncJob, startSyncJobsWorker, stopSyncJobsWorker } from '../lib/sync-jobs.js';

function legacyPayload(id = 'legacy-job-1') {
  return JSON.stringify({
    id,
    type: 'meta-initial-sync',
    tenantId: 'tenant-1',
    metaUserId: 'meta-user-1',
    adAccounts: [],
    queuedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
  });
}

function resetState() {
  state.legacy.splice(0);
  state.migrating.splice(0);
  state.redis.lindex.mockClear();
  state.redis.lmove.mockClear();
  state.redis.lrem.mockClear();
  state.redis.set.mockClear();
  state.redis.get.mockClear();
  state.redis.del.mockClear();
  state.redis.eval.mockClear();
  state.redis.rpush.mockClear();
  state.queueName = '';
  state.queueAdd.mockReset().mockResolvedValue({ id: 'new-job-id' });
  state.queueClose.mockReset();
  state.workerName = '';
  state.workerProcessor = null;
  state.workerClose.mockReset();
  state.getUserAdAccounts.mockReset().mockResolvedValue({ accounts: [{ id: 'act-2' }] });
  state.findConnection.mockReset().mockResolvedValue({ id: 'connection-1', accessToken: 'encrypted-token' });
  state.patchConnection.mockReset().mockResolvedValue(undefined);
}

describe('sincronização inicial de ativos Meta no BullMQ', () => {
  beforeEach(resetState);
  afterEach(async () => stopSyncJobsWorker());

  it('Cenário: OAuth agenda um job BullMQ com nome descritivo', async () => {
    const job = await addSyncJob({ tenantId: 'tenant-1', metaUserId: 'meta-user-1', adAccounts: [] as any });

    expect(state.queueName).toBe('meta-initial-sync');
    expect(state.queueAdd).toHaveBeenCalledWith(
      'worker-meta-onboarding-sync-assets',
      expect.objectContaining({ id: job.id, tenantId: 'tenant-1', metaUserId: 'meta-user-1' }),
      expect.objectContaining({ jobId: job.id, attempts: 3 }),
    );
    expect(state.redis.rpush).not.toHaveBeenCalled();
  });

  it('Cenário: backlog legado é migrado mantendo o ID', async () => {
    state.legacy.push(legacyPayload());
    await startSyncJobsWorker();

    expect(state.queueName).toBe('meta-initial-sync');
    expect(state.workerName).toBe('meta-initial-sync');
    expect(state.queueAdd).toHaveBeenCalledWith(
      'worker-meta-onboarding-sync-assets',
      expect.objectContaining({ id: 'legacy-job-1', tenantId: 'tenant-1' }),
      expect.objectContaining({ jobId: 'legacy-job-1' }),
    );
    expect(state.migrating).toHaveLength(0);
  });

  it('Cenário: erro ao copiar mantém o payload recuperável', async () => {
    state.legacy.push(legacyPayload());
    state.queueAdd.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(startSyncJobsWorker()).rejects.toThrow('redis unavailable');
    expect(state.migrating).toHaveLength(1);
    expect(state.redis.lrem).not.toHaveBeenCalled();
    expect(state.workerClose).toHaveBeenCalledOnce();
    expect(state.queueClose).toHaveBeenCalledOnce();
  });

  it('Cenário: worker atualiza os ativos da conexão do tenant', async () => {
    await startSyncJobsWorker();
    await state.workerProcessor!({ name: 'worker-meta-onboarding-sync-assets', data: JSON.parse(legacyPayload('fresh-job')) });

    expect(state.getUserAdAccounts).toHaveBeenCalledWith('access-token');
    expect(state.patchConnection).toHaveBeenCalledWith('connection-1', { adAccounts: [{ id: 'act-2' }] });
  });

  it('Cenário: jobs Meta com nome da migração anterior continuam processáveis', async () => {
    await startSyncJobsWorker();

    await expect(state.workerProcessor!({
      name: 'worker:meta:sync_initial_assets',
      data: JSON.parse(legacyPayload('legacy-named-job')),
    })).resolves.toBeUndefined();
  });
});
