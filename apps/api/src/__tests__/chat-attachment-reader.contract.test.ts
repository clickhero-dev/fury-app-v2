/* Funcionalidade: leitura multimodal real, não resumo do nome do arquivo.
 * Dado original privado, quando o adapter chama Gemini, então envia bytes inline
 * no contrato nativo imagem/file/video_url e valida evidências/limitações. */
import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
vi.mock('../lib/ai-key-context.js', () => ({ resolveAiKey: async () => ({ key: 'synthetic', scope: 'test' }), runWithTenant: (_: string, fn: () => unknown) => fn() }));
import { OpenRouterChatMediaClient } from '../services/chat/openrouter-chat-media.client.js';
import { ChatAttachmentReader } from '../services/chat/chat-attachment-reader.js';

const response = (content: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] }));
const media = (mimeType: string) => ({ filename: 'synthetic', mimeType, sizeBytes: 3, metadata: mimeType === 'application/pdf' ? { pageCount: 2 } : mimeType.startsWith('video/') ? { durationSeconds: 1, hasAudio: false } : {} });

describe('contrato Gemini original privado', () => {
  it.each(['image/png', 'application/pdf', 'video/mp4'])('envia %s nativo sem URLs públicas ou ferramentas', async mimeType => {
    const fetcher = vi.fn().mockResolvedValue(response({ content: 'Cena sintética azul', references: [], limitations: [] }));
    const reader = new ChatAttachmentReader(new OpenRouterChatMediaClient({ fetcher }));
    const result = await reader.read('tenant', media(mimeType), Buffer.from('ABC'), 'Qual cor?');
    expect(result).toContain('Cena sintética azul');
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('google/gemini-2.5-flash');
    expect(body.tools).toBeUndefined();
    const part = body.messages[1].content[1];
    if (mimeType.startsWith('image/')) expect(part).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,QUJD' } });
    if (mimeType === 'application/pdf') {
      expect(part).toEqual({ type: 'file', file: { filename: 'synthetic', file_data: 'data:application/pdf;base64,QUJD' } });
      expect(body.plugins).toEqual([{ id: 'file-parser', pdf: { engine: 'native' } }]);
    }
    if (mimeType.startsWith('video/')) {
      expect(part).toEqual({ type: 'video_url', video_url: { url: 'data:video/mp4;base64,QUJD' } });
      expect(result).toMatch(/sem faixa de áudio/i);
      expect(result).toMatch(/amostragem/i);
    }
  });
  it('aceita referência de página dentro dos metadados verificados', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ content: 'Página azul', references: [{ page: 2, text: 'AZUL' }], limitations: ['OCR parcial'] }));
    const reader = new ChatAttachmentReader(new OpenRouterChatMediaClient({ fetcher }));
    expect(await reader.read('t', media('application/pdf'), Buffer.from('PDF'), 'Cor?')).toMatch(/Página 2: AZUL/);
  });
  it('recusa página inventada, JSON inválido e resposta truncada sem fabricar leitura', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ content: 'A', references: [{ page: 200, text: 'inventado' }], limitations: [] }));
    const reader = new ChatAttachmentReader(new OpenRouterChatMediaClient({ fetcher }));
    await expect(reader.read('t', media('application/pdf'), Buffer.from('PDF'), '')).rejects.toMatchObject({ statusCode: 502 });
    fetcher.mockResolvedValue(new Response(JSON.stringify({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] })));
    await expect(reader.read('t', media('application/pdf'), Buffer.from('PDF'), '')).rejects.toMatchObject({ statusCode: 502 });
  });
  it('não busca URL arbitrária, mesmo quando consta na pergunta', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ content: 'Arquivo original', references: [], limitations: [] }));
    const reader = new ChatAttachmentReader(new OpenRouterChatMediaClient({ fetcher }));
    await reader.read('t', media('image/png'), Buffer.from('ABC'), 'busque http://169.254.169.254');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
  });
});
