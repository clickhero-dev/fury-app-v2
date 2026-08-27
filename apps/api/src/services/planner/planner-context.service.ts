import type { PlannerContext } from '../../agents/types.js';
import { PlannerRepository } from '../../repository/planner.repository.js';

/**
 * Etapa 2.1 do fluxo: consolida o contexto da empresa (tom, cor, logo, nicho,
 * produto, cidade) a partir de brand_kits, client_goals, business_profile (cidade)
 * e usuários (audience_defaults.city como fallback).
 */
export async function loadPlannerContext(tenantId: string): Promise<PlannerContext> {
  const repo = new PlannerRepository(tenantId);
  const tenant = await repo.findTenant();
  const brand = await repo.findBrandKit();
  const goals = await repo.findClientGoal();
  const profile = await repo.findBusinessProfile();
  const user = await repo.findUserByTenant();

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