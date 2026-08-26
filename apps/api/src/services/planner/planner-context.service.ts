import { eq } from 'drizzle-orm';
import { db, tenants, brandKits, clientGoals, businessProfileSettings, users } from '@fury/db';
import type { PlannerContext } from '../../agents/types.js';

/**
 * Etapa 2.1 do fluxo: consolida o contexto da empresa (tom, cor, logo, nicho,
 * produto, cidade) a partir de brand_kits, client_goals, business_profile (cidade)
 * e usuários (audience_defaults.city como fallback).
 */
export async function loadPlannerContext(tenantId: string): Promise<PlannerContext> {
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
  const brand = await db.query.brandKits.findFirst({ where: eq(brandKits.tenantId, tenantId) });
  const goals = await db.query.clientGoals.findFirst({ where: eq(clientGoals.tenantId, tenantId) });
  const profile = await db.query.businessProfileSettings.findFirst({
    where: eq(businessProfileSettings.tenantId, tenantId),
  });
  const user = await db.query.users.findFirst({ where: eq(users.tenantId, tenantId) });

  const profileAddress = (profile?.address ?? {}) as { city?: string };
  const audience = (user?.audienceDefaults ?? {}) as { city?: string };

  return {
    tenantId,
    businessName: tenant?.name ?? 'Empresa',
    brandKit: {
      logoUrl: brand?.logoUrl ?? undefined,
      primaryColor: brand?.primaryColor ?? undefined,
      secondaryColor: brand?.secondaryColor ?? undefined,
      voiceTone: brand?.voiceTone ?? undefined,
    },
    goals: {
      objective: goals?.objective ?? undefined,
      niche: goals?.niche ?? undefined,
      mainProduct: goals?.mainProduct ?? undefined,
    },
    city: profileAddress.city?.trim() || audience.city?.trim() || undefined,
  };
}