import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  query: { brandKits: { findFirst: vi.fn() } },
}));
const openrouterMock = vi.hoisted(() => ({ generateImage: vi.fn() }));
const validationMock = vi.hoisted(() => ({
  validateAndUploadImage: vi.fn(),
  getFluxResolution: vi.fn(() => '1024x1024'),
  getFluxAspectRatio: vi.fn(() => '1:1'),
}));

vi.mock('@fury/db', () => ({
  db: dbMock,
  brandKits: { tenantId: 'tenantId' },
}));
vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: openrouterMock,
}));
vi.mock('../lib/image-validation.js', () => ({
  validateAndUploadImage: validationMock.validateAndUploadImage,
  getFluxResolution: validationMock.getFluxResolution,
  getFluxAspectRatio: validationMock.getFluxAspectRatio,
}));

import { imageGenerationAgent } from '../agents/image-generation.agent.js';
import type { AgentContext, PlannerOutput, CreativeOutput } from '../agents/types.js';

const LONG_PROMPT = 'a'.repeat(160); // >= 150 evita enhancePrompt (fetch externo)

const ctx: AgentContext = {
  tenantId: 't-1',
  tenant: { name: 'Acme', slug: 'acme' },
  brandKit: { logoUrl: 'http://logo.png' },
};

const planner: PlannerOutput = {
  totalPosts: 2,
  summary: { reelsCount: 0, carouselCount: 0, imageCount: 2, storiesCount: 0 },
  posts: [
    { dayIndex: 1, postType: 'image', platform: 'instagram', title: 'A', contentPillar: 'Produto', category: 'engagement' },
    { dayIndex: 2, postType: 'image', platform: 'instagram', title: 'B', contentPillar: 'Produto', category: 'educational' },
  ],
};

const creative: CreativeOutput = {
  posts: [{ dayIndex: 1, imagePrompt: LONG_PROMPT }],
};

describe('imageGenerationAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'test-key';
    dbMock.query.brandKits.findFirst.mockResolvedValue({ tenantId: 't-1', logoUrl: 'http://logo.png' });
    openrouterMock.generateImage.mockResolvedValue('data:image/png;base64,AAAA');
    validationMock.validateAndUploadImage.mockResolvedValue({
      imageUrl: 'http://img/1.png', width: 1080, height: 1080, format: 'png',
      sizeBytes: 100, postType: 'image', aspectRatio: '1:1', validated: true,
    });
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
  });

  it('gera imagem apenas para posts com prompt de creative', async () => {
    const result = await imageGenerationAgent(ctx, creative, planner);
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0].dayIndex).toBe(1);
    expect(result.posts[0].imageUrl).toBe('http://img/1.png');
    expect(openrouterMock.generateImage).toHaveBeenCalledTimes(1);
  });

  it('repassa logoUrl do brandKit para generateImage', async () => {
    await imageGenerationAgent(ctx, creative, planner);
    expect(openrouterMock.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ logoUrl: 'http://logo.png' }),
    );
  });

  it('usa logoUrl indefinido quando brandKit não tem logo', async () => {
    dbMock.query.brandKits.findFirst.mockResolvedValue({ tenantId: 't-1', logoUrl: null });
    await imageGenerationAgent(ctx, creative, planner);
    expect(openrouterMock.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({ logoUrl: undefined }),
    );
  });

  it('valida e faz upload com postType e tenantId corretos', async () => {
    await imageGenerationAgent(ctx, creative, planner);
    expect(validationMock.validateAndUploadImage).toHaveBeenCalledWith(
      'data:image/png;base64,AAAA', 'image', 1, 't-1',
    );
  });

  it('retorna posts vazios quando nenhum post tem prompt', async () => {
    const result = await imageGenerationAgent(ctx, { posts: [] }, planner);
    expect(result.posts).toEqual([]);
    expect(openrouterMock.generateImage).not.toHaveBeenCalled();
  });
});
