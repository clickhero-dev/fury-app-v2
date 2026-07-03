import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type FakeAsset = {
  id: string;
  tenantId: string;
  url: string;
  complianceStatus: 'pending_compliance' | 'approved' | 'rejected';
  complianceNotes?: string | null;
};

const state = vi.hoisted(() => ({
  workerInstances: [] as Array<{
    name: string;
    processor: (job: { data: { creativeAssetId: string; tenantId: string } }) => Promise<unknown>;
    options: { connection: unknown; concurrency: number };
    handlers: Record<string, (...args: unknown[]) => unknown>;
  }>,
  chatCreate: vi.fn(),
  assets: new Map<string, FakeAsset>(),
  updateCalls: [] as Array<{ id: string; data: Partial<FakeAsset> }>,
  fetchImpl: vi.fn(),
}));

vi.mock('bullmq', () => {
  class WorkerMock {
    name: string;
    processor: (job: { data: { creativeAssetId: string; tenantId: string } }) => Promise<unknown>;
    options: { connection: unknown; concurrency: number };
    handlers: Record<string, (...args: unknown[]) => unknown> = {};

    constructor(
      name: string,
      processor: (job: { data: { creativeAssetId: string; tenantId: string } }) => Promise<unknown>,
      options: { connection: unknown; concurrency: number }
    ) {
      this.name = name;
      this.processor = processor;
      this.options = options;
      state.workerInstances.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => unknown) {
      this.handlers[event] = handler;
      return this;
    }

    async close() {
      return undefined;
    }
  }

  class QueueMock {
    name: string;

    constructor(name: string) {
      this.name = name;
    }

    async add() {
      return { id: 'mock-job' };
    }

    async getJobCounts() {
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }

    async close() {
      return undefined;
    }
  }

  return { Worker: WorkerMock, Queue: QueueMock };
});

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      chat: {
        completions: {
          create: state.chatCreate,
        },
      },
    };
  }),
}));

vi.mock('@fury/db', () => {
  const db = {
    select: vi.fn(() => ({
      from: () => ({
        where: (clause: { value: string }) => ({
          limit: async () => {
            const asset = state.assets.get(clause.value);
            return asset ? [asset] : [];
          },
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (data: Partial<FakeAsset>) => ({
        where: async (clause: { value: string }) => {
          const asset = state.assets.get(clause.value);
          if (asset) {
            Object.assign(asset, data);
            state.updateCalls.push({ id: clause.value, data });
          }
          return { count: asset ? 1 : 0 };
        },
      }),
    })),
  };

  return {
    db,
    creativeAssets: { id: 'id' },
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column: unknown, value: string) => ({ column, value })),
}));

vi.mock('../lib/redis.js', () => ({
  getRedis: () => ({ mocked: true }),
  waitForRedisReady: vi.fn().mockResolvedValue(undefined),
  closeRedis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../workers/studio-generation.worker.js', () => ({
  startStudioGenerationWorker: vi.fn().mockResolvedValue(undefined),
  stopStudioGenerationWorker: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/sync-jobs.js', () => ({
  startSyncJobsWorker: vi.fn().mockResolvedValue(undefined),
  stopSyncJobsWorker: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/seed-superadmin.js', () => ({
  seedStartup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/rule-engine-manager.js', () => ({
  startRuleEngine: vi.fn().mockResolvedValue(undefined),
  stopRuleEngine: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/fury-engine-manager.js', () => ({
  startFuryEngine: vi.fn().mockResolvedValue(undefined),
  stopFuryEngine: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../workers/budget-optimizer.worker.js', () => ({
  startBudgetOptimizerWorker: vi.fn().mockResolvedValue(undefined),
  stopBudgetOptimizerWorker: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/temp-storage.js', () => ({
  ensureStudioAssetsDir: vi.fn().mockResolvedValue(undefined),
  studioAssetsDir: '/tmp/studio-assets',
}));

vi.mock('../lib/queue.js', () => ({
  CAMPAIGN_SYNC_QUEUE_NAME: 'campaign-sync',
  RULE_ENGINE_QUEUE_NAME: 'rule-engine',
  FURY_ENGINE_QUEUE_NAME: 'fury-engine',
  STUDIO_COMPLIANCE_QUEUE_NAME: 'studio-compliance-check',
  createBullConnection: vi.fn().mockResolvedValue({}),
  createCampaignSyncQueue: vi.fn().mockResolvedValue({ add: vi.fn() }),
  createRuleEngineQueue: vi.fn().mockResolvedValue({ add: vi.fn() }),
  getFuryEngineQueue: vi.fn().mockResolvedValue({ add: vi.fn() }),
  closeStudioQueue: vi.fn().mockResolvedValue(undefined),
  closeComplianceQueue: vi.fn().mockResolvedValue(undefined),
  closeFuryEngineQueue: vi.fn().mockResolvedValue(undefined),
  closeRedisConnection: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../middleware/logger.js', () => ({
  loggerMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../middleware/errorHandler.js', () => ({
  errorHandler: (_err: unknown, _req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('../routes/index.js', () => ({
  default: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock('express', () => {
  const app = {
    use: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    _router: { stack: [] },
    listen: vi.fn((_port: number, callback?: () => void) => {
      const srv = {
        close: vi.fn((done?: () => void) => done?.()),
      };
      setImmediate(() => callback?.());
      return srv;
    }),
  };

  const expressFn = () => app;
  const expressApi = expressFn as typeof expressFn & {
    json: () => unknown;
    urlencoded: () => unknown;
    static: () => unknown;
  };

  expressApi.json = () => (_req: unknown, _res: unknown, next: () => void) => next();
  expressApi.urlencoded = () => (_req: unknown, _res: unknown, next: () => void) => next();
  expressApi.static = () => (_req: unknown, _res: unknown, next: () => void) => next();

  return {
    default: expressFn,
    json: expressApi.json,
    urlencoded: expressApi.urlencoded,
    static: expressApi.static,
  };
});

let startComplianceCheckWorker: typeof import('../workers/compliance-check.worker.js').startComplianceCheckWorker;
let stopComplianceCheckWorker: typeof import('../workers/compliance-check.worker.js').stopComplianceCheckWorker;

beforeEach(async () => {
  state.workerInstances.length = 0;
  state.assets.clear();
  state.updateCalls.length = 0;
  state.chatCreate.mockReset();
  state.fetchImpl.mockReset();
  process.env.OPENAI_API_KEY = 'test-openai-key';
  globalThis.fetch = state.fetchImpl;

  ({ startComplianceCheckWorker, stopComplianceCheckWorker } = await import('../workers/compliance-check.worker.js'));
});

afterEach(async () => {
  await stopComplianceCheckWorker?.();
});

describe('Compliance Check Worker', () => {
  it('valida aprovação do worker ao analisar um asset permitido', async () => {
    const asset: FakeAsset = {
      id: 'asset-1',
      tenantId: 'tenant-1',
      url: 'https://example.com/creative.png',
      complianceStatus: 'pending_compliance',
      complianceNotes: null,
    };
    state.assets.set(asset.id, asset);

    state.fetchImpl.mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new TextEncoder().encode('fake-image').buffer,
    });

    state.chatCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              approved: true,
              issues: [],
              text_percentage: 0,
            }),
          },
        },
      ],
    });

    await startComplianceCheckWorker();
    expect(state.workerInstances).toHaveLength(1);

    await state.workerInstances[0].processor({
      data: { creativeAssetId: asset.id, tenantId: asset.tenantId },
    });

    expect(asset.complianceStatus).toBe('approved');
    expect(asset.complianceNotes).toContain('approved=true');
    expect(asset.complianceNotes).toContain('text_percentage=0');
  });

  it('valida rejeição do worker ao encontrar violação de política', async () => {
    const asset: FakeAsset = {
      id: 'asset-2',
      tenantId: 'tenant-1',
      url: 'https://example.com/creative-text-heavy.png',
      complianceStatus: 'pending_compliance',
      complianceNotes: null,
    };
    state.assets.set(asset.id, asset);

    state.fetchImpl.mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new TextEncoder().encode('fake-image').buffer,
    });

    state.chatCreate.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              approved: false,
              issues: ['Texto excessivo detectado acima de 20% da imagem'],
              text_percentage: 25,
            }),
          },
        },
      ],
    });

    await startComplianceCheckWorker();
    expect(state.workerInstances).toHaveLength(1);
    await state.workerInstances[0].processor({
      data: { creativeAssetId: asset.id, tenantId: asset.tenantId },
    });

    expect(asset.complianceStatus).toBe('rejected');
    expect(asset.complianceNotes).toContain('approved=false');
    expect(asset.complianceNotes).toContain('Texto excessivo detectado acima de 20% da imagem');
    expect(asset.complianceNotes).toContain('text_percentage=25');
  });

  it('usa fallback de aprovação manual quando não há API key', async () => {
    delete process.env.OPENAI_API_KEY;

    const asset: FakeAsset = {
      id: 'asset-3',
      tenantId: 'tenant-1',
      url: 'https://example.com/creative.png',
      complianceStatus: 'pending_compliance',
      complianceNotes: null,
    };
    state.assets.set(asset.id, asset);

    state.fetchImpl.mockResolvedValue({
      ok: true,
      headers: { get: () => 'image/png' },
      arrayBuffer: async () => new TextEncoder().encode('fake-image').buffer,
    });

    await startComplianceCheckWorker();
    await state.workerInstances[0].processor({
      data: { creativeAssetId: asset.id, tenantId: asset.tenantId },
    });

    expect(asset.complianceStatus).toBe('approved');
    expect(asset.complianceNotes).toContain('[FALLBACK]');
    expect(asset.complianceNotes).toContain('API Key OpenAI nao configurada');
  });

  it('inicializa junto com o servidor em modo production', async () => {
    const startComplianceCheckWorkerMock = vi.fn().mockResolvedValue(undefined);
    const stopComplianceCheckWorkerMock = vi.fn().mockResolvedValue(undefined);

    await vi.resetModules();
    vi.doMock('../workers/compliance-check.worker.js', () => ({
      startComplianceCheckWorker: startComplianceCheckWorkerMock,
      stopComplianceCheckWorker: stopComplianceCheckWorkerMock,
    }));

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      await import('../index.js');
      // Allow the async IIFE in index.ts to resume after its awaited promises
      await new Promise((r) => setImmediate(r));

      expect(startComplianceCheckWorkerMock).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
