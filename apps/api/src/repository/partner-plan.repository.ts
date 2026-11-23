import { db as defaultDb, type Database, adyPartnerPlans, adyPartnerPlanViewsBlocked, adyRbacAuditLog } from '@fury/db';
import { asc, eq, inArray, sql } from 'drizzle-orm';

export interface PartnerPlan {
  id: string;
  name: string;
  priceCents: number;
  maxTenants: number;
  isActive: boolean;
  blockedViews: string[];
  partnersCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PartnerPlanInput {
  name: string;
  priceCents: number;
  maxTenants: number;
  isActive?: boolean;
  blockedViews: string[];
}

/** Planos de parceiro (GLOBAL, só super_admin): pré-configuração copiada ao vincular. */
export class PartnerPlanRepository {
  constructor(private db: Database = defaultDb) {}

  async list(): Promise<PartnerPlan[]> {
    return this.query();
  }

  async findById(id: string): Promise<PartnerPlan | null> {
    return (await this.query(id))[0] ?? null;
  }

  // todos ou só um (id), com telas bloqueadas e parceiros que compraram
  private async query(id?: string): Promise<PartnerPlan[]> {
    const plans = await this.db
      .select({
        id: adyPartnerPlans.id,
        name: adyPartnerPlans.name,
        priceCents: adyPartnerPlans.priceCents,
        maxTenants: adyPartnerPlans.maxTenants,
        isActive: adyPartnerPlans.isActive,
        createdAt: adyPartnerPlans.createdAt,
        updatedAt: adyPartnerPlans.updatedAt,
        // parceiros não excluídos que compraram o plano
        partnersCount: sql<number>`(SELECT count(*)::int FROM ady_partners p WHERE p.partner_plan_id = "ady_partner_plans"."id" AND p.deleted_at IS NULL)`.mapWith(Number),
      })
      .from(adyPartnerPlans)
      .where(id ? eq(adyPartnerPlans.id, id) : undefined)
      .orderBy(asc(adyPartnerPlans.name));
    if (!plans.length) return [];

    const views = await this.db
      .select({ planId: adyPartnerPlanViewsBlocked.partnerPlanId, key: adyPartnerPlanViewsBlocked.viewKey })
      .from(adyPartnerPlanViewsBlocked)
      .where(inArray(adyPartnerPlanViewsBlocked.partnerPlanId, plans.map((p) => p.id)));
    return plans.map((p) => ({ ...p, blockedViews: views.filter((v) => v.planId === p.id).map((v) => v.key).sort() }));
  }

  // 'name_exists' = nome já usado (índice único em lower(name))
  async create(input: PartnerPlanInput, actorUserId: string): Promise<string | 'name_exists'> {
    try {
      return await this.db.transaction(async (tx) => {
        const [plan] = await tx
          .insert(adyPartnerPlans)
          .values({ name: input.name, priceCents: input.priceCents, maxTenants: input.maxTenants, isActive: input.isActive ?? true })
          .returning({ id: adyPartnerPlans.id });
        if (input.blockedViews.length)
          await tx.insert(adyPartnerPlanViewsBlocked).values(input.blockedViews.map((viewKey) => ({ partnerPlanId: plan!.id, viewKey, createdBy: actorUserId })));
        await tx.insert(adyRbacAuditLog).values({
          actorUserId,
          action: 'partner_plan_created',
          entityType: 'partner_plan',
          entityKey: plan!.id,
          details: { ...input, isActive: input.isActive ?? true },
        });
        return plan!.id;
      });
    } catch (err) {
      if (isUniqueViolation(err)) return 'name_exists';
      throw err;
    }
  }

  // edição vale só para parceiros novos: quem já comprou tem a sua cópia
  async update(id: string, input: Partial<PartnerPlanInput>, actorUserId: string): Promise<'ok' | 'name_exists'> {
    try {
      await this.db.transaction(async (tx) => {
        const { blockedViews, ...fields } = input;
        await tx.update(adyPartnerPlans).set({ ...fields, updatedAt: new Date() }).where(eq(adyPartnerPlans.id, id));
        if (blockedViews) {
          await tx.delete(adyPartnerPlanViewsBlocked).where(eq(adyPartnerPlanViewsBlocked.partnerPlanId, id));
          if (blockedViews.length)
            await tx.insert(adyPartnerPlanViewsBlocked).values(blockedViews.map((viewKey) => ({ partnerPlanId: id, viewKey, createdBy: actorUserId })));
        }
        await tx.insert(adyRbacAuditLog).values({
          actorUserId,
          action: 'partner_plan_updated',
          entityType: 'partner_plan',
          entityKey: id,
          details: input,
        });
      });
      return 'ok';
    } catch (err) {
      if (isUniqueViolation(err)) return 'name_exists';
      throw err;
    }
  }
}

// drizzle embrulha o erro do Postgres em `cause`
function isUniqueViolation(err: unknown) {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}
