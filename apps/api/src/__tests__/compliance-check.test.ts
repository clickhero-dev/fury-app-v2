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
  anthropicCreate: vi.fn(),
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

  return { Worker: WorkerMock };
});

vi.mock('@anthropic-ai/sdk', () => {
  class AnthropicMock {
    messages = {
      create: state.anthropicCreate,
    };
  }

  return { default: AnthropicMock };
});

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

vi.mock('../lib/temp-storage.js', () => ({
  ensureStudioAssetsDir: vi.fn().mockResolvedValue(undefined),
  studioAssetsDir: '/tmp/studio-assets',
}));

vi.mock('../lib/queue.js', () => ({
  closeStudioQueue: vi.fn().mockResolvedValue(undefined),
  closeComplianceQueue: vi.fn().mockResolvedValue(undefined),
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
    listen: vi.fn((_port: number, callback?: () => void) => {
      callback?.();
      return {
        close: vi.fn((done?: () => void) => done?.()),
      };
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
  state.anthropicCreate.mockReset();
  state.fetchImpl.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  globalThis.fetch = state.fetchImpl;

  ({ startComplianceCheckWorker, stopComplianceCheckWorker } = await import('../workers/compliance-check.worker.js'));
});

afterEach(async () => {
  await stopComplianceCheckWorker?.();
});

describe('Compliance Check Worker', () => {
  it('processa job e atualiza compliance_status no banco', async () => {
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

    state.anthropicCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            aprovado: true,
            motivos_reprovacao: [],
            confianca: 98,
            observacoes: 'Sem violações detectadas.',
          }),
        },
      ],
    });

    await startComplianceCheckWorker();
    expect(state.workerInstances).toHaveLength(1);

    await state.workerInstances[0].processor({
      data: { creativeAssetId: asset.id, tenantId: asset.tenantId },
    });

    expect(asset.complianceStatus).toBe('approved');
    expect(asset.complianceNotes).toContain('Confiança: 98%');
    expect(asset.complianceNotes).toContain('Sem violações detectadas.');
  });

  it('reprova imagens com texto excessivo com motivo claro', async () => {
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

    state.anthropicCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            aprovado: false,
            motivos_reprovacao: ['Texto excessivo detectado acima de 20% da imagem'],
            confianca: 94,
            observacoes: 'A imagem contém blocos de texto grandes e predominantes.',
          }),
        },
      ],
    });

    await startComplianceCheckWorker();
    await state.workerInstances[0].processor({
      data: { creativeAssetId: asset.id, tenantId: asset.tenantId },
    });

    expect(asset.complianceStatus).toBe('rejected');
    expect(asset.complianceNotes).toContain('Texto excessivo detectado acima de 20% da imagem');
    expect(asset.complianceNotes).toContain('Confiança: 94%');
    expect(asset.complianceNotes).toContain('A imagem contém blocos de texto grandes e predominantes.');
  });

  it('usa fallback de aprovação manual quando não há API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;

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
    expect(asset.complianceNotes).toContain('API Key da Anthropic não configurada');
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

      expect(startComplianceCheckWorkerMock).toHaveBeenCalledTimes(1);
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
