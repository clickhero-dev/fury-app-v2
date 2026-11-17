/* Funcionalidade: ditado real via OpenRouter sem persistir áudio.
 * Dado áudio validado, quando solicitado Whisper, então envia WAV privado e retorna só texto.
 * Dado silêncio ou falha upstream, então não inventa fala nem revela saldo/chaves. */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
vi.mock('../lib/ai-key-context.js', () => ({ resolveAiKey: async () => ({ key: 'synthetic-key', scope: 'test' }), runWithTenant: (_: string, fn: () => unknown) => fn() }));
import { OpenRouterChatMediaClient } from '../services/chat/openrouter-chat-media.client.js';
import { ChatTranscriptionService } from '../services/chat/chat-transcription.service.js';
import { ChatMediaValidator } from '../services/chat/chat-media-validator.js';
import { syntheticMedia } from './chat-media.fixtures.js';
const fetcher = vi.fn();
const client = () => new OpenRouterChatMediaClient({ fetcher, timeoutMs: 25 });
beforeEach(() => { fetcher.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('Whisper OpenRouter com contrato HTTP JSON', () => {
  it('envia input_audio WAV sem URI, usa chave resolvida e não retorna custos', async () => {
    fetcher.mockResolvedValue(new Response(JSON.stringify({ text: '  Olá teste  ', usage: { cost: 123 } })));
    const buffer = await syntheticMedia(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.2', '-f', 'wav']);
    const service = new ChatTranscriptionService(new ChatMediaValidator(), client());
    expect(await service.transcribe('tenant-test', { buffer, originalname: 'voice.wav' })).toEqual({ text: 'Olá teste' });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/audio/transcriptions');
    expect(init.redirect).toBe('error');
    expect(init.headers.authorization).toBe('Bearer synthetic-key');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'openai/whisper-large-v3-turbo', input_audio: { format: 'wav' }, temperature: 0 });
    expect(Buffer.from(body.input_audio.data, 'base64').toString('ascii', 0, 4)).toBe('RIFF');
  });
  it('silêncio devolve texto vazio sem cobrar provedor', async () => {
    const buffer = await syntheticMedia(['-f', 'lavfi', '-i', 'anullsrc=r=16000:cl=mono', '-t', '0.1', '-f', 'wav']);
    const service = new ChatTranscriptionService(new ChatMediaValidator(), client());
    expect(await service.transcribe('tenant-test', { buffer, originalname: 'voice.wav' })).toEqual({ text: '' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401, 402, 429, 500])('falha %s não expõe billing nem corpo do provedor', async status => {
    fetcher.mockResolvedValue(new Response('secret quota balance 999', { status }));
    await expect(client().transcribe(Buffer.from('wav'))).rejects.toMatchObject({ statusCode: status === 429 ? 429 : 502, message: 'Não foi possível processar a mídia. Tente novamente.' });
  });
  it('timeout aborta o request real e devolve erro seguro', async () => {
    fetcher.mockImplementation((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('secret')))));
    await expect(client().transcribe(Buffer.from('wav'))).rejects.toMatchObject({ statusCode: 504 });
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it('deadline também limita resolução de chave e corpo de resposta lento', async () => {
    const never = new Promise<never>(() => undefined);
    const slowKey = new OpenRouterChatMediaClient({ fetcher, timeoutMs: 20, resolveKey: () => never });
    const keyResult = await Promise.race([slowKey.transcribe(Buffer.from('x')).catch(error => error.statusCode), new Promise(resolve => setTimeout(() => resolve('not-timed-out'), 100))]);
    expect(keyResult).toBe(504);
    fetcher.mockResolvedValue(new Response(new ReadableStream({ start() {} })));
    const bodyResult = await Promise.race([client().transcribe(Buffer.from('x')).catch(error => error.statusCode), new Promise(resolve => setTimeout(() => resolve('not-timed-out'), 100))]);
    expect(bodyResult).toBe(504);
  });
  it('resposta inválida não vira transcrição fictícia', async () => {
    fetcher.mockResolvedValue(new Response('{"usage":123}'));
    await expect(client().transcribe(Buffer.from('wav'))).rejects.toMatchObject({ statusCode: 502 });
  });
});
