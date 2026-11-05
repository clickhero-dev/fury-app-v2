import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowJobRepository } from '../repository/workflow-job.repository.js';

const seenEqValues = vi.hoisted(() => new Set<string>());

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return {
    ...actual,
    // Captura os valores comparados em `eq(..., valor)` para introspectar o where.
    eq: (col: any, val: any) => {
      seenEqValues.add(String(val));
      return actual.eq(col, val);
    },
  };
});

function makeDb() {
  const db: any = {
    query: { workflowJobs: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) } },
    update: vi.fn(() => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) })),
    insert: vi.fn(() => ({ values: vi.fn(async () => ({})) })),
    delete: vi.fn(() => ({ where: async () => {} })),
  };
  return db;
}

describe('WorkflowJobRepository — recuperação de jobs travados (GLOBAL)', () => {
  beforeEach(() => {
    seenEqValues.clear();
    vi.clearAllMocks();
  });

  it('listRecoverableWorkflowJobs considera awaiting_images recuperável', async () => {
    const db = makeDb();
    const repo = new WorkflowJobRepository('', db);

    await repo.listRecoverableWorkflowJobs({ workflow: 'planner-generate', sinceMs: 30_000 });

    expect(seenEqValues).toContain('running');
    expect(seenEqValues).toContain('pending');
    expect(seenEqValues).toContain('awaiting_images');
  });

  it('findActiveWorkflowJobByLockKey continua bloqueando apenas running/pending', async () => {
    const db = makeDb();
    const repo = new WorkflowJobRepository('', db);

    await repo.findActiveWorkflowJobByLockKey('tenant-1', 'planner-generate');

    expect(seenEqValues).toContain('running');
    expect(seenEqValues).toContain('pending');
    expect(seenEqValues).not.toContain('awaiting_images');
  });
});