/*
# Language: pt-BR

Funcionalidade: Sugestão de legenda do Planejador

  Cenário: gerar pelo tema sem imagem
    Dado um tema válido
    Quando o provedor retorna JSON com legenda
    Então devolve a legenda validada sem usar imagem

  Cenário: falha do primeiro modelo
    Dado uma falha transitória no primeiro modelo
    Quando o segundo modelo retorna uma legenda válida
    Então devolve a sugestão do fallback

  Cenário: respostas inválidas
    Dado que ambos modelos retornam JSON inválido, vazio ou maior que 5000 caracteres
    Quando a sugestão é solicitada
    Então retorna erro seguro 503 sem truncar a legenda
*/
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../middleware/errorHandler.js';
import { PlannerCaptionSuggestionService } from '../services/planner/planner-caption-suggestion.service.js';

const chat = vi.fn();
const repoFactory = vi.fn();

function service() {
  return new PlannerCaptionSuggestionService(
    { chat } as never,
    repoFactory as never,
  );
}

describe('BDD: PlannerCaptionSuggestionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('Cenário: gerar pelo tema sem imagem → caption válida e imageUsed false', async () => {
    chat.mockResolvedValueOnce('{"caption":"Conheça nossa novidade e fale com a gente!"}');
    const result = await service().suggest('tenant-1', { context: 'lançamento de produto' });
    expect(result).toEqual({ caption: 'Conheça nossa novidade e fale com a gente!', imageUsed: false });
    expect(chat).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ timeoutMs: 20_000 }));
  });

  it('Cenário: falha do primeiro modelo → tenta o fallback', async () => {
    chat.mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('{"caption":"Legenda de fallback."}');
    const result = await service().suggest('tenant-1', { context: 'tema' });
    expect(result.caption).toBe('Legenda de fallback.');
    expect(chat).toHaveBeenCalledTimes(2);
  });

  it('Cenário: respostas inválidas → erro 503 seguro sem truncar', async () => {
    chat.mockResolvedValueOnce('{"caption":""}')
      .mockResolvedValueOnce(JSON.stringify({ caption: 'x'.repeat(5001) }));
    await expect(service().suggest('tenant-1', { context: 'tema' }))
      .rejects.toMatchObject<AppError>({ statusCode: 503, code: 'CAPTION_SUGGESTION_UNAVAILABLE' });
  });
});
