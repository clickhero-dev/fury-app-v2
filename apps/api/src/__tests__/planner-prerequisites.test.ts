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
              if (new Date(c.tokenExpiresAt) <= new Date()) return false;
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
  desc: vi.fn(() => ({ type: 'desc' })),
  gt: vi.fn(() => ({ type: 'gt' })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ type: 'sql', strings, values })),
}));

vi.mock('../agents/orchestrator.js', () => ({
  jobs: new Map(),
  generateId: vi.fn(() => 'job-123'),
  runPipeline: vi.fn(),
}));

vi.mock('../services/openrouter.service.js', () => ({
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

import { getPrerequisites } from '../services/planner.service.js';

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

  it('retorna false — token futuro + selectedPageIds vazio [] (bug fix)', async () => {
    testConnections.push({
      tenantId: 't1',
      tokenExpiresAt: new Date('2099-01-01'),
      selectedPageIds: [],
    });
    const result = await getPrerequisites('t1');
    expect(result.metaConnected).toBe(false);
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
});
