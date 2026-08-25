import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const insertReturning = vi.fn();
const valuesMock = vi.fn();
const dbMock = vi.hoisted(() => ({
  insert: vi.fn(() => ({ values: valuesMock })),
}));

vi.mock('@fury/db', () => ({
  db: dbMock,
  campaignPlans: { id: 'id' },
  socialPosts: { id: 'id' },
}));

import { savePlanToDb } from '../agents/save.service.js';
import type { savePlanToDbInput } from '../agents/save.service.js';

function makeInput(overrides: Partial<savePlanToDbInput> = {}): savePlanToDbInput {
  return {
    tenantId: 't-1',
    context: { tenantId: 't-1', tenant: { name: 'Acme', slug: 'acme' } },
    research: { trends: [], holidays: [], nicheTopics: [] },
    analytics: { bestFormats: [], bestDays: [], engagementTips: [] },
    strategy: { objective: 'Vendas', contentPillars: [], toneGuidelines: '', targetAudience: '' },
    planner: {
      totalPosts: 3,
      summary: { reelsCount: 1, carouselCount: 0, imageCount: 2, storiesCount: 0 },
      posts: [
        { dayIndex: 20, postType: 'reel', platform: 'both', title: 'Post 1', contentPillar: 'Produto', category: 'engagement' },
        { dayIndex: 5, postType: 'image', platform: 'instagram', title: 'Post 2', contentPillar: 'Educacional', category: 'educational' },
        { dayIndex: 31, postType: 'image', platform: 'facebook', title: 'Post 3', contentPillar: 'Produto', category: 'sales' },
      ],
    },
    copywriter: {
      posts: [
        { dayIndex: 20, caption: 'Cap 1', cta: 'CTA 1', hashtags: ['#a'] },
        { dayIndex: 5, caption: 'Cap 2', cta: '', hashtags: [] },
      ],
    },
    creative: { posts: [{ dayIndex: 20, imagePrompt: 'Prompt 1' }] },
    images: {
      posts: [{ dayIndex: 20, imageUrl: 'http://img/1.png', width: 1080, height: 1080, format: 'jpeg', sizeBytes: 1000, postType: 'feed', aspectRatio: '1:1', validated: true }],
    },
    quality: { passed: true, checks: [] },
    scheduler: { scheduled: [], approvalStatus: 'pending' },
    branding: { approved: true },
    ...overrides,
  };
}

describe('savePlanToDb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    valuesMock.mockReturnValue({ returning: insertReturning });
    insertReturning.mockResolvedValue([{ id: 'plan-1' }]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0, 0)); // 15/09/2026 -> d+1 = 16, último dia = 30
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna o id do plano criado', async () => {
    const result = await savePlanToDb(makeInput());
    expect(result).toBe('plan-1');
    expect(dbMock.insert).toHaveBeenCalledTimes(2);
  });

  it('insere o plano com título, objective e totalPosts', async () => {
    await savePlanToDb(makeInput());
    // primeira chamada: campaignPlans
    const planValues = valuesMock.mock.calls[0][0];
    expect(planValues.tenantId).toBe('t-1');
    expect(planValues.title).toBe('Plano - Acme');
    expect(planValues.objective).toBe('Vendas');
    expect(planValues.totalPosts).toBe(3);
    expect(planValues.status).toBe('draft');
  });

  it('aplica clamp de dayIndex e calcula calendarDate (d+1 e fim do mês)', async () => {
    await savePlanToDb(makeInput());
    const merged = valuesMock.mock.calls[1][0] as Array<Record<string, unknown>>;

    // post dia 20 -> mantém 20
    expect(merged[0].dayIndex).toBe(20);
    expect(merged[0].calendarDate).toBe('2026-09-20');
    // post dia 5 -> clampado para d+1 (16)
    expect(merged[1].dayIndex).toBe(16);
    expect(merged[1].calendarDate).toBe('2026-09-16');
    // post dia 31 -> clampado para último dia do mês (30, setembro)
    expect(merged[2].dayIndex).toBe(30);
    expect(merged[2].calendarDate).toBe('2026-09-30');
  });

  it('mapeia platform "both" para "instagram"', async () => {
    await savePlanToDb(makeInput());
    const merged = valuesMock.mock.calls[1][0] as Array<Record<string, unknown>>;
    expect(merged[0].platform).toBe('instagram');
    expect(merged[2].platform).toBe('facebook');
  });

  it('mescla caption/cta/imagePrompt/imageUrl por dayIndex', async () => {
    await savePlanToDb(makeInput());
    const merged = valuesMock.mock.calls[1][0] as Array<Record<string, unknown>>;
    expect(merged[0].caption).toBe('Cap 1');
    expect(merged[0].cta).toBe('CTA 1');
    expect(merged[0].imagePrompt).toBe('Prompt 1');
    expect(merged[0].imageUrl).toBe('http://img/1.png');
    // post sem copy correspondente -> campos vazios
    expect(merged[2].caption).toBe('');
    expect(merged[2].imageUrl).toBe('');
  });

  it('não insere posts quando planner.posts está vazio', async () => {
    await savePlanToDb(makeInput({ planner: { totalPosts: 0, summary: { reelsCount: 0, carouselCount: 0, imageCount: 0, storiesCount: 0 }, posts: [] } }));
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });
});
