import { describe, it, expect } from 'vitest';
import { qualityAgent } from '../agents/quality.agent.js';
import type { PlannerOutput, CopywriterOutput } from '../agents/types.js';

function makePlanner(posts: PlannerOutput['posts']): PlannerOutput {
  return {
    totalPosts: posts.length,
    summary: { reelsCount: 0, carouselCount: 0, imageCount: 0, storiesCount: 0 },
    posts,
  };
}

function makeCopy(count: number, cta = 'Saiba mais'): CopywriterOutput {
  return {
    posts: Array.from({ length: count }, (_, i) => ({
      dayIndex: i + 1,
      caption: `Legenda ${i + 1}`,
      cta,
      hashtags: ['#tag'],
    })),
  };
}

const basePosts = (): PlannerOutput['posts'] => [
  { dayIndex: 1, postType: 'reel', platform: 'instagram', title: 'Titulo A', contentPillar: 'Produto', category: 'engagement' },
  { dayIndex: 2, postType: 'carousel', platform: 'instagram', title: 'Titulo B', contentPillar: 'Educacional', category: 'educational' },
  { dayIndex: 3, postType: 'image', platform: 'instagram', title: 'Titulo C', contentPillar: 'Produto', category: 'engagement' },
  { dayIndex: 4, postType: 'stories', platform: 'instagram', title: 'Titulo D', contentPillar: 'Produto', category: 'engagement' },
];

describe('qualityAgent', () => {
  it('passa quando todos os checks são válidos', async () => {
    const result = await qualityAgent(makePlanner(basePosts()), makeCopy(4));
    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(5);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it('reprova quando há títulos duplicados', async () => {
    const posts = basePosts();
    posts[1] = { ...posts[1], title: 'titulo a' }; // duplica 'Titulo A' (lowercase)
    const result = await qualityAgent(makePlanner(posts), makeCopy(4));
    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => c.name === 'Conteudo duplicado')?.passed).toBe(false);
  });

  it('reprova quando vendas excedem 30%', async () => {
    const posts = basePosts().map((p, i) => (i < 2 ? { ...p, category: 'sales' as const } : p)); // 2/4 = 50%
    const result = await qualityAgent(makePlanner(posts), makeCopy(4));
    expect(result.passed).toBe(false);
    const sales = result.checks.find((c) => c.name === 'Distribuicao de vendas');
    expect(sales?.passed).toBe(false);
    expect(sales?.message).toContain('50%');
  });

  it('reprova quando há 3+ formatos consecutivos iguais', async () => {
    const posts = basePosts().map((p) => ({ ...p, postType: 'reel' as const }));
    const result = await qualityAgent(makePlanner(posts), makeCopy(4));
    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => c.name === 'Alternar formatos')?.passed).toBe(false);
  });

  it('reprova quando dayIndex está fora de 1-31', async () => {
    const posts = basePosts();
    posts[0] = { ...posts[0], dayIndex: 0 };
    posts[1] = { ...posts[1], dayIndex: 32 };
    const result = await qualityAgent(makePlanner(posts), makeCopy(4));
    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => c.name === 'Datas validas')?.passed).toBe(false);
  });

  it('reprova quando há post sem CTA', async () => {
    const result = await qualityAgent(makePlanner(basePosts()), makeCopy(4, ''));
    expect(result.passed).toBe(false);
    expect(result.checks.find((c) => c.name === 'CTA presente')?.passed).toBe(false);
  });

  it('agrega os motivos no failedItem quando reprova', async () => {
    const posts = basePosts();
    posts[1] = { ...posts[1], title: 'titulo a' };
    const result = await qualityAgent(makePlanner(posts), makeCopy(4, ''));
    expect(result.passed).toBe(false);
    expect(result.failedItem?.agent).toBe('planner');
    expect(result.failedItem?.reason).toContain('Titulos duplicados');
    expect(result.failedItem?.reason).toContain('Post sem CTA');
  });
});
