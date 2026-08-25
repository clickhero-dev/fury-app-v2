import { describe, it, expect, vi, beforeEach } from 'vitest';

const { dbMock, testConnections } = vi.hoisted(() => {
  const connections: any[] = [];
  return {
    dbMock: {
      query: {
        metaConnections: {
          findFirst: vi.fn((opts?: { where?: { type: string; args: unknown[] } }) => {
            const where = opts?.where;
            if (!where || where.type !== 'and') {
              return Promise.resolve(connections[0] ?? null);
            }
            const args = where.args ?? [];
            const hasSqlFilter = args.some((a: any) => a?.type === 'sql');
            const match = connections.find((c) => {
              if (!c?.tenantId) return false;
              // token expirado só bloqueia se não for NULL (NULL = válido)
              if (c.tokenExpiresAt !== null && new Date(c.tokenExpiresAt) <= new Date()) return false;
              if (hasSqlFilter && (!c.selectedPageIds || c.selectedPageIds.length === 0)) return false;
              return true;
            });
            return Promise.resolve(match ?? null);
          }),
        },
        clientGoals: { findFirst: vi.fn() },
        brandKits: { findFirst: vi.fn() },
      },
    } as any,
    testConnections: connections,
  };
});

vi.mock('@fury/db', () => ({
  db: dbMock,
  campaignPlans: {},
  socialPosts: {},
  metaConnections: {},
  clientGoals: {},
  brandKits: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ type: 'eq', a, b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', args })),
  or: vi.fn((...args: unknown[]) => ({ type: 'or', args })),
  desc: vi.fn(() => ({ type: 'desc' })),
  gt: vi.fn(() => ({ type: 'gt' })),
  isNull: vi.fn(() => ({ type: 'isNull' })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ type: 'sql', strings, values })),
}));

vi.mock('../agents/orchestrator.js', () => ({
  generateId: vi.fn(() => 'job-123'),
  plannerWorkflow: { id: 'planner-generate', stages: [], lockKey: () => 't1' },
}));

vi.mock('../agents/job-status-adapter.js', () => ({
  snapshotToJobStatus: vi.fn((s: any) => ({ id: s.id, tenantId: s.tenantId, status: s.status, currentAgent: '', agentProgress: [] })),
}));

vi.mock('../planner-workflow-runner.js', () => ({
  plannerStore: {
    create: vi.fn(),
    load: vi.fn(),
    save: vi.fn(),
    markFailed: vi.fn(),
    markDone: vi.fn(),
    listRecoverable: vi.fn(async () => []),
    findActiveByLockKey: vi.fn(async () => null),
  },
  runPlannerWorkflow: vi.fn(),
  recoverInterruptedPlannerWorkflows: vi.fn(async () => 0),
}));

vi.mock('../workers/planner.worker.js', () => ({
  enqueuePlanGeneration: vi.fn(async () => {}),
  startPlannerWorker: vi.fn(async () => {}),
  stopPlannerWorker: vi.fn(async () => {}),
}));

vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: { chat: vi.fn() },
}));

vi.mock('../middleware/errorHandler.js', () => {
  class AppError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, code: string, message: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  }
  return { AppError };
});

import { getPrerequisites } from '../services/planner/planner.service.js';

describe('getPrerequisites — metaConnected', () => {
  beforeEach(() => {
    testConnections.length = 0;
    vi.clearAllMocks();
    dbMock.query.clientGoals.findFirst.mockResolvedValue({
      mainProduct: 'Produto',
      objective: 'Vender',
    });
    dbMock.query.brandKits.findFirst.mockResolvedValue({
      voiceTone: 'Formal',
    });
  });

  it('retorna true — token futuro + selectedPageIds não-vazio', async () => {
    testConnections.push({
      tenantId: 't1',
      tokenExpiresAt: new Date('2099-01-01'),
      selectedPageIds: ['page_1'],
    });
    const result = await getPrerequisites('t1');
    expect(result.metaConnected).toBe(true);
  });

  it('retorna true — token futuro + selectedPageIds vazio [] (fix: página não é pré-requisito)', async () => {
    testConnections.push({
      tenantId: 't1',
      tokenExpiresAt: new Date('2099-01-01'),
      selectedPageIds: [],
    });
    const result = await getPrerequisites('t1');
    expect(result.metaConnected).toBe(true);
  });

  it('retorna false — token expirado mesmo com page selecionada', async () => {
    testConnections.push({
      tenantId: 't1',
      tokenExpiresAt: new Date('2020-01-01'),
      selectedPageIds: ['page_1'],
    });
    const result = await getPrerequisites('t1');
    expect(result.metaConnected).toBe(false);
  });

  it('retorna true — token NULL + selectedPageIds não-vazio (fix produção)', async () => {
    testConnections.push({
      tenantId: 't1',
      tokenExpiresAt: null,
      selectedPageIds: ['page_1'],
    });
    const result = await getPrerequisites('t1');
    expect(result.metaConnected).toBe(true);
  });

  it('retorna true — conta demo produção (dados realistas)', async () => {
    testConnections.push({
      tenantId: '01964523-b6bb-7caf-8bd8-5b3284e2a163',
      tokenExpiresAt: new Date('2126-07-16T19:00:00.000Z'),
      selectedPageIds: ['107800133415415', '108765432109876'],
      selectedAdAccountId: 'act_123456789',
      adAccounts: [{ id: 'act_123456789', name: 'Conta Demo' }],
      metaUserId: '12345678901234567',
      metaUserName: 'Demo User',
    });
    const result = await getPrerequisites('01964523-b6bb-7caf-8bd8-5b3284e2a163');
    expect(result.metaConnected).toBe(true);
  });

  it('retorna true — selectedPageIds = null (coalesce edge case — página não é mais pré-requisito)', async () => {
    testConnections.push({
      tenantId: 't1',
      tokenExpiresAt: new Date('2099-01-01'),
      selectedPageIds: null as unknown as string[],
    });
    const result = await getPrerequisites('t1');
    expect(result.metaConnected).toBe(true);
  });
});
