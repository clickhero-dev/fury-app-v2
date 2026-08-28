import { describe, it, expect, vi } from 'vitest';
import { PlannerService } from '../services/planner/planner.service.js';

// Repo mockado — métodos de persistência do Planner que não tocam LLM.
function makeRepo(override: Record<string, any> = {}) {
  return {
    findActiveMetaConnection: vi.fn(async () => null),
    findClientGoal: vi.fn(async () => null),
    findBrandKit: vi.fn(async () => null),
    createPost: vi.fn(async (data: any) => ({ id: 'post-1', ...data })),
    confirmPlan: vi.fn(async () => ({ id: 'plan-1', status: 'active' })),
    getPlanById: vi.fn(async () => null),
    findPostById: vi.fn(async () => null),
    patchPost: vi.fn(async (_id: string, data: any) => ({ id: _id, ...data })),
    ...override,
  } as any;
}

function makeSvc(repo: any, depsOverride: Record<string, any> = {}) {
  return new PlannerService(
    (t: string) => repo,
    {
      openrouter: {
        chat: vi.fn(async () => '{}'),
        assertCreditsAvailable: vi.fn(async () => undefined),
      },
      ...depsOverride,
    } as any,
  );
}

describe('PlannerService (deep DI)', () => {
  it('getPrerequisites usa o repo injetado e deriva os flags de pré-requisitos', async () => {
    const repo = makeRepo({
      findActiveMetaConnection: vi.fn(async () => ({ id: 'conn' })),
      findClientGoal: vi.fn(async () => ({ mainProduct: 'Pizza', objective: 'Vender mais' })),
      findBrandKit: vi.fn(async () => ({ voiceTone: 'descontraído' })),
    });
    const svc = makeSvc(repo);

    const checks = await svc.getPrerequisites('t1');

    expect(repo.findActiveMetaConnection).toHaveBeenCalledTimes(1);
    expect(repo.findClientGoal).toHaveBeenCalledTimes(1);
    expect(repo.findBrandKit).toHaveBeenCalledTimes(1);
    expect(checks).toEqual({
      metaConnected: true,
      hasProduct: true,
      hasObjective: true,
      hasVoiceTone: true,
    });
  });

  it('createManualPost grava via repo do tenant, derivando dayIndex/calendarDate da data', async () => {
    const repo = makeRepo();
    const svc = makeSvc(repo);

    const post = await svc.createManualPost('t1', { caption: 'oi', postType: 'image', date: '2026-08-19' });

    expect(repo.createPost).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 't1',
      postType: 'image',
      dayIndex: 19,
      calendarDate: '2026-08-19',
      status: 'approved',
      planId: null,
    }));
    expect(post.id).toBe('post-1');
  });

  it('confirmPlan propaga NOT_FOUND quando o repo não encontra o plano', async () => {
    const repo = makeRepo({ confirmPlan: vi.fn(async () => null) });
    const svc = makeSvc(repo);

    await expect(svc.confirmPlan('plan-x', 't1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.confirmPlan).toHaveBeenCalledWith('plan-x');
  });

  it('editPostWithAI usa deps.openrouter (mockado, sem LLM real) e persiste via repo', async () => {
    const repo = makeRepo({
      findPostById: vi.fn(async () => ({ id: 'p1', title: 'T', caption: 'C', cta: 'CTA', hashtags: ['#a'] })),
    });
    const openrouter = { chat: vi.fn(async () => JSON.stringify({ caption: 'nova', cta: 'novo', hashtags: ['#b'] })) };
    const svc = makeSvc(repo, { openrouter });

    const updated = await svc.editPostWithAI('p1', 't1', 'mais curto');

    expect(openrouter.chat).toHaveBeenCalled();
    expect(repo.findPostById).toHaveBeenCalledWith('p1');
    expect(repo.patchPost).toHaveBeenCalledWith('p1', expect.objectContaining({
      caption: 'nova',
      cta: 'novo',
      hashtags: ['#b'],
    }));
    expect(updated).toMatchObject({ caption: 'nova' });
  });
});