import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processPlannerImageJob, aspectForPlannerPostType } from '../services/studio/studio.service.js';
import type { PlannerPrompt } from '../agents/types.js';

const { dbMock, mockGenerateImage, mockUploadAsset } = vi.hoisted(() => ({
  dbMock: { insert: vi.fn(), query: { creativeAssets: { findFirst: vi.fn() }, metaConnections: { findFirst: vi.fn() } } },
  mockGenerateImage: vi.fn(),
  mockUploadAsset: vi.fn(),
}));

vi.mock('@fury/db', async () => {
  const { sql } = await import('drizzle-orm');
  return {
    db: dbMock,
    socialPosts: { id: 'id', tenantId: 'tenantId' },
    creativeAssets: {},
    metaConnections: {},
    eq: (a: any) => a,
    and: (...a: any[]) => a,
    count: () => 'count',
    desc: (a: any) => a,
    inArray: () => {},
    or: () => {},
    type: sql,
  };
});
vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: { generateImage: mockGenerateImage },
}));
vi.mock('../services/storage/storage.service.js', () => ({
  uploadAsset: mockUploadAsset,
}));

const post: PlannerPrompt = {
  date: '2026-09-07',
  title: 'Dia da Independência',
  caption: 'Comemore a semana da pátria com nosso pão artesanal!',
  cta: 'Encomende agora',
  hashtags: ['#padaria', '#independencia'],
  imagePrompt: 'Pão artesanal com bandeira do Brasil na vitrine, cores quentes',
  postType: 'image',
  platform: 'instagram',
};

describe('studio.service — modo planner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.insert.mockImplementation(() => {
      const valuesResult = Object.assign(Promise.resolve(undefined), {
        returning: vi.fn().mockResolvedValue([
          { id: 'social-post-1', imageUrl: 'https://cdn/planner.png' },
        ]),
      });
      return { values: vi.fn().mockReturnValue(valuesResult) };
    });
  });

  it('aspectForPlannerPostType mapeia reel/stories para 9:16 e demais para 1:1', () => {
    expect(aspectForPlannerPostType('reel')).toBe('9:16');
    expect(aspectForPlannerPostType('stories')).toBe('9:16');
    expect(aspectForPlannerPostType('image')).toBe('1:1');
    expect(aspectForPlannerPostType('carousel')).toBe('1:1');
  });

  it('gera a imagem, faz upload e grava o social_post no calendário', async () => {
    mockGenerateImage.mockResolvedValue('data:image/png;base64,AAAABBBB');
    mockUploadAsset.mockResolvedValue('https://cdn/planner.png');

    const result = await processPlannerImageJob({
      mode: 'planner',
      tenantId: 't1',
      planId: 'plan-1',
      post,
      logoUrl: 'https://cdn/logo.png',
    });

    expect(result.imageUrl).toBe('https://cdn/planner.png');
    expect(mockGenerateImage).toHaveBeenCalledWith(expect.objectContaining({
      prompt: post.imagePrompt,
      aspect_ratio: '1:1',
      logoUrl: 'https://cdn/logo.png',
    }));
    expect(mockUploadAsset).toHaveBeenCalledWith(
      Buffer.from('AAAABBBB', 'base64'),
      expect.stringContaining('planner/t1/plan-1/2026-09-07-'),
      'image/png',
    );

    // O insert do social_post recebe calendar_date, caption, etc.
    const valuesArg = dbMock.insert.mock.calls[0][0];
    expect(valuesArg).toBeDefined();
    const inserted = dbMock.insert.mock.results[0].value.values.mock.calls[0][0];
    expect(inserted).toMatchObject({
      tenantId: 't1',
      planId: 'plan-1',
      caption: post.caption,
      imageUrl: 'https://cdn/planner.png',
      calendarDate: '2026-09-07',
      dayIndex: 7,
      status: 'draft',
    });
  });

  it('lança erro quando faltam post/planId', async () => {
    await expect(processPlannerImageJob({ mode: 'planner', tenantId: 't1' } as any))
      .rejects.toThrow('Job de imagem do planner sem post/planId');
  });
});