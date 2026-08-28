import {
  listStudioAssetsForTenant,
  deleteStudioAsset,
  type StudioAssetListItem,
} from './studio.service.js';
import {
  generateImage as generateStudioImage,
  getStudioAssetById,
  publishStudioAssetToMeta,
  type StudioImageGenerationResult,
  type StudioComplianceStatusResult,
} from './studio-image.service.js';
import { renderCreative as renderCreativeService, type RenderCreativeInput, type RenderCreativeResult } from './studio-render.service.js';
import { getCreativeQuotaSnapshot } from './creative-quota.service.js';

type ListStudioAssetsParams = {
  tenantId: string;
  type?: 'image' | 'video' | 'copy';
  status?: 'pending' | 'approved' | 'rejected';
  page: number;
  limit: number;
};

type ListStudioAssetsResult = {
  assets: StudioAssetListItem[];
  total: number;
  page: number;
  totalPages: number;
};

type PublishAssetToMetaParams = { tenantId: string; assetId: string; adAccountId?: string };
type PublishAssetToMetaResult = { hash: string; imageUrl: string; metaAssetId: string; adsManagerUrl: string };

/**
 * Camada de serviço do fluxo de publishing/biblioteca de assets do Estúdio
 * (contrário do pipeline criativo, que vive em StudioService).
 *
 * Compõe os serviços já existentes (studio, studio-image, studio-render,
 * creative-quota) para que o controller fique fino. Os métodos permanecem
 * delegando às funções de módulo retidas — usadas também pelo worker e pelo
 * out-chat — evitando duplicação de lógica.
 */
export class StudioPublishingService {
  async generateImage(prompt: string, tenantId: string, publicBaseUrl: string): Promise<StudioImageGenerationResult> {
    return generateStudioImage(prompt, tenantId, publicBaseUrl);
  }

  async listStudioAssetsForTenant(params: ListStudioAssetsParams): Promise<ListStudioAssetsResult> {
    return listStudioAssetsForTenant(params);
  }

  async getStudioAssetById(params: { tenantId: string; assetId: string }): Promise<StudioComplianceStatusResult> {
    return getStudioAssetById(params);
  }

  async publishAssetToMeta(params: PublishAssetToMetaParams): Promise<PublishAssetToMetaResult> {
    return publishStudioAssetToMeta(params);
  }

  async renderCreative(input: RenderCreativeInput): Promise<RenderCreativeResult> {
    return renderCreativeService(input);
  }

  async deleteStudioAsset(params: { tenantId: string; assetId: string }): Promise<void> {
    return deleteStudioAsset(params);
  }

  async getCreativeQuotaSnapshot(
    tenantId: string,
  ): Promise<{ creativesRemaining: number | null; creativesLimit: number | null }> {
    return getCreativeQuotaSnapshot(tenantId);
  }
}