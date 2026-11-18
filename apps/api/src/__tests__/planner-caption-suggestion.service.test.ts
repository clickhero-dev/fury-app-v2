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
import { resolveAiKey } from '../lib/ai-key-context.js';
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
    vi.resetAllMocks();
    process.env.R2_PUBLIC_URL = 'https://media.example.com';
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

// Dado mídia própria, quando gerar, então usa somente contexto autorizado.
describe('BDD: mídia contextual', () => {
  beforeEach(() => { vi.resetAllMocks(); process.env.R2_PUBLIC_URL = 'https://media.example.com'; });
  it('Cenário: imagem própria → envia imagem e usa modelo de visão estável', async () => {
    repoFactory.mockReturnValue({ findAssetByUrl: vi.fn().mockResolvedValue({ type: 'image' }) });
    chat.mockResolvedValue('{"caption":"Novidade visual"}');
    expect(await service().suggest('tenant-1', { imageUrl: 'https://media.example.com/a.png' })).toEqual({ caption: 'Novidade visual', imageUsed: true });
    expect(repoFactory).toHaveBeenCalledWith('tenant-1');
    expect(chat.mock.calls[0][0][1].content).toContainEqual({ type: 'image_url', image_url: { url: 'https://media.example.com/a.png' } });
    expect(chat.mock.calls[0][1].model).toBe('google/gemini-2.5-flash-lite');
  });
  it('Cenário: origem proibida → 400 sem consultar mídia nem provedor', async () => {
    await expect(service().suggest('tenant-1', { context: 'tema', imageUrl: 'https://evil.example/a' })).rejects.toMatchObject({ statusCode: 400 });
    expect(repoFactory).not.toHaveBeenCalled(); expect(chat).not.toHaveBeenCalled();
  });
  it('Cenário: mídia de outro tenant → 404 genérico ou fallback textual', async () => {
    repoFactory.mockReturnValue({ findAssetByUrl: vi.fn().mockResolvedValue(null) });
    await expect(service().suggest('tenant-1', { imageUrl: 'https://media.example.com/a.png' })).rejects.toMatchObject({ statusCode: 404 });
    expect(chat).not.toHaveBeenCalled();
    chat.mockResolvedValue('{"caption":"Pelo tema"}');
    expect(await service().suggest('tenant-1', { context: 'tema', imageUrl: 'https://media.example.com/a.png' })).toEqual({ caption: 'Pelo tema', imageUsed: false });
  });
  it('Cenário: vídeo próprio sem tema → transcreve e gera pela fala sem enviar vídeo ao chat', async () => {
    repoFactory.mockReturnValue({ findAssetByUrl: vi.fn().mockResolvedValue({ type: 'video' }) });
    const transcribe = vi.fn().mockResolvedValue('Conheça nossa loja de flores');
    chat.mockResolvedValue('{"caption":"Flores para você"}');
    const sut = new PlannerCaptionSuggestionService({ chat }, repoFactory, { transcribe });
    expect((await sut.suggest('tenant-1', { videoUrl: 'https://media.example.com/a.mp4' })).caption).toBe('Flores para você');
    expect(transcribe).toHaveBeenCalledWith('https://media.example.com/a.mp4');
    expect(JSON.stringify(chat.mock.calls[0][0])).toContain('Conheça nossa loja de flores');
    expect(JSON.stringify(chat.mock.calls[0][0])).not.toContain('https://media.example.com/a.mp4');
  });
  it('Cenário: vídeo sem fala e sem tema → orientação segura sem inventar legenda', async () => {
    repoFactory.mockReturnValue({ findAssetByUrl: vi.fn().mockResolvedValue({ type: 'video' }) });
    const sut = new PlannerCaptionSuggestionService({ chat }, repoFactory, { transcribe: vi.fn().mockResolvedValue('') });
    await expect(sut.suggest('tenant-1', { videoUrl: 'https://media.example.com/a.mp4' })).rejects.toMatchObject({ statusCode: 422, code: 'CAPTION_VIDEO_NO_SPEECH' });
    expect(chat).not.toHaveBeenCalled();
  });
  it('Cenário: falha de transcrição → 503 seguro sem erro bruto', async () => {
    repoFactory.mockReturnValue({ findAssetByUrl: vi.fn().mockResolvedValue({ type: 'video' }) });
    const sut = new PlannerCaptionSuggestionService({ chat }, repoFactory, { transcribe: vi.fn().mockRejectedValue(new Error('secret')) });
    await expect(sut.suggest('tenant-1', { videoUrl: 'https://media.example.com/a.mp4' })).rejects.toMatchObject({ statusCode: 503, code: 'CAPTION_TRANSCRIPTION_UNAVAILABLE' });
    expect(chat).not.toHaveBeenCalled();
  });
});

describe('BDD: isolamento de vídeo e limites de retorno', () => {
  beforeEach(() => { vi.resetAllMocks(); process.env.R2_PUBLIC_URL = 'https://media.example.com'; });
  it('Cenário: vídeo de outro tenant → não lê nem transcreve', async () => {
    repoFactory.mockReturnValue({ findAssetByUrl: vi.fn().mockResolvedValue(null) });
    const transcribe = vi.fn();
    const sut = new PlannerCaptionSuggestionService({ chat }, repoFactory, { transcribe });
    await expect(sut.suggest('t2', { videoUrl: 'https://media.example.com/v.mp4' })).rejects.toMatchObject({ statusCode: 404 });
    expect(transcribe).not.toHaveBeenCalled(); expect(chat).not.toHaveBeenCalled();
    chat.mockResolvedValue('{"caption":"Tema"}');
    expect((await sut.suggest('t2', { videoUrl: 'https://media.example.com/v.mp4', context: 'Tema' })).caption).toBe('Tema');
    expect(transcribe).not.toHaveBeenCalled();
  });
  it.each(['not json', '{"caption":null}', '{"caption":" "}', JSON.stringify({ caption: 'x'.repeat(5001) })])('Cenário: resposta inválida em ambos modelos → 503: %s', async raw => {
    chat.mockResolvedValue(raw);
    await expect(service().suggest('t1', { context: 'Tema' })).rejects.toMatchObject({ statusCode: 503 }); expect(chat).toHaveBeenCalledTimes(2);
  });
  it('Cenário: legenda com exatamente 5000 caracteres → contrato preservado', async () => {
    chat.mockResolvedValue(JSON.stringify({ caption: 'x'.repeat(5000) }));
    expect((await service().suggest('t1', { context: 'Tema' })).caption).toHaveLength(5000);
  });
});

describe('BDD: contexto explícito da chave de IA', () => {
  it('Cenário: service fora do middleware → resolve chave do tenant informado', async () => {
    const findAiKeyByTenant = vi.fn().mockResolvedValue({ partnerId: null });
    process.env.OPENROUTER_API_KEY = 'isolated-test-key';
    const localChat = vi.fn(async () => {
      const key = await resolveAiKey({ findAiKeyByTenant } as never);
      expect(key.key).toBe('isolated-test-key');
      return '{"caption":"Legenda"}';
    });
    await new PlannerCaptionSuggestionService({ chat: localChat }, repoFactory).suggest('caption-isolated-tenant', { context: 'tema' });
    expect(findAiKeyByTenant).toHaveBeenCalledWith('caption-isolated-tenant');
    delete process.env.OPENROUTER_API_KEY;
  });
});
