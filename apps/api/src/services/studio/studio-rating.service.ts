import { AppError } from '../../middleware/errorHandler.js';
import { StudioRepository } from '../../repository/studio.repository.js';

export type StudioRatingInput = { tenantId: string; userId: string; assetId: string; rating: unknown };
export type StudioRatingRepository = Pick<StudioRepository, 'findUserById' | 'findAssetById' | 'upsertAssetRating'>;

export class StudioRatingService {
  constructor(private readonly repositoryForTenant: (tenantId: string) => StudioRatingRepository = (tenantId) => new StudioRepository(tenantId)) {}

  async rate(input: StudioRatingInput) {
    if (!Number.isInteger(input.rating) || (input.rating as number) < 1 || (input.rating as number) > 5) {
      throw new AppError(400, 'INVALID_RATING', 'A avaliação deve ser um número inteiro entre 1 e 5.');
    }
    const repo = this.repositoryForTenant(input.tenantId);
    const user = await repo.findUserById(input.userId);
    if (!user || user.tenantId !== input.tenantId) throw new AppError(403, 'FORBIDDEN', 'Usuário não pertence ao tenant.');
    const asset = await repo.findAssetById(input.assetId);
    if (!asset || !['image', 'video'].includes(asset.type)) throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Criativo não encontrado.');
    const row = await repo.upsertAssetRating(input.userId, input.assetId, input.rating as number);
    return { creativeAssetId: row.creativeAssetId, rating: row.rating, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }
}
