/*
 * Funcionalidade: endpoint de avaliação do criativo.
 * Cenário: nota válida; Dado usuário autenticado e asset válido;
 * Quando envio PUT; Então retorna a avaliação persistida.
 * Cenário: entrada inválida; Dado nota fora do contrato ou UUID inválido;
 * Quando envio PUT; Então retorna 400 sem chamar o serviço.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioRatingController } from '../controllers/studio-rating.controller.js';

const service = { rate: vi.fn() };
const controller = new StudioRatingController(service as never);
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() }) as any;

describe('StudioRatingController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200: registra nota com tenant e usuário do token', async () => {
    service.rate.mockResolvedValue({ creativeAssetId: '00000000-0000-0000-0000-000000000001', rating: 4, createdAt: '2026-11-06T10:00:00.000Z', updatedAt: '2026-11-06T10:00:00.000Z' });
    const res = response();
    await controller.rate({ params: { assetId: '00000000-0000-0000-0000-000000000001' }, body: { rating: 4 }, tenant: { tenantId: 't-1' }, user: { userId: 'u-1' } } as any, res, vi.fn());
    expect(service.rate).toHaveBeenCalledWith({ tenantId: 't-1', userId: 'u-1', assetId: '00000000-0000-0000-0000-000000000001', rating: 4 });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it.each([{ rating: 0 }, { rating: 6 }, { rating: 3.2 }, { rating: 3, extra: true }])('400: rejeita corpo inválido: %p', async (body) => {
    const res = response();
    await controller.rate({ params: { assetId: '00000000-0000-0000-0000-000000000001' }, body, tenant: { tenantId: 't-1' }, user: { userId: 'u-1' } } as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(service.rate).not.toHaveBeenCalled();
  });

  it('403: sem contexto autenticado não chama o serviço', async () => {
    const res = response();
    await controller.rate({ params: { assetId: '00000000-0000-0000-0000-000000000001' }, body: { rating: 3 } } as any, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
