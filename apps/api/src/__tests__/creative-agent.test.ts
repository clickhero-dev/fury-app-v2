import { describe, it, expect, vi, beforeEach } from 'vitest';

const openrouterMock = vi.hoisted(() => ({
  chat: vi.fn(),
  generateImage: vi.fn(),
  assertCreditsAvailable: vi.fn(),
}));

vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: openrouterMock,
}));
vi.mock('../services/storage/storage.service.js', () => ({ uploadAsset: vi.fn() }));

import { creativeAgent } from '../agents/creative.agent.js';
import type { AgentContext, PlannerOutput } from '../agents/types.js';

const ctx: AgentContext = {
  tenantId: 't-1',
  tenant: { name: 'Acme', slug: 'acme' },
  brandKit: { logoUrl: 'http://logo.png' },
};

const planner: PlannerOutput = {
  totalPosts: 1,
  summary: { reelsCount: 0, carouselCount: 0, imageCount: 1, storiesCount: 0 },
  posts: [
    { dayIndex: 1, postType: 'image', platform: 'instagram', title: 'A', contentPillar: 'Produto', category: 'engagement' },
  ],
};

describe('creativeAgent — créditos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openrouterMock.assertCreditsAvailable.mockResolvedValue(undefined);
    // chat retorna JSON válido de posts/propmts
    openrouterMock.chat.mockResolvedValue(
      JSON.stringify({ posts: [{ dayIndex: 1, imagePrompt: 'Cena detalhada do produto em cima de uma mesa clara, luz natural, cores da marca, composição equilibrada e profissional.' }] }),
    );
  });

  it('aborta SEM gerar imagens quando não há créditos suficientes', async () => {
    openrouterMock.assertCreditsAvailable.mockRejectedValue(
      Object.assign(new Error('OPENROUTER_INSUFFICIENT_CREDITS'), { statusCode: 402, code: 'OPENROUTER_INSUFFICIENT_CREDITS' }),
    );

    await expect(creativeAgent(ctx, planner)).rejects.toMatchObject({
      statusCode: 402,
      code: 'OPENROUTER_INSUFFICIENT_CREDITS',
    });
    expect(openrouterMock.generateImage).not.toHaveBeenCalled();
  });

  it('checa créditos uma vez ANTES de iniciar a geração de imagens', async () => {
    openrouterMock.generateImage.mockRejectedValue(new Error('boom')); // não chega no upload

    const result = await creativeAgent(ctx, planner);

    expect(openrouterMock.assertCreditsAvailable).toHaveBeenCalledTimes(1);
    expect(result.posts).toHaveLength(1);
  });
});
