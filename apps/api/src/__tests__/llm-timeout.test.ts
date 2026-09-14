import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFetch, mockAgentInvoke } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockAgentInvoke: vi.fn(),
}));

// generateContentPrompts é a única chamada LLM do pipeline do planner — o timeout
// precisa ser configurado POR CHAMADA (RunnableConfig), não no construtor.
vi.mock('../agents/base.agent.js', () => ({
  createBasicAgent: vi.fn(() => ({ invoke: mockAgentInvoke })),
}));

vi.mock('@langchain/openrouter', () => ({ ChatOpenRouter: vi.fn() }));
vi.mock('langchain', () => ({ createAgent: vi.fn(() => ({ invoke: vi.fn() })) }));

import { generateContentPrompts } from '../agents/planner.agent.js';

describe('LLM com timeout/retries — anti-hang (tela "gerando..." congelada)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation(() => Promise.reject(new Error('no fetch in this test')));
    mockAgentInvoke.mockResolvedValue({ structuredResponse: null, text: '{"posts":[]}' });
  });

  it('generateContentPrompts chama o LLM com RunnableConfig de timeout + maxRetries', async () => {
    const dates = [{ date: '2026-09-10', name: 'Conteúdo #1' }];
    await generateContentPrompts({ businessName: 'X', city: 'SP', brandKit: null, goals: null } as any, dates);

    expect(mockAgentInvoke).toHaveBeenCalledTimes(1);
    const config = mockAgentInvoke.mock.calls[0][1];
    expect(config).toMatchObject({ timeout: expect.any(Number), maxRetries: expect.any(Number) });
    // bem abaixo do default de ~10min do SDK — o job não fica pendurado por minutos
    expect(config.timeout).toBeGreaterThan(0);
    expect(config.timeout).toBeLessThan(10 * 60 * 1000);
  });

  it('openrouterService.chat passa AbortSignal ao fetch (hang limitado)', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }),
    );

    const { openrouterService } = await import('../services/llms/openrouter.service.js');
    await openrouterService.chat([{ role: 'user', content: 'oi' }]);

    const init = mockFetch.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('openrouterService.generateImage passa AbortSignal ao fetch (hang limitado)', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: 'AAA' }] }), { status: 200 }),
    );

    const { openrouterService } = await import('../services/llms/openrouter.service.js');
    await openrouterService.generateImage({ model: 'flux', prompt: 'p' });

    const init = mockFetch.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});