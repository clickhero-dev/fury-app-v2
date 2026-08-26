import { describe, it, expect, vi, beforeEach } from 'vitest';
import { researchImportantDates, generateContentPrompts } from '../agents/planner.agent.js';

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

describe('planner.agent langchain', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it('researchImportantDates retorna datas do structuredResponse', async () => {
    mockInvoke.mockResolvedValueOnce({
      structuredResponse: {
        dates: [
          { date: '2026-09-07', name: 'Independência do Brasil', reason: 'feriado nacional' },
          { date: '2026-09-12', name: 'Dia do Pão', reason: 'nicho' },
        ],
      },
      messages: [],
    });

    const dates = await researchImportantDates(context);
    expect(dates).toHaveLength(2);
    expect(dates[0]).toMatchObject({ date: '2026-09-07', name: 'Independência do Brasil' });
  });

  it('researchImportantDates faz fallback parseando a mensagem quando não há structuredResponse', async () => {
    mockInvoke.mockResolvedValueOnce({
      messages: [{ role: 'ai', content: '```json {"dates":[{"date":"2026-10-12","name":"Dia das Crianças"}]} ```' }],
    });

    const dates = await researchImportantDates(context);
    expect(dates).toHaveLength(1);
    expect(dates[0].name).toBe('Dia das Crianças');
  });

  it('researchImportantDates retorna [] para resposta sem dates', async () => {
    mockInvoke.mockResolvedValueOnce({ structuredResponse: { dates: null } });
    const dates = await researchImportantDates(context);
    expect(dates).toEqual([]);
  });

  it('generateContentPrompts retorna exatamente 8 posts e inclui as datas no prompt', async () => {
    const posts = Array.from({ length: 10 }, (_, i) => ({
      date: '2026-09-0' + ((i % 9) + 1),
      title: `Post ${i}`,
      caption: 'legenda',
      cta: 'compre',
      hashtags: ['#pade'],
      imagePrompt: 'imagem de pão',
      postType: 'image' as const,
      platform: 'instagram' as const,
    }));

    mockInvoke.mockResolvedValueOnce({ structuredResponse: { posts }, messages: [] });

    const result = await generateContentPrompts(context, [{ date: '2026-09-07', name: 'feriado' }]);
    expect(result).toHaveLength(8);

    const callArg = (mockInvoke.mock.calls[0][0] as { messages: { content: string }[] });
    expect(callArg.messages[0].content).toContain('2026-09-07');
    expect(callArg.messages[0].content).toContain('Padaria Central');
  });

  it('generateContentPrompts limita a 8 mesmo se o modelo retornar mais', async () => {
    const posts = Array.from({ length: 12 }, (_, i) => ({
      date: '2026-10-01',
      title: `p${i}`,
      caption: 'c',
      cta: 'cta',
      hashtags: [],
      imagePrompt: 'img',
      postType: 'image' as const,
      platform: 'both' as const,
    }));
    mockInvoke.mockResolvedValueOnce({ structuredResponse: { posts }, messages: [] });
    const result = await generateContentPrompts(context, []);
    expect(result).toHaveLength(8);
  });
});