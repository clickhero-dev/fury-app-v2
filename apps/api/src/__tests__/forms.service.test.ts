import { describe, it, expect, vi } from 'vitest';
import { FormsService } from '../services/forms/forms.service.js';

function makeRepo(override: Record<string, any> = {}) {
  return {
    createFormSubmission: vi.fn(async (d: any) => ({ id: 'sub1', ...d })),
    findFormSubmission: vi.fn(async () => ({ id: 'sub1', tenantId: 't-1', status: 'PENDING' })),
    patchFormSubmission: vi.fn(async (id: string, d: any) => ({ id, ...d })),
    ...override,
  };
}
let repo: any = makeRepo();
const svc = new FormsService(() => repo as any);

describe('FormsService', () => {
  it('startFormSubmission cria PENDING', async () => {
    const out = await svc.startFormSubmission('t-1', 'u-1', 'lead');
    expect(out.status).toBe('PENDING');
    expect(repo.createFormSubmission).toHaveBeenCalledWith(expect.objectContaining({ formType: 'lead' }));
  });

  it('completeFormSubmission marca COMPLETED', async () => {
    const out = await svc.completeFormSubmission('sub1', 't-1');
    expect(out.status).toBe('COMPLETED');
  });

  it('errorFormSubmission marca ERROR', async () => {
    const out = await svc.errorFormSubmission('sub1', 't-1');
    expect(out.status).toBe('ERROR');
  });

  it('abandonedFormSubmission marca ABANDONED com abandonedAt', async () => {
    const out = await svc.abandonedFormSubmission('sub1', 't-1');
    expect(out.status).toBe('ABANDONED');
    expect(out.abandonedAt).toBeInstanceOf(Date);
  });

  it('findAndPatch lança 404 quando não existe', async () => {
    repo = makeRepo({ findFormSubmission: vi.fn(async () => null) });
    await expect(svc.completeFormSubmission('x', 't-1')).rejects.toMatchObject({ statusCode: 404 });
  });
});