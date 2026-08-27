import { AppError } from '../../middleware/errorHandler.js';
import { SubscriptionRepository } from '../../repository/subscription.repository.js';
import { StudioRepository } from '../../repository/studio.repository.js';

/**
 * Quota de criativos e modificações do tenant.
 * Acesso ao banco delegado a SubscriptionRepository (cota/plano) e
 * StudioRepository (leitura da linhagem de creativeAssets) — domínios com
 * dono único. Services podem usar múltiplos repos (ADR-0001).
 */

/**
 * Consome uma unidade da cota mensal de criativos novos do tenant, de forma
 * atômica (UPDATE condicional).
 */
export async function consumeCreativeQuota(tenantId: string): Promise<void> {
  const consumed = await new SubscriptionRepository(tenantId).consumeCreativeQuota();
  if (!consumed) {
    throw new AppError(
      403,
      'CREATIVE_QUOTA_EXCEEDED',
      'Limite de criativos do mês atingido. Faça upgrade do plano para continuar.',
    );
  }
}

/** Estorna uma unidade da cota mensal (usar quando a geração falha após o consumo). */
export async function refundCreativeQuota(tenantId: string): Promise<void> {
  try {
    await new SubscriptionRepository(tenantId).refundCreativeQuota();
  } catch (err) {
    console.error('[creative-quota] refundCreativeQuota falhou:', err);
  }
}

/** Resolve o id do criativo raiz da linhagem (o próprio id, se já for a raiz). */
export async function resolveRootAssetId(tenantId: string, assetId: string): Promise<string> {
  const asset = await new StudioRepository(tenantId).findAssetById(assetId);
  if (!asset) throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo não encontrado.');
  return asset.rootAssetId ?? asset.id;
}

/**
 * Consome uma unidade da cota vitalícia de modificações do criativo raiz.
 * Mesma técnica de UPDATE condicional atômico do consumeCreativeQuota.
 */
export async function consumeModificationQuota(rootAssetId: string): Promise<void> {
  const consumed = await new SubscriptionRepository('').consumeModificationQuota(rootAssetId);
  if (!consumed) {
    throw new AppError(
      403,
      'MODIFICATION_QUOTA_EXCEEDED',
      'Limite de modificações deste criativo foi atingido. Crie um novo criativo para continuar ajustando.',
    );
  }
}

/** Estorna uma unidade da cota de modificações (usar quando a edição falha após o consumo). */
export async function refundModificationQuota(rootAssetId: string): Promise<void> {
  try {
    await new SubscriptionRepository('').refundModificationQuota(rootAssetId);
  } catch (err) {
    console.error('[creative-quota] refundModificationQuota falhou:', err);
  }
}

/** Teto de modificações do plano vigente do tenant — usado para "congelar" no criativo ao criá-lo. */
export async function getModificationsPerCreativeLimit(tenantId: string): Promise<number | null> {
  return new SubscriptionRepository(tenantId).getModificationsPerCreativeLimit();
}

/** Snapshot de cota de criativos do tenant, para exibir na UI (biblioteca do Estúdio). */
export async function getCreativeQuotaSnapshot(
  tenantId: string,
): Promise<{ creativesRemaining: number | null; creativesLimit: number | null }> {
  return new SubscriptionRepository(tenantId).getCreativeQuotaSnapshot();
}

/** Cota de modificações restante do criativo raiz — para exibir na tela de detalhes. */
export async function getModificationsRemainingForAsset(
  tenantId: string,
  assetId: string,
): Promise<number | null> {
  const rootId = await resolveRootAssetId(tenantId, assetId);
  const root = await new StudioRepository(tenantId).findAssetById(rootId);
  return root?.modificationsRemaining ?? null;
}