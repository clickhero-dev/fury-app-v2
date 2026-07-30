import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { eq, desc, sql, and, or, ilike } from "drizzle-orm";
import bcrypt from "bcrypt";
import {
  db,
  tenants,
  users,
  subscriptions,
  plans,
  furyConfig,
  brandKits,
  clientGoals,
} from "@fury/db";
import { AppError } from "../middleware/errorHandler.js";

const createUserSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(255),
  role: z.enum(["owner", "admin", "member"]).default("member"),
});

const setupTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).optional(),
  userName: z.string().min(1).max(255),
  userEmail: z.string().email(),
  userPassword: z.string().min(8).max(255),
  userRole: z.enum(["owner", "admin", "member"]).default("owner"),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  role: z.enum(["owner", "admin", "member"]).optional(),
  audienceDefaults: z
    .object({
      city: z.string().optional(),
      cityKey: z.string().optional(),
      ageMin: z.number().int().min(18).max(65).optional(),
      ageMax: z.number().int().min(18).max(65).optional(),
      gender: z.enum(["all", "male", "female"]).optional(),
    })
    .optional(),
});

const updateSubscriptionSchema = z.object({
  planId: z.string().uuid().optional(),
  status: z
    .enum(["trial", "active", "past_due", "cancelled", "inactive"])
    .optional(),
  trialEndsAt: z.string().datetime().optional(),
  currentPeriodEnd: z.string().datetime().optional(),
  isNonExpirable: z.boolean().optional(),
  billingType: z.enum(["BOLETO", "PIX", "CREDIT_CARD"]).optional(),
});

const updateFuryConfigSchema = z.object({
  targetRoas: z.string().optional(),
  targetCpa: z.string().optional(),
  targetCtr: z.string().optional(),
  targetBudgetUtilization: z.string().optional(),
});

const updateBrandKitSchema = z.object({
  logo_url: z.string().url().nullable().optional(),
  primary_color: z.string().optional(),
  secondary_color: z.string().optional(),
  voice_tone: z
    .enum(["professional", "casual", "urgent", "premium"])
    .optional(),
  photo_urls: z.array(z.string()).optional(),
});

const upsertGoalsSchema = z.object({
  objective: z.string().min(1),
  niche: z.string().min(1),
  mainProduct: z.string().min(1),
  monthlyBudget: z.number().positive(),
  targetCpa: z.number().positive(),
});

const planLimitsSchema = z.object({
  creativesPerMonth: z.number().int().positive().nullable().optional(),
  modificationsPerCreative: z.number().int().positive().nullable().optional(),
});

const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  priceCents: z.number().int().positive(),
  interval: z.enum(["monthly", "yearly"]).default("monthly"),
  features: z.record(z.boolean()).default({}),
  limits: planLimitsSchema.default({}),
  isActive: z.boolean().default(true),
});

const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  priceCents: z.number().int().positive().optional(),
  interval: z.enum(["monthly", "yearly"]).optional(),
  features: z.record(z.boolean()).optional(),
  limits: planLimitsSchema.optional(),
  isActive: z.boolean().optional(),
});

function toMoney(v: number) {
  return { amount: Math.round(v * 100) };
}

function fromMoney(json: unknown): number {
  const obj = json as { amount?: unknown } | null;
  const raw = Number(obj?.amount ?? 0);
  return Number.isNaN(raw) ? 0 : raw / 100;
}

function serializeGoal(row: typeof clientGoals.$inferSelect) {
  return {
    ...row,
    monthlyBudget: fromMoney(row.monthlyBudget),
    targetCpa: fromMoney(row.targetCpa),
  };
}

// ─── Tenants ───────────────────────────────────────────

export async function listTenants(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const allTenants = await db.query.tenants.findMany({
      orderBy: [desc(tenants.createdAt)],
    });

    const data = await Promise.all(
      allTenants.map(async (t) => {
        const [userCount] = await db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.tenantId, t.id));

        const sub = await db.query.subscriptions.findFirst({
          where: eq(subscriptions.tenantId, t.id),
          orderBy: [desc(subscriptions.createdAt)],
        });

        let plan = null;
        if (sub) {
          plan = await db.query.plans.findFirst({
            where: eq(plans.id, sub.planId),
          });
        }

        return {
          ...t,
          userCount: Number(userCount?.count ?? 0),
          subscription: sub ? { ...sub, plan } : null,
        };
      }),
    );

    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

export async function getTenant(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, req.params.id),
    });
    if (!tenant)
      throw new AppError(404, "TENANT_NOT_FOUND", "Tenant não encontrado");

    const tenantUsers = await db.query.users.findMany({
      where: eq(users.tenantId, tenant.id),
      orderBy: [desc(users.createdAt)],
    });

    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.tenantId, tenant.id),
      orderBy: [desc(subscriptions.createdAt)],
    });

    let plan = null;
    if (sub) {
      plan = await db.query.plans.findFirst({
        where: eq(plans.id, sub.planId),
      });
    }

    const config = await db.query.furyConfig.findFirst({
      where: eq(furyConfig.tenantId, tenant.id),
    });

    const brandKit = await db.query.brandKits.findFirst({
      where: eq(brandKits.tenantId, tenant.id),
    });

    const goals = await db.query.clientGoals.findFirst({
      where: eq(clientGoals.tenantId, tenant.id),
    });

    // Find the owner user (for audience defaults)
    const owner = tenantUsers.find((u) => u.role === "owner") ?? tenantUsers[0];

    res.json({
      success: true,
      data: {
        ...tenant,
        users: tenantUsers,
        subscription: sub ? { ...sub, plan } : null,
        furyConfig: config,
        brandKit,
        goals: goals ? serializeGoal(goals) : null,
        audienceDefaults: owner?.audienceDefaults ?? null,
        ownerUserId: owner?.id ?? null,
        businessContext: tenant.businessContext ?? null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteTenant(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, req.params.id),
    });
    if (!tenant)
      throw new AppError(404, "TENANT_NOT_FOUND", "Tenant não encontrado");

    await db.delete(tenants).where(eq(tenants.id, req.params.id));

    res.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ─── Users ─────────────────────────────────────────────

export async function createUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = createUserSchema.parse(req.body);

    const existing = await db.query.users.findFirst({
      where: eq(users.email, body.email),
    });
    if (existing)
      throw new AppError(409, "EMAIL_EXISTS", "Email já cadastrado");

    const passwordHash = await bcrypt.hash(body.password, 10);
    const [user] = await db
      .insert(users)
      .values({
        tenantId: body.tenantId,
        name: body.name,
        email: body.email,
        passwordHash,
        role: body.role,
      })
      .returning();

    const { passwordHash: _, ...safe } = user;

    res
      .status(201)
      .json({ success: true, data: safe, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

export async function setupTenant(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = setupTenantSchema.parse(req.body);
    const slug =
      body.slug ??
      body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    const existingSlug = await db.query.tenants.findFirst({
      where: eq(tenants.slug, slug),
    });
    if (existingSlug) throw new AppError(409, "SLUG_EXISTS", "Slug já existe");

    const existingEmail = await db.query.users.findFirst({
      where: eq(users.email, body.userEmail),
    });
    if (existingEmail)
      throw new AppError(409, "EMAIL_EXISTS", "Email já cadastrado");

    const passwordHash = await bcrypt.hash(body.userPassword, 10);

    const result = await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({ name: body.name, slug })
        .returning();
      const [user] = await tx
        .insert(users)
        .values({
          tenantId: tenant.id,
          name: body.userName,
          email: body.userEmail,
          passwordHash,
          role: body.userRole,
        })
        .returning();
      return { tenant, user };
    });

    const { passwordHash: _, ...safeUser } = result.user;

    res.status(201).json({
      success: true,
      data: { tenant: result.tenant, user: safeUser },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function checkEmail(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, req.params.email),
    });
    res.json({ success: true, data: { exists: !!user } });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = updateUserSchema.parse(req.body);

    const existing = await db.query.users.findFirst({
      where: eq(users.id, req.params.id),
    });
    if (!existing)
      throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.email !== undefined) updates.email = body.email;
    if (body.role !== undefined) updates.role = body.role;
    if (body.audienceDefaults !== undefined)
      updates.audienceDefaults = body.audienceDefaults;

    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, req.params.id));
    }

    res.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const existing = await db.query.users.findFirst({
      where: eq(users.id, req.params.id),
    });
    if (!existing)
      throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");

    await db.delete(users).where(eq(users.id, req.params.id));

    res.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ─── Subscription ──────────────────────────────────────

export async function updateSubscription(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = updateSubscriptionSchema.parse(req.body);

    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.tenantId, req.params.tenantId),
      orderBy: [desc(subscriptions.createdAt)],
    });

    const now = new Date();

    if (!sub) {
      // Create subscription if none exists
      const planId =
        body.planId ??
        (await db.query.plans.findFirst({
          columns: { id: true },
        }))?.id;
      if (!planId)
        throw new AppError(400, "PLAN_REQUIRED", "Informe um plano ou crie um antes");

      const trialEndsAt =
        body.trialEndsAt !== undefined
          ? new Date(body.trialEndsAt)
          : undefined;
      const currentPeriodEnd =
        body.currentPeriodEnd !== undefined
          ? new Date(body.currentPeriodEnd)
          : undefined;

      const chosenPlan = await db.query.plans.findFirst({ where: eq(plans.id, planId) });
      const creativesRemaining =
        (chosenPlan?.limits as { creativesPerMonth?: number | null } | null)?.creativesPerMonth ?? null;

      await db.insert(subscriptions).values({
        tenantId: req.params.tenantId,
        planId,
        status: body.status ?? "trial",
        trialEndsAt,
        currentPeriodEnd,
        isNonExpirable: body.isNonExpirable ?? false,
        creativesRemaining,
        asaasSubscriptionId: body.billingType,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      const updates: Record<string, unknown> = {};
      if (body.planId !== undefined) updates.planId = body.planId;
      if (body.status !== undefined) updates.status = body.status;
      if (body.trialEndsAt !== undefined)
        updates.trialEndsAt = new Date(body.trialEndsAt);
      if (body.currentPeriodEnd !== undefined)
        updates.currentPeriodEnd = new Date(body.currentPeriodEnd);
      if (body.isNonExpirable !== undefined)
        updates.isNonExpirable = body.isNonExpirable;

      if (body.status === "active" && !body.currentPeriodEnd) {
        const future = new Date(now);
        future.setDate(future.getDate() + 30);
        updates.currentPeriodEnd = future;
      }

      if (body.billingType !== undefined) {
        updates.asaasSubscriptionId = body.billingType;
      }

      const effectivePlanId = (updates.planId as string | undefined) ?? sub.planId;
      const effectivePlan = await db.query.plans.findFirst({ where: eq(plans.id, effectivePlanId) });
      updates.creativesRemaining =
        (effectivePlan?.limits as { creativesPerMonth?: number | null } | null)?.creativesPerMonth ?? null;

      updates.updatedAt = now;

      if (Object.keys(updates).length >= 1) {
        await db
          .update(subscriptions)
          .set(updates)
          .where(eq(subscriptions.id, sub.id));
      }
    }

    res.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ─── Fury Config ───────────────────────────────────────

export async function updateFuryConfig(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = updateFuryConfigSchema.parse(req.body);

    const existing = await db.query.furyConfig.findFirst({
      where: eq(furyConfig.tenantId, req.params.tenantId),
    });

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.targetRoas !== undefined) values.targetRoas = body.targetRoas;
    if (body.targetCpa !== undefined) values.targetCpa = body.targetCpa;
    if (body.targetCtr !== undefined) values.targetCtr = body.targetCtr;
    if (body.targetBudgetUtilization !== undefined)
      values.targetBudgetUtilization = body.targetBudgetUtilization;

    if (existing) {
      await db
        .update(furyConfig)
        .set(values)
        .where(eq(furyConfig.id, existing.id));
    } else {
      await db.insert(furyConfig).values({
        tenantId: req.params.tenantId,
        ...values,
      } as unknown as typeof furyConfig.$inferInsert);
    }

    res.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ─── Brand Kit ─────────────────────────────────────────

export async function getBrandKit(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const bk = await db.query.brandKits.findFirst({
      where: eq(brandKits.tenantId, req.params.tenantId),
    });

    res.json({ success: true, data: bk, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

export async function upsertBrandKit(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = updateBrandKitSchema.parse(req.body);
    const existing = await db.query.brandKits.findFirst({
      where: eq(brandKits.tenantId, req.params.tenantId),
    });

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.logo_url !== undefined) values.logoUrl = body.logo_url;
    if (body.primary_color !== undefined)
      values.primaryColor = body.primary_color;
    if (body.secondary_color !== undefined)
      values.secondaryColor = body.secondary_color;
    if (body.voice_tone !== undefined) values.voiceTone = body.voice_tone;
    if (body.photo_urls !== undefined) values.photoUrls = body.photo_urls;

    if (existing) {
      await db
        .update(brandKits)
        .set(values)
        .where(eq(brandKits.id, existing.id));
    } else {
      await db.insert(brandKits).values({
        tenantId: req.params.tenantId,
        ...values,
      } as unknown as typeof brandKits.$inferInsert);
    }

    res.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ─── Goals ─────────────────────────────────────────────

export async function upsertGoals(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = upsertGoalsSchema.parse(req.body);
    const tenantId = req.params.tenantId;

    const existing = await db.query.clientGoals.findFirst({
      where: eq(clientGoals.tenantId, tenantId),
    });

    const values = {
      objective: body.objective,
      niche: body.niche,
      mainProduct: body.mainProduct,
      monthlyBudget: toMoney(body.monthlyBudget),
      targetCpa: toMoney(body.targetCpa),
      updatedAt: new Date(),
    };

    if (existing) {
      await db
        .update(clientGoals)
        .set(values)
        .where(eq(clientGoals.id, existing.id));
    } else {
      await db.insert(clientGoals).values({
        tenantId,
        ...values,
      } as unknown as typeof clientGoals.$inferInsert);
    }

    res.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ─── Audience ──────────────────────────────────────────

export async function updateAudience(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const tenantId = req.params.tenantId;

    // Find the owner user of this tenant
    const owner = await db.query.users.findFirst({
      where: eq(users.tenantId, tenantId),
    });
    if (!owner)
      throw new AppError(
        404,
        "NO_OWNER",
        "Nenhum usuário encontrado neste tenant",
      );

    const { businessContext, ...audienceOnly } = req.body;
    const body = updateUserSchema.shape.audienceDefaults.parse(audienceOnly);

    await db
      .update(users)
      .set({ audienceDefaults: body })
      .where(eq(users.id, owner.id));

    if (businessContext !== undefined) {
      await db
        .update(tenants)
        .set({ businessContext })
        .where(eq(tenants.id, tenantId));
    }

    res.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ─── Plans ─────────────────────────────────────────────

export async function listPlans(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const allPlans = await db.query.plans.findMany({
      orderBy: [plans.priceCents],
    });

    // ponytail: 2 queries (plans + group-by counts) instead of N+1
    const counts = await db
      .select({
        planId: subscriptions.planId,
        count: sql<number>`count(*)::int`.mapWith(Number),
      })
      .from(subscriptions)
      .groupBy(subscriptions.planId);

    const countMap = new Map(counts.map((c) => [c.planId, c.count]));

    const data = allPlans.map((p) => ({
      ...p,
      subscriberCount: countMap.get(p.id) ?? 0,
    }));

    res.json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function createPlan(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = createPlanSchema.parse(req.body);
    const [plan] = await db.insert(plans).values(body).returning();
    res
      .status(201)
      .json({ success: true, data: plan, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

export async function updatePlan(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const body = updatePlanSchema.parse(req.body);
    const existing = await db.query.plans.findFirst({
      where: eq(plans.id, req.params.id),
    });
    if (!existing)
      throw new AppError(404, "PLAN_NOT_FOUND", "Plano não encontrado");

    await db.update(plans).set(body).where(eq(plans.id, req.params.id));
    res.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

export async function deletePlan(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { id } = req.params;
    const migrateTo = typeof req.query.migrateTo === "string" ? req.query.migrateTo : undefined;

    const plan = await db.query.plans.findFirst({
      where: eq(plans.id, id),
    });
    if (!plan)
      throw new AppError(404, "PLAN_NOT_FOUND", "Plano não encontrado");

    // Count subscribers
    const [result] = await db
      .select({ count: sql<number>`count(*)::int`.mapWith(Number) })
      .from(subscriptions)
      .where(eq(subscriptions.planId, id));

    const subscriberCount = result?.count ?? 0;

    if (subscriberCount > 0) {
      if (!migrateTo) {
        throw new AppError(
          409,
          "PLAN_HAS_SUBSCRIBERS",
          `Este plano possui ${subscriberCount} assinante(s). Migre-os antes de deletar.`,
          { subscriberCount },
        );
      }

      // ponytail: verify target exists before migrating
      const targetPlan = await db.query.plans.findFirst({
        where: eq(plans.id, migrateTo),
      });
      if (!targetPlan)
        throw new AppError(404, "TARGET_PLAN_NOT_FOUND", "Plano de destino não encontrado");

      await db
        .update(subscriptions)
        .set({ planId: migrateTo, updatedAt: new Date() })
        .where(eq(subscriptions.planId, id));
    }

    await db.delete(plans).where(eq(plans.id, id));

    res.json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ─── Users ─────────────────────────────────────────────

export async function listUsers(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const offset = (page - 1) * limit;
    const search = (req.query.search as string)?.trim() || null;

    const where = search
      ? or(
          ilike(users.name, `%${search}%`),
          ilike(users.email, `%${search}%`),
          ilike(tenants.name, `%${search}%`),
        )
      : undefined;

    const [countResult] = await db
      .select({ total: sql<number>`count(*)` })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(where);

    const total = Number(countResult?.total ?? 0);
    const pages = Math.ceil(total / limit);

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        tenantId: users.tenantId,
        createdAt: users.createdAt,
        tenantName: tenants.name,
      })
      .from(users)
      .leftJoin(tenants, eq(users.tenantId, tenants.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      data: { users: rows, total, page, pages, limit },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ─── Campaigns ──────────────────────────────────────────

export async function listTenantCampaigns(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { tenantId } = req.params;

    const campaigns = await db.query.campaigns.findMany({
      where: eq(sql`tenant_id`, tenantId),
      orderBy: [desc(sql`created_at`)],
    });

    const creativeAssetsList = await db.query.creativeAssets.findMany({
      where: eq(sql`tenant_id`, tenantId),
      orderBy: [desc(sql`created_at`)],
    });

    res.json({
      success: true,
      data: { campaigns, creativeAssets: creativeAssetsList },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
