/*
 * Funcionalidade: contrato HTTP de posts Instagram ranqueados
 *
 * Cenário: campo aditivo de justificativa
 *   Dado um post recomendado retornado pelo serviço
 *   Quando a rota responde ao cliente autenticado
 *   Então preserva o envelope e repassa a justificativa opcional
 *
 * Cenário: objetivo inválido
 *   Dado um objetivo não suportado
 *   Quando a rota é chamada
 *   Então encaminha o erro de validação sem chamar o serviço
 */
import { describe, it, expect, vi } from 'vitest';
import { InstagramController } from '../controllers/instagram.controller.js';

function mockRes() {
  return { json: vi.fn() } as any;
}

const mockMetaService = { getResolvedTenantAssetSelection: vi.fn() } as any;

describe('InstagramController', () => {
  const instagramService = { getRankedPosts: vi.fn() } as any;
  const controller = new InstagramController(instagramService, mockMetaService);

  beforeEach(() => {
    instagramService.getRankedPosts.mockReset();
  });

  it('happy: getPostsRanked retorna posts do tenant', async () => {
    instagramService.getRankedPosts.mockResolvedValue([
      { id: 'p-1', score: 9, recommended: true, recommendationReason: 'Mais chance de trazer novos clientes.' },
    ]);
    const req = { tenant: { tenantId: 't-1' }, query: { objective: 'engagement' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await controller.getPostsRanked(req, res, next);

    expect(instagramService.getRankedPosts).toHaveBeenCalledWith('t-1', 'engagement', undefined);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: [{ id: 'p-1', score: 9, recommended: true, recommendationReason: 'Mais chance de trazer novos clientes.' }],
      })
    );
  });

  it('400: getPostsRanked com objective inválido chama next com ZodError', async () => {
    const req = { tenant: { tenantId: 't-1' }, query: { objective: 'bogus' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await controller.getPostsRanked(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
    expect(res.json).not.toHaveBeenCalled();
    expect(instagramService.getRankedPosts).not.toHaveBeenCalled();
  });
});
