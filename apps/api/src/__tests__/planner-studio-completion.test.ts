import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockGenerateImage,
  mockChat,
  mockFindPostByPlanDateType,
  mockCreatePost,
  mockCheckAndComplete,
  mockFindAssetByUrl,
  mockConsumeQuota,
} = vi.hoisted(() => ({
  mockGenerateImage: vi.fn(),
  mockChat: vi.fn(),
  mockFindPostByPlanDateType: vi.fn(),
  mockCreatePost: vi.fn(),
  mockCheckAndComplete: vi.fn(),
  mockFindAssetByUrl: vi.fn(),
  mockConsumeQuota: vi.fn(),
}));

vi.mock('../services/studio/creative-quota.service.js', () => ({
  consumeCreativeQuota: mockConsumeQuota,
  refundCreativeQuota: vi.fn(),
}));

vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: { generateImage: mockGenerateImage, chat: mockChat, assertCreditsAvailable: vi.fn() },
}));
vi.mock('../services/planner/planner-studio.service.js', () => ({
  checkAndCompletePlannerJob: mockCheckAndComplete,
  enqueuePlannerImageJobs: vi.fn(),
  enqueueMissingPlannerPosts: vi.fn(),
}));
vi.mock('../repository/planner.repository.js', () => ({
  PlannerRepository: class {
    findPostByPlanDateType = mockFindPostByPlanDateType;
    createPost = mockCreatePost;
    countPostsByPlan = vi.fn();
    findClientGoal = vi.fn(async () => ({ niche: 'padaria', mainProduct: 'pães artesanais' }));
  },
}));
vi.mock('../repository/studio.repository.js', () => ({
  StudioRepository: class {
    createAsset = vi.fn();
    deleteAsset = vi.fn();
    findAssetByUrl = mockFindAssetByUrl;
  },
}));
vi.mock('../lib/queue.js', () => ({
  getComplianceQueue: vi.fn().mockResolvedValue({ add: vi.fn().mockResolvedValue(true) }),
}));
vi.mock('../lib/meta-api.js', () => ({ uploadAdImage: vi.fn() }));
vi.mock('../utils/crypto.js', () => ({ decryptMetaToken: vi.fn() }));
vi.mock('../lib/temp-storage.js', () => ({ saveTemporaryStudioImage: vi.fn() }));
vi.mock('../services/storage/storage.service.js', () => ({ uploadAsset: vi.fn() }));

import { processPlannerImageJob } from '../services/studio/studio.service.js';

const input = {
  mode: 'planner' as const,
  tenantId: 'tenant-1',
  planId: 'plan-1',
  post: {
    date: '2026-09-10',
    title: 'Post 1',
    caption: 'Caption legal',
    cta: 'Compre agora',
    hashtags: ['#promo'],
    imagePrompt: 'foto profissional de produto',
    postType: 'image',
    platform: 'instagram',
  },
};

describe('processPlannerImageJob — job do planner NUNCA fica preso por imagem que falha', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindPostByPlanDateType.mockResolvedValue(null);
    mockCreatePost.mockResolvedValue({ id: 'post-1' });
    mockCheckAndComplete.mockResolvedValue(undefined);
    mockConsumeQuota.mockResolvedValue(undefined);
  });

  it('sucesso na imagem → desconta 1 da cota do tenant', async () => {
    mockGenerateImage.mockResolvedValue('data:image/png;base64,AAAA');
    mockFindAssetByUrl.mockResolvedValue(null);

    await processPlannerImageJob(input as any);

    expect(mockConsumeQuota).toHaveBeenCalledTimes(1);
    expect(mockConsumeQuota).toHaveBeenCalledWith('tenant-1');
  });

  it('falha na geração da imagem → NÃO desconta cota (nenhuma imagem foi criada)', async () => {
    mockGenerateImage.mockRejectedValue(new Error('quota excedida'));

    await processPlannerImageJob(input as any);

    expect(mockConsumeQuota).not.toHaveBeenCalled();
  });

  it('falha na geração da imagem → cria o post SEM imagem e completa o job (não lança)', async () => {
    mockGenerateImage.mockRejectedValue(new Error('quota excedida'));

    const result = await processPlannerImageJob(input as any);

    expect(mockGenerateImage).toHaveBeenCalledTimes(1);
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    const insert = mockCreatePost.mock.calls[0][0];
    expect(insert).toMatchObject({ planId: 'plan-1', tenantId: 'tenant-1', status: 'draft' });
    expect(insert.imageUrl).toBeUndefined();
    // job completa mesmo sem imagem — a tela nunca fica presa em "gerando..."
    expect(mockCheckAndComplete).toHaveBeenCalledWith('plan-1', 'tenant-1');
  });

  it('post já existente (retry idempotente) → não cria duplicado e ainda completa o job', async () => {
    mockGenerateImage.mockRejectedValue(new Error('não deve gerar'));
    mockFindPostByPlanDateType.mockResolvedValue({ id: 'post-1', imageUrl: 'https://cdn.x/png' });
    mockFindAssetByUrl.mockResolvedValue({ id: 'asset-1' });

    await processPlannerImageJob(input as any);

    expect(mockCreatePost).not.toHaveBeenCalled();
    expect(mockConsumeQuota).not.toHaveBeenCalled(); // retry NÃO desconta de novo
    expect(mockCheckAndComplete).toHaveBeenCalledWith('plan-1', 'tenant-1');
  });
});