import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
vi.mock('../lib/ai-key-context.js', () => ({ resolveAiKey: vi.fn().mockResolvedValue({ key: 'secret' }) }));
import { resolveAiKey } from '../lib/ai-key-context.js';
import { openrouterService } from '../services/llms/openrouter.service.js';
describe('BDD: timeout e sanitização da geração de legenda', () => {
  beforeEach(() => { vi.mocked(resolveAiKey).mockResolvedValue({ key: 'secret', scope: 'ady' }); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
  it('Cenário: corpo pendente → aborta dentro do timeout opcional', async () => {
    vi.useFakeTimers(); let signal!: AbortSignal;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      signal = init.signal;
      return { ok: true, json: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) };
    }));
    const pending = openrouterService.chat([{ role: 'user', content: 'tema' }], { timeoutMs: 20 });
    const assertion = expect(pending).rejects.toBeTruthy();
    await vi.advanceTimersByTimeAsync(25);
    expect(signal.aborted).toBe(true); await assertion;
  });
  it('Cenário: erro do provedor → não registra corpo bruto', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret prompt', { status: 500 })));
    await expect(openrouterService.chat([])).rejects.toMatchObject({ code: 'OPENROUTER_CHAT_ERROR' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret prompt');
  });
});
