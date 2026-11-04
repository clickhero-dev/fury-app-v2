import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Unitário: cada chamada de IA vai ao provedor com a chave do dono do cliente. */
const findAiKeyByTenant = vi.hoisted(() => vi.fn());
vi.mock('../repository/partner.repository.js', () => ({
  PartnerRepository: class { findAiKeyByTenant = findAiKeyByTenant; },
}));
vi.mock('../lib/meta-api.js', () => ({ decryptAccessToken: (v: string) => v.replace('enc:', '') }));

import { runWithTenant, runAsAdy, aiContextMiddleware, clearAiKeyCache } from '../lib/ai-key-context.js';
import { openrouterService } from '../services/llms/openrouter.service.js';
import { openrouterVideoClient } from '../lib/openrouter-video.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const fetchMock = vi.fn();
const authOf = (call: unknown[]) => ((call[1] as RequestInit).headers as Record<string, string>).Authorization;

beforeEach(() => {
  clearAiKeyCache();
  openrouterService.clearCreditCache();
  vi.stubEnv('OPENROUTER_API_KEY', 'sk-ady');
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], id: 'job-1', data: { credits: 10 } }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  findAiKeyByTenant.mockImplementation(async (tenantId: string) => ({
    'cli-a': { partnerId: 'par-a', encrypted: 'enc:sk-parceiro-a' },
    'cli-b': { partnerId: 'par-b', encrypted: null },
    'cli-ady': { partnerId: null, encrypted: null },
    // conta de parceiro que perdeu o vínculo (parceiro apagado no banco)
    'conta-orfa': { partnerId: 'sem-vinculo', encrypted: null },
  })[tenantId] ?? null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('chave de IA por cliente', () => {
  it('cliente de parceiro com chave: texto e vídeo vão com a chave do parceiro', async () => {
    await runWithTenant('cli-a', () => openrouterService.chat([{ role: 'user', content: 'oi' }]));
    await runWithTenant('cli-a', () => openrouterVideoClient.submit({ model: 'm', prompt: 'p', duration: 5, aspect_ratio: '9:16', resolution: '720p', generate_audio: false, referenceImageUrls: [] }));
    expect(fetchMock.mock.calls.map(authOf)).toEqual(['Bearer sk-parceiro-a', 'Bearer sk-parceiro-a']);
  });

  it('cliente de parceiro sem chave: bloqueia e não chama o provedor', async () => {
    await expect(runWithTenant('cli-b', () => openrouterService.chat([{ role: 'user', content: 'oi' }]))).rejects.toMatchObject({ statusCode: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cliente ady e tarefa marcada como da ady: chave da ady', async () => {
    await runWithTenant('cli-ady', () => openrouterService.chat([{ role: 'user', content: 'oi' }]));
    await runAsAdy(() => openrouterService.chat([{ role: 'user', content: 'oi' }]));
    expect(fetchMock.mock.calls.map(authOf)).toEqual(['Bearer sk-ady', 'Bearer sk-ady']);
  });

  it('sem cliente no contexto ou cliente inexistente: erro, nunca a chave da ady', async () => {
    await expect(openrouterService.chat([{ role: 'user', content: 'oi' }])).rejects.toMatchObject({ code: 'AI_CONTEXT_MISSING' });
    await expect(openrouterVideoClient.submit({ model: 'm', prompt: 'p', duration: 5, aspect_ratio: '9:16', resolution: '720p', generate_audio: false, referenceImageUrls: [] })).rejects.toMatchObject({ code: 'AI_CONTEXT_MISSING' });
    await expect(runWithTenant('nao-existe', () => openrouterService.chat([{ role: 'user', content: 'oi' }]))).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('conta de parceiro sem vínculo nunca vira cliente ady', async () => {
    await expect(runWithTenant('conta-orfa', () => openrouterService.chat([{ role: 'user', content: 'oi' }]))).rejects.toMatchObject({ statusCode: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('saldo em cache é por dono da chave', async () => {
    await runWithTenant('cli-a', () => openrouterService.getCreditState());
    await runWithTenant('cli-ady', () => openrouterService.getCreditState());
    await runWithTenant('cli-a', () => openrouterService.getCreditState());
    expect(fetchMock.mock.calls.map(authOf)).toEqual(['Bearer sk-parceiro-a', 'Bearer sk-ady']);
  });

  it('middlewares abrem o contexto do cliente da requisição', async () => {
    const keyFrom = (mw: typeof tenantMiddleware, req: any) =>
      new Promise((resolve) => mw(req, {} as any, () => {
        openrouterService.chat([{ role: 'user', content: 'oi' }]).then(() => resolve(authOf(fetchMock.mock.calls.at(-1)!)));
      }));
    expect(await keyFrom(tenantMiddleware, { user: { tenantId: 'cli-a' } })).toBe('Bearer sk-parceiro-a');
    expect(await keyFrom(aiContextMiddleware, { tenant: { tenantId: 'cli-a' } })).toBe('Bearer sk-parceiro-a');
  });

  it('erro do provedor não repassa o texto bruto ao cliente', async () => {
    fetchMock.mockResolvedValueOnce(new Response('detalhe interno do provedor', { status: 500 }));
    await expect(runAsAdy(() => openrouterService.chat([{ role: 'user', content: 'oi' }]))).rejects.toMatchObject({
      message: 'Falha ao gerar o texto. Tente novamente.',
    });
  });
});
