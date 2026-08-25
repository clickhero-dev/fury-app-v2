import { describe, it, expect, vi, beforeEach } from 'vitest';

const openrouterMock = vi.hoisted(() => ({ chat: vi.fn() }));

vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: openrouterMock,
}));

import { analyticsAgent } from '../agents/analytics.agent.js';
import { strategyAgent } from '../agents/strategy.agent.js';
import { researchAgent } from '../agents/research.agent.js';
import { plannerAgent } from '../agents/planner.agent.js';
import { brandingAgent } from '../agents/branding.agent.js';
import { copywriterAgent } from '../agents/copywriter.agent.js';
import type {
  AgentContext, ResearchOutput, AnalyticsOutput, StrategyOutput, PlannerOutput, CreativeOutput,
} from '../agents/types.js';

const ctx: AgentContext = {
  tenantId: 't-1',
  tenant: { name: 'Acme', businessContext: 'E-commerce', slug: 'acme' },
  brandKit: { voiceTone: 'amigavel' },
  goals: { objective: 'Vendas', mainProduct: 'Camisetas', targetAudience: { idade: '18-35' } },
};

const research: ResearchOutput = {
  trends: ['trend1', 'trend2'],
  holidays: [{ name: 'Dia do Cliente', day: 15 }],
  nicheTopics: ['topico'],
};

const analytics: AnalyticsOutput = {
  bestFormats: ['reel'], bestDays: ['segunda'], engagementTips: ['dica'],
};

const strategy: StrategyOutput = {
  objective: 'Vender mais',
  contentPillars: [{ name: 'Produto', ratio: 40 }, { name: 'Engajamento', ratio: 30 }],
  toneGuidelines: 'amigavel',
  targetAudience: '18-35',
};

const planner: PlannerOutput = {
  totalPosts: 2,
  summary: { reelsCount: 1, carouselCount: 0, imageCount: 1, storiesCount: 0 },
  posts: [
    { dayIndex: 2, postType: 'reel', platform: 'instagram', title: 'Titulo 1', contentPillar: 'Produto', category: 'engagement' },
    { dayIndex: 3, postType: 'image', platform: 'instagram', title: 'Titulo 2', contentPillar: 'Produto', category: 'educational' },
  ],
};

const creative: CreativeOutput = {
  posts: [{ dayIndex: 2, imagePrompt: 'prompt da imagem' }],
};

function userContent(msgs: { role: string; content: string }[]): string {
  return msgs.find((m) => m.role === 'user')?.content ?? '';
}

describe('agentes LLM (mock openrouterService)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('analyticsAgent retorna o JSON parseado do chat', async () => {
    openrouterMock.chat.mockResolvedValue('{"bestFormats":["reel"],"bestDays":["segunda"],"engagementTips":["d1","d2"]}');
    const result = await analyticsAgent(ctx);
    expect(result.bestFormats).toEqual(['reel']);
    expect(result.engagementTips).toHaveLength(2);
    expect(userContent(openrouterMock.chat.mock.calls[0][0])).toContain('Acme');
    expect(openrouterMock.chat.mock.calls[0][1]).toMatchObject({ response_format: { type: 'json_object' } });
  });

  it('researchAgent inclui público-alvo no prompt e parseia resposta', async () => {
    openrouterMock.chat.mockResolvedValue('{"trends":["t1"],"holidays":[{"name":"Dia X","day":15}],"nicheTopics":["n1"]}');
    const result = await researchAgent(ctx);
    expect(result.holidays).toEqual([{ name: 'Dia X', day: 15 }]);
    expect(userContent(openrouterMock.chat.mock.calls[0][0])).toContain('E-commerce');
  });

  it('strategyAgent usa tendências e datas no prompt', async () => {
    openrouterMock.chat.mockResolvedValue('{"objective":"Vender","contentPillars":[{"name":"Produto","ratio":100}],"toneGuidelines":"x","targetAudience":"y"}');
    const result = await strategyAgent(ctx, research, analytics);
    expect(result.objective).toBe('Vender');
    const content = userContent(openrouterMock.chat.mock.calls[0][0]);
    expect(content).toContain('trend1, trend2');
    expect(content).toContain('Dia do Cliente (dia 15)');
  });

  it('plannerAgent calcula d+1 e dia máximo do mês no prompt', async () => {
    openrouterMock.chat.mockResolvedValue('{"totalPosts":16,"summary":{"reelsCount":8,"carouselCount":4,"imageCount":4,"storiesCount":4},"posts":[]}');
    const result = await plannerAgent(ctx, research, strategy, '2026-08-24T12:00:00');
    expect(result.totalPosts).toBe(16);
    const content = userContent(openrouterMock.chat.mock.calls[0][0]);
    expect(content).toContain('NO DIA 25/8/2026'); // d+1 de 24/08/2026
    expect(content).toContain('entre 25 e 31'); // último dia de agosto
  });

  it('brandingAgent monta amostra dos posts no prompt', async () => {
    openrouterMock.chat.mockResolvedValue('{"approved":true,"notes":"ok","violations":[]}');
    const result = await brandingAgent(ctx, planner, { posts: [{ dayIndex: 2, caption: 'c', cta: 'cta', hashtags: [] }] }, creative);
    expect(result.approved).toBe(true);
    const content = userContent(openrouterMock.chat.mock.calls[0][0]);
    expect(content).toContain('Titulo 1');
    expect(content).toContain('prompt da imagem');
  });

  describe('copywriterAgent (retry)', () => {
    it('retorna no primeiro sucesso', async () => {
      openrouterMock.chat.mockResolvedValue('{"posts":[{"dayIndex":2,"caption":"c","cta":"cta","hashtags":["#x"]}]}');
      const result = await copywriterAgent(ctx, planner);
      expect(result.posts[0].caption).toBe('c');
      expect(openrouterMock.chat).toHaveBeenCalledTimes(1);
    });

    it('tenta novamente após falha de parse e recupera', async () => {
      openrouterMock.chat
        .mockResolvedValueOnce('not json')
        .mockResolvedValueOnce('{"posts":[{"dayIndex":2,"caption":"ok","cta":"cta","hashtags":[]}]}');
      const result = await copywriterAgent(ctx, planner);
      expect(result.posts[0].caption).toBe('ok');
      expect(openrouterMock.chat).toHaveBeenCalledTimes(2);
    });

    it('lança o último erro após 2 falhas', async () => {
      openrouterMock.chat.mockRejectedValue(new Error('rate limit'));
      await expect(copywriterAgent(ctx, planner)).rejects.toThrow('rate limit');
      expect(openrouterMock.chat).toHaveBeenCalledTimes(2);
    });
  });
});
