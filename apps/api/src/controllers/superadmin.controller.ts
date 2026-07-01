import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db, tenants, users, subscriptions, plans, furyConfig, brandKits } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';

const createUserSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(255),
  role: z.enum(['owner', 'admin', 'member']).default('member'),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  role: z.enum(['owner', 'admin', 'member']).optional(),
  audienceDefaults: z.object({
    city: z.string().optional(),
    cityKey: z.string().optional(),
    ageMin: z.number().int().min(18).max(65).optional(),
    ageMax: z.number().int().min(18).max(65).optional(),
    gender: z.enum(['all', 'male', 'female']).optional(),
  }).optional(),
});

const updateSubscriptionSchema = z.object({
  planId: z.string().uuid().optional(),
  status: z.enum(['trial', 'active', 'past_due', 'cancelled', 'inactive']).optional(),
  trialEndsAt: z.string().datetime().optional(),
  currentPeriodEnd: z.string().datetime().optional(),
  billingType: z.enum(['BOLETO', 'PIX', 'CREDIT_CARD']).optional(),
});

const updateFuryConfigSchema = z.object({
  targetRoas: z.string().optional(),
  targetCpa: z.string().optional(),
  targetCtr: z.string().optional(),
  targetBudgetUtilization: z.string().optional(),
});

const updateBrandKitSchema = z.object({
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  voiceTone: z.string().optional(),
  photoUrls: z.array(z.string()).optional(),
});

const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  priceCents: z.number().int().positive(),
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
  features: z.record(z.boolean()).default({}),
  isActive: z.boolean().default(true),
});

const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  priceCents: z.number().int().positive().optional(),
  interval: z.enum(['monthly', 'yearly']).optional(),
  features: z.record(z.boolean()).optional(),
  isActive: z.boolean().optional(),
});

// ─── Tenants ───────────────────────────────────────────

export async function listTenants(req: Request, res: Response, next: NextFunction) {
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
      })
    );

    res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

export async function getTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, req.params.id),
    });
    if (!tenant) throw new AppError(404, 'TENANT_NOT_FOUND', 'Tenant não encontrado');

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

    res.json({
      success: true,
      data: {
        ...tenant,
        users: tenantUsers,
        subscription: sub ? { ...sub, plan } : null,
        furyConfig: config,
        brandKit,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

// ─── Users ─────────────────────────────────────────────

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createUserSchema.parse(req.body);

    const existing = await db.query.users.findFirst({
      where: eq(users.email, body.email),
    });
    if (existing) throw new AppError(409, 'EMAIL_EXISTS', 'Email já cadastrado');

    const passwordHash = await bcrypt.hash(body.password, 12);
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

    res.status(201).json({ success: true, data: safe, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateUserSchema.parse(req.body);

    const existing = await db.query.users.findFirst({
      where: eq(users.id, req.params.id),
    });
    if (!existing) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado');

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.email !== undefined) updates.email = body.email;
    if (body.role !== undefined) updates.role = body.role;
    if (body.audienceDefaults !== undefined) updates.audienceDefaults = body.audienceDefaults;

    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, req.params.id));
    }

    res.json({ success: true, data: null, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

// ─── Subscription ──────────────────────────────────────

export async function updateSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateSubscriptionSchema.parse(req.body);

    const sub = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.tenantId, req.params.tenantId),
      orderBy: [desc(subscriptions.createdAt)],
    });
    if (!sub) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Assinatura não encontrada');

    const updates: Record<string, unknown> = {};
    if (body.planId !== undefined) updates.planId = body.planId;
    if (body.status !== undefined) updates.status = body.status;
    if (body.trialEndsAt !== undefined) updates.trialEndsAt = new Date(body.trialEndsAt);
    if (body.currentPeriodEnd !== undefined) updates.currentPeriodEnd = new Date(body.currentPeriodEnd);

    if (body.billingType !== undefined) {
      updates.asaasSubscriptionId = body.billingType;
    }

    updates.updatedAt = new Date();

    if (Object.keys(updates).length > 1) {
      await db.update(subscriptions).set(updates).where(eq(subscriptions.id, sub.id));
    }

    res.json({ success: true, data: null, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

// ─── Fury Config ───────────────────────────────────────

export async function updateFuryConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateFuryConfigSchema.parse(req.body);

    const existing = await db.query.furyConfig.findFirst({
      where: eq(furyConfig.tenantId, req.params.tenantId),
    });

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.targetRoas !== undefined) values.targetRoas = body.targetRoas;
    if (body.targetCpa !== undefined) values.targetCpa = body.targetCpa;
    if (body.targetCtr !== undefined) values.targetCtr = body.targetCtr;
    if (body.targetBudgetUtilization !== undefined) values.targetBudgetUtilization = body.targetBudgetUtilization;

    if (existing) {
      await db.update(furyConfig).set(values).where(eq(furyConfig.id, existing.id));
    } else {
      await db.insert(furyConfig).values({
        tenantId: req.params.tenantId,
        ...values,
      } as unknown as typeof furyConfig.$inferInsert);
    }

    res.json({ success: true, data: null, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

// ─── Brand Kit ─────────────────────────────────────────

export async function getBrandKit(req: Request, res: Response, next: NextFunction) {
  try {
    const bk = await db.query.brandKits.findFirst({
      where: eq(brandKits.tenantId, req.params.tenantId),
    });

    res.json({ success: true, data: bk, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

export async function upsertBrandKit(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateBrandKitSchema.parse(req.body);
    const existing = await db.query.brandKits.findFirst({
      where: eq(brandKits.tenantId, req.params.tenantId),
    });

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (body.logoUrl !== undefined) values.logoUrl = body.logoUrl;
    if (body.primaryColor !== undefined) values.primaryColor = body.primaryColor;
    if (body.secondaryColor !== undefined) values.secondaryColor = body.secondaryColor;
    if (body.voiceTone !== undefined) values.voiceTone = body.voiceTone;
    if (body.photoUrls !== undefined) values.photoUrls = JSON.stringify(body.photoUrls);

    if (existing) {
      await db.update(brandKits).set(values).where(eq(brandKits.id, existing.id));
    } else {
      await db.insert(brandKits).values({
        tenantId: req.params.tenantId,
        ...values,
      } as unknown as typeof brandKits.$inferInsert);
    }

    res.json({ success: true, data: null, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

// ─── Plans ─────────────────────────────────────────────

export async function listPlans(req: Request, res: Response, next: NextFunction) {
  try {
    const allPlans = await db.query.plans.findMany({
      orderBy: [plans.priceCents],
    });
    res.json({ success: true, data: allPlans, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

export async function createPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createPlanSchema.parse(req.body);
    const [plan] = await db.insert(plans).values(body).returning();
    res.status(201).json({ success: true, data: plan, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}

export async function updatePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updatePlanSchema.parse(req.body);
    const existing = await db.query.plans.findFirst({
      where: eq(plans.id, req.params.id),
    });
    if (!existing) throw new AppError(404, 'PLAN_NOT_FOUND', 'Plano não encontrado');

    await db.update(plans).set(body).where(eq(plans.id, req.params.id));
    res.json({ success: true, data: null, timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
}
