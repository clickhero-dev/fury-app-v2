/*
 * Funcionalidade: registrar a avaliação do criativo recém-gerado.
 * Cenário: nota válida; Dado usuário, tenant e asset pertencentes ao contexto;
 * Quando envio uma nota de 1 a 5; Então a avaliação é criada ou atualizada.
 * Cenário: proteção; Dado entrada inválida ou asset ausente;
 * Quando envio a avaliação; Então a API rejeita sem persistir dados inválidos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioRatingService } from '../services/studio/studio-rating.service.js';

const repo = {
  findUserById: vi.fn(),
  findAssetById: vi.fn(),
  upsertAssetRating: vi.fn(),
};

describe('StudioRatingService', () => {
  beforeEach(() => vi.clearAllMocks());
  it('cria ou atualiza a nota para o usuário, tenant e asset corretos', async () => {
    repo.findUserById.mockResolvedValue({ id: 'u-1', tenantId: 't-1' });
    repo.findAssetById.mockResolvedValue({ id: 'a-1', type: 'image' });
    repo.upsertAssetRating.mockResolvedValue({
      creativeAssetId: 'a-1', rating: 5,
      createdAt: new Date('2026-11-06T10:00:00Z'), updatedAt: new Date('2026-11-06T10:01:00Z'),
    });

    const result = await new StudioRatingService(() => repo as never).rate({ tenantId: 't-1', userId: 'u-1', assetId: 'a-1', rating: 5 });

    expect(repo.upsertAssetRating).toHaveBeenCalledWith('u-1', 'a-1', 5);
    expect(result).toMatchObject({ creativeAssetId: 'a-1', rating: 5 });
  });

  it.each([0, 6, 1.5, '5', null])('rejeita nota inválida: %p', async (rating) => {
    await expect(new StudioRatingService(() => repo as never).rate({ tenantId: 't-1', userId: 'u-1', assetId: 'a-1', rating: rating as never }))
      .rejects.toMatchObject({ statusCode: 400, code: 'INVALID_RATING' });
    expect(repo.upsertAssetRating).not.toHaveBeenCalled();
  });

  it('não revela asset de outro tenant', async () => {
    repo.findUserById.mockResolvedValue({ id: 'u-1', tenantId: 't-1' });
    repo.findAssetById.mockResolvedValue(null);
    await expect(new StudioRatingService(() => repo as never).rate({ tenantId: 't-1', userId: 'u-1', assetId: 'a-2', rating: 3 }))
      .rejects.toMatchObject({ statusCode: 404, code: 'CREATIVE_ASSET_NOT_FOUND' });
  });

  it('rejeita usuário que não pertence ao tenant', async () => {
    repo.findUserById.mockResolvedValue({ id: 'u-1', tenantId: 'other-tenant' });
    await expect(new StudioRatingService(() => repo as never).rate({ tenantId: 't-1', userId: 'u-1', assetId: 'a-1', rating: 3 }))
      .rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });
});
