import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildContentDates,
  generateContentPrompts,
  deriveCta,
  deriveHashtags,
} from '../agents/planner.agent.js';

const mockInvoke = vi.fn();
vi.mock('../agents/base.agent.js', () => ({
  createBasicAgent: vi.fn(() => ({ invoke: mockInvoke })),
}));

const context = {
  tenantId: 't1',
  businessName: 'Padaria Central',
  brandKit: { voiceTone: 'acolhedor', primaryColor: '#E07B39', logoUrl: 'https://cdn/logo.png' },
  goals: { niche: 'panificação', mainProduct: 'pão artesanal', objective: 'vender mais' },
  city: 'São Paulo',
};

const FROM = new Date('2026-09-01T12:00:00Z');
const FROM_DAY = '2026-09-01';

describe('buildContentDates — espaçamento puro, determinístico', () => {
  it('gera exatamente N datas no futuro, ordenadas e em formato YYYY-MM-DD', () => {
    const dates = buildContentDates(8, FROM);
    expect(dates).toHaveLength(8);
    for (let i = 0; i < dates.length; i++) {
      expect(dates[i].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(dates[i].date > FROM_DAY).toBe(true);
      if (i > 0) expect(dates[i].date > dates[i - 1].date).toBe(true);
    }
  });

  it('é determinístico para o mesmo from', () => {
    expect(buildContentDates(8, FROM)).toEqual(buildContentDates(8, FROM));
  });

  it('nomeia cada item de forma estável (Conteúdo #i)', () => {
    const dates = buildContentDates(3, FROM);
    expect(dates.map((d) => d.name)).toEqual(['Conteúdo #1', 'Conteúdo #2', 'Conteúdo #3']);
  });
});

describe('generateContentPrompts — resposta achatada {title, descricao, prompt}', () => {
  const dates = buildContentDates(3, FROM);

  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('gera PlannerPrompt[] com zip de datas/tipos/cta/hashtags a partir de resposta achatada', async () => {
    mockInvoke.mockResolvedValueOnce({
      structuredResponse: {
        posts: [
          { title: 'Post A', descricao: 'legenda A', prompt: 'imagem A' },
          { title: 'Post B', descricao: 'legenda B', prompt: 'imagem B' },
          { title: 'Post C', descricao: 'legenda C', prompt: 'imagem C' },
        ],
      },
      messages: [],
    });

    const posts = await generateContentPrompts(context, dates);
    expect(posts).toHaveLength(3);
    expect(posts[0]).toMatchObject({
      date: dates[0].date,
      title: 'Post A',
      caption: 'legenda A',
      imagePrompt: 'imagem A',
      postType: 'image',
      platform: 'instagram',
    });
    expect(posts[1].postType).toBe('stories'); // alterna feed/stories
    expect(posts[2].postType).toBe('image');
    expect(posts[0].cta).toBeTruthy();
    expect(posts[0].hashtags.length).toBeGreaterThan(0);
  });

  it('faz fallback parseando content em string com markdown quando não há structuredResponse', async () => {
    mockInvoke.mockResolvedValueOnce({
      messages: [{ role: 'ai', content: '```json {"posts":[{"title":"P","descricao":"D","prompt":"I"}]} ```' }],
    });

    const posts = await generateContentPrompts(context, dates);
    expect(posts).toHaveLength(3); // 1 válido + 2 fallback
    expect(posts[0].title).toBe('P');
    expect(posts[0].date).toBe(dates[0].date);
  });

  it('extrai conteúdo quando content é um ARRAY de blocos de texto (bug de estruturação da resposta)', async () => {
    mockInvoke.mockResolvedValueOnce({
      messages: [{ role: 'ai', content: [{ type: 'text', text: '{"posts":[{"title":"Array","descricao":"D","prompt":"I"}]}' }] }],
    });

    const posts = await generateContentPrompts(context, dates);
    expect(posts).toHaveLength(3);
    expect(posts[0].title).toBe('Array');
  });

  it('filtra itens inválidos (campo ausente/vazio) e preenche com fallback — nada vaza pro banco', async () => {
    mockInvoke.mockResolvedValueOnce({
      structuredResponse: {
        posts: [
          { title: 'Ok', descricao: 'D', prompt: 'I' },
          { title: 'Faltando campos' },
          { title: '', descricao: 'D', prompt: 'I' },
        ],
      },
      messages: [],
    });

    const posts = await generateContentPrompts(context, dates);
    expect(posts).toHaveLength(3);
    expect(posts[0].title).toBe('Ok');
    expect(posts[1].title).not.toBe('Faltando campos');
    expect(posts[2].title).not.toBe('');
    expect(posts.every((p) => p.title.length > 0 && p.caption.length > 0 && p.imagePrompt.length > 0)).toBe(true);
  });

  it('preenche itens faltantes com fallback determinístico — nunca retorna vazio', async () => {
    mockInvoke.mockResolvedValueOnce({ structuredResponse: { posts: [] }, messages: [] });

    const posts = await generateContentPrompts(context, dates); // 3 datas
    expect(posts).toHaveLength(3);
    expect(posts[0].title).toBeTruthy();
    expect(posts[0].imagePrompt).toContain('pão artesanal');
  });

  it('limita ao número de datas mesmo se o modelo retornar mais', async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ title: `p${i}`, descricao: 'c', prompt: 'img' }));
    mockInvoke.mockResolvedValueOnce({ structuredResponse: { posts: many }, messages: [] });

    const posts = await generateContentPrompts(context, dates);
    expect(posts).toHaveLength(3);
  });
});

describe('deriveCta / deriveHashtags — helpers determinísticos', () => {
  it('deriveCta é determinístico e não vazio', () => {
    expect(deriveCta(context, 0)).toBe(deriveCta(context, 0));
    expect(deriveCta(context, 0).length).toBeGreaterThan(0);
  });

  it('deriveCta prioriza o objetivo do negócio quando reconhecível', () => {
    expect(deriveCta({ ...context, goals: { objective: 'quero vender mais' } }, 0)).toContain('Compre');
  });

  it('deriveHashtags normaliza nicho/cidade/nome em hashtags sem espaço/acento', () => {
    const tags = deriveHashtags(context);
    expect(tags).toContain('#panificacao');
    expect(tags).toContain('#saopaulo');
    expect(tags).toContain('#padariacentral');
    expect(tags.length).toBeGreaterThan(0);
  });

  it('deriveHashtags tem fallback quando contexto é mínimo', () => {
    expect(deriveHashtags({ tenantId: 't1', businessName: '' }).length).toBeGreaterThan(0);
  });
});