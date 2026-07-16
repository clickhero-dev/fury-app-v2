import { db, tenants, brandKits, clientGoals } from '@fury/db';
import { eq } from 'drizzle-orm';
import type { AgentContext } from './types.js';

export async function contextAgent(tenantId: string): Promise<AgentContext> {
  const [tenant, brand, goals] = await Promise.all([
    db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) }),
    db.query.brandKits.findFirst({ where: eq(brandKits.tenantId, tenantId) }),
    db.query.clientGoals.findFirst({ where: eq(clientGoals.tenantId, tenantId) }),
  ]);
  if (!tenant) throw new Error('Tenant não encontrado');
  return {
    tenantId,
    tenant: { name: tenant.name, businessContext: (tenant as any).businessContext ?? undefined, slug: tenant.slug },
    brandKit: brand ? { voiceTone: brand.voiceTone ?? undefined, primaryColor: brand.primaryColor ?? undefined, secondaryColor: brand.secondaryColor ?? undefined } : undefined,
    goals: goals ? { objective: goals.objective ?? undefined, niche: goals.niche ?? undefined, mainProduct: goals.mainProduct ?? undefined, targetAudience: (goals as any).targetAudience ?? undefined } : undefined,
  };
}
