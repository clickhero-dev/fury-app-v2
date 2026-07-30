import { and, eq, sql } from 'drizzle-orm';
import { db, creativeAssets, subscriptions, plans } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';

type PlanLimits = {
  creativesPerMonth?: number | null;
  modificationsPerCreative?: number | null;
};

function readLimits(rawLimits: unknown): PlanLimits {
  return (rawLimits as PlanLimits | null) ?? {};
}

/**
 * Consome uma unidade da cota mensal de criativos novos do tenant, de forma
 * atômica (UPDATE condicional — duas requisições concorrentes serializam
 * pelo lock de linha do Postgres, sem furar o limite).
 *
 * Sem assinatura ou cota null = sem limite (este serviço só restringe
 * quem já tem uma assinatura com creativesPerMonth definido).
 */
export async function consumeCreativeQuota(tenantId: string): Promise<void> {
  const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.tenantId, tenantId) });
  if (!sub || sub.creativesRemaining === null) return;

  const updated = await db
    .update(subscriptions)
    .set({ creativesRemaining: sql`${subscriptions.creativesRemaining} - 1`, updatedAt: new Date() })
    .where(and(eq(subscriptions.id, sub.id), sql`${subscriptions.creativesRemaining} > 0`))
    .returning({ id: subscriptions.id });

  if (updated.length === 0) {
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
    const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.tenantId, tenantId) });
    if (!sub || sub.creativesRemaining === null) return;
    await db
      .update(subscriptions)
      .set({ creativesRemaining: sql`${subscriptions.creativesRemaining} + 1`, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
  } catch (err) {
    console.error('[creative-quota] refundCreativeQuota falhou:', err);
  }
}

/** Resolve o id do criativo raiz da linhagem (o próprio id, se já for a raiz). */
export async function resolveRootAssetId(tenantId: string, assetId: string): Promise<string> {
  const asset = await db.query.creativeAssets.findFirst({
    where: and(eq(creativeAssets.id, assetId), eq(creativeAssets.tenantId, tenantId)),
  });
  if (!asset) throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo não encontrado.');
  return asset.rootAssetId ?? asset.id;
}

/**
 * Consome uma unidade da cota vitalícia de modificações do criativo raiz.
 * Mesma técnica de UPDATE condicional atômico do consumeCreativeQuota.
 */
export async function consumeModificationQuota(rootAssetId: string): Promise<void> {
  const root = await db.query.creativeAssets.findFirst({ where: eq(creativeAssets.id, rootAssetId) });
  if (!root || root.modificationsRemaining === null) return;

  const updated = await db
    .update(creativeAssets)
    .set({ modificationsRemaining: sql`${creativeAssets.modificationsRemaining} - 1` })
    .where(and(eq(creativeAssets.id, rootAssetId), sql`${creativeAssets.modificationsRemaining} > 0`))
    .returning({ id: creativeAssets.id });

  if (updated.length === 0) {
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
    const root = await db.query.creativeAssets.findFirst({ where: eq(creativeAssets.id, rootAssetId) });
    if (!root || root.modificationsRemaining === null) return;
    await db
      .update(creativeAssets)
      .set({ modificationsRemaining: sql`${creativeAssets.modificationsRemaining} + 1` })
      .where(eq(creativeAssets.id, rootAssetId));
  } catch (err) {
    console.error('[creative-quota] refundModificationQuota falhou:', err);
  }
}

/** Teto de modificações do plano vigente do tenant — usado para "congelar" no criativo ao criá-lo. */
export async function getModificationsPerCreativeLimit(tenantId: string): Promise<number | null> {
  const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.tenantId, tenantId) });
  if (!sub) return null;
  const plan = await db.query.plans.findFirst({ where: eq(plans.id, sub.planId) });
  return readLimits(plan?.limits).modificationsPerCreative ?? null;
}

/** Snapshot de cota de criativos do tenant, para exibir na UI (biblioteca do Estúdio). */
export async function getCreativeQuotaSnapshot(
  tenantId: string,
): Promise<{ creativesRemaining: number | null; creativesLimit: number | null }> {
  const sub = await db.query.subscriptions.findFirst({ where: eq(subscriptions.tenantId, tenantId) });
  if (!sub) return { creativesRemaining: null, creativesLimit: null };
  const plan = await db.query.plans.findFirst({ where: eq(plans.id, sub.planId) });
  return {
    creativesRemaining: sub.creativesRemaining,
    creativesLimit: readLimits(plan?.limits).creativesPerMonth ?? null,
  };
}

/** Cota de modificações restante do criativo raiz — para exibir na tela de detalhes. */
export async function getModificationsRemainingForAsset(
  tenantId: string,
  assetId: string,
): Promise<number | null> {
  const rootId = await resolveRootAssetId(tenantId, assetId);
  const root = await db.query.creativeAssets.findFirst({ where: eq(creativeAssets.id, rootId) });
  return root?.modificationsRemaining ?? null;
}
