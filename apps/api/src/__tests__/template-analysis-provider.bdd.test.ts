import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../lib/ai-key-context.js', () => ({ resolveAiKey: async () => ({ key: 'test-key' }) }));
import { openrouterService } from '../services/llms/openrouter.service.js';
const options = { model: 'vision', text: 'private prompt', imageUrls: ['https://private/photo'], jsonMode: true };
afterEach(() => vi.restoreAllMocks());

describe('Dado o adapter de visão com HTTP simulado', () => {
  it.each([400, 401, 403, 404, 408, 429, 500, 502, 503])('Quando HTTP %i, então classifica retry sem registrar resposta', async (status) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('private provider payload', { status }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(openrouterService.chatWithImages(options)).rejects.toMatchObject({ code: 'OPENROUTER_CHAT_ERROR', details: { retryable: [408, 429].includes(status) || status >= 500, providerStatus: status } });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private');
  });
  it('Quando timeout, então usa deadline e erro tipado seguro', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('private', 'TimeoutError'));
    await expect(openrouterService.chatWithImages(options)).rejects.toMatchObject({ code: 'OPENROUTER_CHAT_TIMEOUT', details: { retryable: true } });
    expect(fetch.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it('Quando a rede falha, então permite retry sem vazar erro', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('private'));
    await expect(openrouterService.chatWithImages(options)).rejects.toMatchObject({ code: 'OPENROUTER_CHAT_NETWORK', details: { retryable: true } });
  });
  it('Quando envelope não é JSON, então não repete como falha de rede', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('private', { status: 200 }));
    await expect(openrouterService.chatWithImages(options)).rejects.toMatchObject({ code: 'OPENROUTER_CHAT_RESPONSE_INVALID', details: { retryable: false } });
  });
  it('Quando timeout ao ler o corpo, então classifica como transitório', async () => {
    const response = new Response('{}');
    vi.spyOn(response, 'text').mockRejectedValue(new DOMException('private', 'TimeoutError'));
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    await expect(openrouterService.chatWithImages(options)).rejects.toMatchObject({ code: 'OPENROUTER_CHAT_TIMEOUT', details: { retryable: true } });
  });
  it('Quando há conteúdo válido, então preserva resposta e custo', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ choices: [{ message: { content: '{}' } }], usage: { cost: 0.02 } }));
    expect(await openrouterService.chatWithImages(options)).toEqual({ content: '{}', costUsd: 0.02 });
  });
  it('Quando falta conteúdo, então normaliza como vazio para o schema', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}));
    expect(await openrouterService.chatWithImages(options)).toEqual({ content: '', costUsd: null });
  });
});
