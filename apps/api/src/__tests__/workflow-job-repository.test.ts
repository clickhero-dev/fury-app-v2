import { describe, it, expect, vi } from 'vitest';
import { WorkflowJobRepository } from '../repository/workflow-job.repository.js';

function makeDb() {
  const update = vi.fn(() => ({ set: (s: any) => ({ where: () => ({ returning: async () => [{ id: 'w-1', ...s }] }) }) }));
  const insert = vi.fn(() => ({ values: vi.fn(async () => ({})) }));
  const db: any = {
    query: { workflowJobs: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) } },
    update, insert, delete: vi.fn(() => ({ where: async () => {} })),
  };
  return { db, update, insert };
}

describe('WorkflowJobRepository (GLOBAL)', () => {
  it('createWorkflowJob insere job', async () => {
    const { db, insert } = makeDb();
    const repo = new WorkflowJobRepository('', db);
    await repo.createWorkflowJob({ id: 'w-1', tenantId: 't', workflow: 'w', lockKey: 'k', status: 'pending' });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('getWorkflowJob consulta por id', async () => {
    const { db } = makeDb();
    const repo = new WorkflowJobRepository('', db);
    await repo.getWorkflowJob('w-1');
    expect(db.query.workflowJobs.findFirst).toHaveBeenCalledTimes(1);
  });

  it('patchWorkflowJob usa update por id', async () => {
    const { db, update } = makeDb();
    const repo = new WorkflowJobRepository('', db);
    await repo.patchWorkflowJob('w-1', { status: 'done' });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('listRecoverableWorkflowJobs consulta findMany', async () => {
    const { db } = makeDb();
    const repo = new WorkflowJobRepository('', db);
    await repo.listRecoverableWorkflowJobs({ sinceMs: 1000 });
    expect(db.query.workflowJobs.findMany).toHaveBeenCalledTimes(1);
  });
});