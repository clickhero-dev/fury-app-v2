import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processPlannerImageJob, aspectForPlannerPostType, normalizePlannerPost } from '../services/studio/studio.service.js';
import type { PlannerPrompt } from '../agents/types.js';

const { dbMock, mockGenerateImage, mockUploadAsset, mockFindByPlanId } = vi.hoisted(() => ({
  dbMock: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    query: {
      creativeAssets: { findFirst: vi.fn() },
      clientGoals: { findFirst: vi.fn() },
      metaConnections: { findFirst: vi.fn() },
      socialPosts: { findFirst: vi.fn() },
    },
  },
  mockGenerateImage: vi.fn(),
  mockUploadAsset: vi.fn(),
  mockFindByPlanId: vi.fn(),
}));

vi.mock('../planner-store.js', () => ({
  plannerStore: { findByPlanId: mockFindByPlanId },
}));

vi.mock('@fury/db', async () => {
  const { sql } = await import('drizzle-orm');
  return {
    db: dbMock,
    socialPosts: { id: 'id', tenantId: 'tenantId' },
    clientGoals: {},
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
    dbMock.query.socialPosts.findFirst.mockResolvedValue(undefined); // nenhum post existente (idempotência)
    dbMock.query.clientGoals.findFirst.mockResolvedValue(null); // sem clientGoal cadastrado (guardrail de nicho)
    mockFindByPlanId.mockResolvedValue(null); // checkAndCompletePlannerJob: nenhum job do planner
    dbMock.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ total: 0 }]) }),
    });
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

    // O insert do social_post (último insert do fluxo) recebe calendar_date, caption, etc.
    const lastInsert = dbMock.insert.mock.results.at(-1)!.value;
    const inserted = lastInsert.values.mock.calls[0][0];
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

  it('é idempotente: se o social_post já existe, retorna o existente sem gerar nova imagem', async () => {
    dbMock.query.socialPosts.findFirst.mockResolvedValue({
      imageUrl: 'https://cdn/existing.png',
    });
    dbMock.query.creativeAssets.findFirst.mockResolvedValue({ id: 'asset-1' });

    const result = await processPlannerImageJob({
      mode: 'planner',
      tenantId: 't1',
      planId: 'plan-1',
      post,
      logoUrl: 'https://cdn/logo.png',
    });

    expect(result.imageUrl).toBe('https://cdn/existing.png');
    expect(result.creativeAssetId).toBe('asset-1');
    expect(mockGenerateImage).not.toHaveBeenCalled();
    expect(mockUploadAsset).not.toHaveBeenCalled();
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  describe('normalizePlannerPost — validação defensiva (insert nunca quebra por shape)', () => {
    it('normaliza data inválida para amanhã (UTC) e mantém enums/arrays válidos', () => {
      const normalized = normalizePlannerPost({
        ...post,
        date: '07/09/2026',
      });
      expect(normalized.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      expect(normalized.date).toBe(tomorrow);
    });

    it('normaliza postType/platform fora do enum para image/instagram', () => {
      const normalized = normalizePlannerPost({
        ...post,
        postType: 'story' as any,
        platform: 'all' as any,
      });
      expect(normalized.postType).toBe('image');
      expect(normalized.platform).toBe('instagram');
    });

    it('normaliza hashtags não-array para []', () => {
      const normalized = normalizePlannerPost({ ...post, hashtags: 'não-array' as any });
      expect(normalized.hashtags).toEqual([]);
    });

    it('mantém valores válidos intactos', () => {
      const normalized = normalizePlannerPost(post);
      expect(normalized).toEqual(post);
    });
  });

  it('não lança erro de banco quando o post chega com data/enum inválido (normaliza antes do insert)', async () => {
    mockGenerateImage.mockResolvedValue('data:image/png;base64,AAAABBBB');
    mockUploadAsset.mockResolvedValue('https://cdn/planner.png');

    const result = await processPlannerImageJob({
      mode: 'planner',
      tenantId: 't1',
      planId: 'plan-1',
      post: { ...post, date: 'data-invalida', postType: 'story' as any },
      logoUrl: 'https://cdn/logo.png',
    });

    expect(result.imageUrl).toBe('https://cdn/planner.png');
    const lastInsert = dbMock.insert.mock.results.at(-1)!.value;
    const inserted = lastInsert.values.mock.calls[0][0];
    expect(inserted.calendarDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(inserted.postType).toBe('image');
    expect(Number.isNaN(inserted.dayIndex)).toBe(false);
  });
});