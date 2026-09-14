import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  openRouterChat: vi.fn(),
  createAsset: vi.fn(),
}));

vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: { chat: state.openRouterChat },
}));

vi.mock('../repository/studio.repository.js', () => ({
  StudioRepository: vi.fn().mockImplementation(function () {
    return {
      createAsset: state.createAsset,
    };
  }),
}));

import { generateAdCopy } from '../services/studio/studio-copy.service.js';

describe('generateAdCopy via OpenRouter (sem OpenAI)', () => {
  beforeEach(() => {
    state.openRouterChat.mockReset();
    state.createAsset.mockReset();
    delete process.env.OPENAI_API_KEY;
  });

  it('chama o chat do OpenRouter para gerar as variações', async () => {
    state.openRouterChat
      .mockResolvedValueOnce(
        JSON.stringify([
          { headline: 'Cadeira top', primary_text: 'Conforto total', cta: 'Comprar', reasoning: 'foco em conforto' },
          { headline: 'Cadeira x', primary_text: 'Ergonomia', cta: 'Saiba mais', reasoning: 'foco em ergonomia' },
        ])
      )
      .mockResolvedValue(JSON.stringify({ approved: true, issues: [] }));
    state.createAsset.mockResolvedValue({ id: 'ast-1', complianceStatus: 'approved' });
    state.createAsset.mockResolvedValueOnce({ id: 'ast-1', complianceStatus: 'approved' });
    state.createAsset.mockResolvedValueOnce({ id: 'ast-2', complianceStatus: 'approved' });

    const out = await generateAdCopy({ objective: 'vendas', product: 'Cadeira', quantity: 2 }, 't-1');

    expect(state.openRouterChat).toHaveBeenCalledTimes(3); // 1 geração + 2 compliance de texto
    expect(state.openRouterChat.mock.calls[0][1]).toMatchObject({ response_format: { type: 'json_object' } });
    expect(out.variations).toHaveLength(2);
    expect(out.variations[0]).toMatchObject({ headline: 'Cadeira top', compliance_status: 'approved' });
  });

  it('remove o mock silencioso: sem OPENAI_API_KEY continua via OpenRouter (nunca gera variação mock)', async () => {
    state.openRouterChat
      .mockResolvedValueOnce(
        JSON.stringify([
          { headline: 'Cadeira top', primary_text: 'Conforto total', cta: 'Comprar', reasoning: 'foco' },
        ])
      )
      .mockResolvedValue(JSON.stringify({ approved: true, issues: [] }));
    state.createAsset.mockResolvedValue({ id: 'ast-1', complianceStatus: 'approved' });

    const out = await generateAdCopy({ product: 'Cadeira', quantity: 1 }, 't-1');

    expect(state.openRouterChat).toHaveBeenCalled();
    expect(out.variations[0].headline).toBe('Cadeira top');
    expect(out.variations[0].headline).not.toBe('Produto - variação 1'); // nunca o mock antigo
    expect(out.variations[0].compliance_status).toBe('approved');
  });
});