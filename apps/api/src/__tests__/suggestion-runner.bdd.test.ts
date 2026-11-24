/* Funcionalidade: sugestões limitadas e recuperáveis
 Dado falha transitória, quando gerar, então usa fallback com backoff limitado.
 Dado erro permanente, então não repete; dado JSON inválido, tenta outro modelo.
*/
import { describe, it, expect, vi } from 'vitest';
import { runSuggestion, SuggestionProviderError } from '../services/llms/suggestion-runner.js';
vi.mock('../lib/analytics.js', () => ({ captureServerEvent: vi.fn() }));
import { captureServerEvent } from '../lib/analytics.js';
import { requestContext } from '../lib/request-context.js';
const parse = (raw: string) => { try { return JSON.parse(raw).text || null; } catch { return null; } };
describe('BDD: execução de sugestão', () => {
  it.each(['/api/planner/posts/suggest-caption', '/api/campaigns/suggest-text'])('Cenário: 503 em %s → evento correlacionável e sanitizado', async endpoint => {
    const chat = vi.fn().mockRejectedValue(new SuggestionProviderError('http', 503));
    await requestContext.run({ requestId: 'simulated-request', path: endpoint }, () => runSuggestion({ chat }, [], ['a'], parse));
    expect(captureServerEvent).toHaveBeenCalledWith('suggestion_attempt', expect.objectContaining({ endpoint, requestId: 'simulated-request', provider: 'openrouter', outcome: 'http', upstreamStatus: 503, environment: expect.any(String) }));
  });
  it.each(['timeout', '503'])('Cenário: %s transitório → fallback limitado e diagnóstico seguro', async kind => {
    const chat = vi.fn().mockRejectedValueOnce(new SuggestionProviderError(kind === '503' ? 'http' : 'timeout', kind === '503' ? 503 : undefined)).mockResolvedValueOnce('{"text":"ok"}');
    expect(await runSuggestion({ chat }, [], ['a', 'b'], parse)).toBe('ok');
    expect(chat).toHaveBeenCalledTimes(2);
    expect(chat.mock.calls[0][1]).toMatchObject({ timeoutMs: 20000 });
    expect(captureServerEvent).toHaveBeenCalledWith('suggestion_attempt', expect.objectContaining({ provider: 'openrouter', outcome: kind === '503' ? 'http' : 'timeout' }));
  });
  it('Cenário: erro permanente → uma chamada', async () => {
    const chat = vi.fn().mockRejectedValue(new SuggestionProviderError('http', 401));
    expect(await runSuggestion({ chat }, [], ['a', 'b'], parse)).toBeNull();
    expect(chat).toHaveBeenCalledTimes(1);
  });
  it('Cenário: respostas inválidas → máximo dois modelos sem repetição', async () => {
    const chat = vi.fn().mockResolvedValue('secret invalid');
    expect(await runSuggestion({ chat }, [], ['a', 'b'], parse)).toBeNull();
    expect(chat).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(captureServerEvent).mock.calls)).not.toContain('secret invalid');
  });
  it('Cenário: sucesso → nenhuma chamada extra', async () => {
    const chat = vi.fn().mockResolvedValue('{"text":"ok"}');
    expect(await runSuggestion({ chat }, [], ['a', 'b'], parse)).toBe('ok');
    expect(chat).toHaveBeenCalledTimes(1);
  });
});

it('Cenário: backoff de 250ms → nenhuma segunda chamada antes do limite', async () => {
  vi.useFakeTimers();
  try {
    const chat = vi.fn().mockRejectedValue(new SuggestionProviderError('http', 503));
    const pending = runSuggestion({ chat }, [], ['a', 'b', 'c'], parse);
    await vi.advanceTimersByTimeAsync(249); expect(chat).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(chat).toHaveBeenCalledTimes(2);
    expect(await pending).toBeNull();
  } finally { vi.useRealTimers(); }
});
