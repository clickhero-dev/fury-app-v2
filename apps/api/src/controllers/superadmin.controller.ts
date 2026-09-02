import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import bcrypt from "bcrypt";
import { db, tenants, users, clientGoals } from "@fury/db";
import { AppError } from "../middleware/errorHandler.js";
import { SuperAdminRepository } from "../repository/superadmin.repository.js";

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
      audienceInterests: z.array(z.object({
        id: z.string(),
        name: z.string(),
      })).optional(),
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

/**
 * Controller SuperAdmin (GLOBAL) — operações administrativas que cruzam todos
 * os tenants. Instanciado uma vez no composition root (di.ts) com o
 * SuperAdminRepository global injetado. ADR-0001.
 */
export class SuperAdminController {
  constructor(private repo: SuperAdminRepository) {}

  // ─── Tenants ───────────────────────────────────────────

  listTenants = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = this.repo;
      const allTenants = await repo.listTenants();

      const data = await Promise.all(
        allTenants.map(async (t) => {
          const userCount = await repo.countUsersByTenant(t.id);

          const sub = await repo.findLatestSubscriptionByTenant(t.id);

          let plan = null;
          if (sub) {
            plan = await repo.findPlanById(sub.planId);
          }

          return {
            ...t,
            userCount,
            subscription: sub ? { ...sub, plan } : null,
          };
        }),
      );

      res.json({ success: true, data, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };

  getTenant = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = this.repo;
      const tenant = await repo.getTenantById(req.params.id);
      if (!tenant)
        throw new AppError(404, "TENANT_NOT_FOUND", "Tenant não encontrado");

      const tenantUsers = await repo.listUsersByTenant(tenant.id);

      const sub = await repo.findLatestSubscriptionByTenant(tenant.id);

      let plan = null;
      if (sub) {
        plan = await repo.findPlanById(sub.planId);
      }

      const config = await repo.findFuryConfig(tenant.id);

      const brandKit = await repo.findBrandKitByTenant(tenant.id);

      const goals = await repo.findClientGoalByTenant(tenant.id);

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
      console.error('❌ ERROR in getTenant:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : 'no stack',
        tenantId: req.params.id,
      });
      next(err);
    }
  };

  deleteTenant = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = this.repo;
      const tenant = await repo.getTenantById(req.params.id);
      if (!tenant)
        throw new AppError(404, "TENANT_NOT_FOUND", "Tenant não encontrado");

      await repo.deleteTenant(req.params.id);

      res.json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── Users ─────────────────────────────────────────────

  createUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = this.repo;
      const body = createUserSchema.parse(req.body);

      const existing = await repo.findUserByEmail(body.email);
      if (existing)
        throw new AppError(409, "EMAIL_EXISTS", "Email já cadastrado");

      const passwordHash = await bcrypt.hash(body.password, 10);
      const user = await repo.createUser({
        tenantId: body.tenantId,
        name: body.name,
        email: body.email,
        passwordHash,
        role: body.role,
      });

      const { passwordHash: _, ...safe } = user;

      res
        .status(201)
        .json({ success: true, data: safe, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };

  setupTenant = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = setupTenantSchema.parse(req.body);
      const slug =
        body.slug ??
        body.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

      const repo = this.repo;
      const existingSlug = await repo.findTenantBySlug(slug);
      if (existingSlug) throw new AppError(409, "SLUG_EXISTS", "Slug já existe");

      const existingEmail = await repo.findUserByEmail(body.userEmail);
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
  };

  checkEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await this.repo.findUserByEmail(req.params.email);
      res.json({ success: true, data: { exists: !!user } });
    } catch (err) {
      next(err);
    }
  };

  updateUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = this.repo;
      const body = updateUserSchema.parse(req.body);

      const existing = await repo.findUserById(req.params.id);
      if (!existing)
        throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");

      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.email !== undefined) updates.email = body.email;
      if (body.role !== undefined) updates.role = body.role;
      if (body.audienceDefaults !== undefined)
        updates.audienceDefaults = body.audienceDefaults;

      if (Object.keys(updates).length > 0) {
        await repo.updateUser(req.params.id, updates);
      }

      res.json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  deleteUser = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = this.repo;
      const existing = await repo.findUserById(req.params.id);
      if (!existing)
        throw new AppError(404, "USER_NOT_FOUND", "Usuário não encontrado");

      await repo.deleteUser(req.params.id);

      res.json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── Subscription ──────────────────────────────────────

  updateSubscription = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = this.repo;
      const body = updateSubscriptionSchema.parse(req.body);

      const sub = await repo.findLatestSubscriptionByTenant(req.params.tenantId);

      const now = new Date();

      if (!sub) {
        // Create subscription if none exists
        const planId =
          body.planId ??
          (await repo.getFirstPlan())?.id;
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

        const chosenPlan = await repo.findPlanById(planId);
        const creativesRemaining =
          (chosenPlan?.limits as { creativesPerMonth?: number | null } | null)?.creativesPerMonth ?? null;

        await repo.createSubscription({
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
        const effectivePlan = await repo.findPlanById(effectivePlanId);
        updates.creativesRemaining =
          (effectivePlan?.limits as { creativesPerMonth?: number | null } | null)?.creativesPerMonth ?? null;

        updates.updatedAt = now;

        if (Object.keys(updates).length >= 1) {
          await repo.updateSubscription(sub.id, updates);
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
  };

  // ─── Fury Config ───────────────────────────────────────

  updateFuryConfig = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = this.repo;
      const body = updateFuryConfigSchema.parse(req.body);

      const existing = await repo.findFuryConfig(req.params.tenantId);

      const values: Record<string, unknown> = { updatedAt: new Date() };
      if (body.targetRoas !== undefined) values.targetRoas = body.targetRoas;
      if (body.targetCpa !== undefined) values.targetCpa = body.targetCpa;
      if (body.targetCtr !== undefined) values.targetCtr = body.targetCtr;
      if (body.targetBudgetUtilization !== undefined)
        values.targetBudgetUtilization = body.targetBudgetUtilization;

      if (existing) {
        await repo.updateFuryConfig(req.params.tenantId, values);
      } else {
        await repo.createFuryConfig({
          tenantId: req.params.tenantId,
          ...values,
        });
      }

      res.json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── Brand Kit ─────────────────────────────────────────

  getBrandKit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bk = await this.repo.findBrandKitByTenant(req.params.tenantId);

      res.json({ success: true, data: bk, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };

  upsertBrandKit = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = this.repo;
      const body = updateBrandKitSchema.parse(req.body);
      const existing = await repo.findBrandKitByTenant(req.params.tenantId);

      const values: Record<string, unknown> = { updatedAt: new Date() };
      if (body.logo_url !== undefined) values.logoUrl = body.logo_url;
      if (body.primary_color !== undefined)
        values.primaryColor = body.primary_color;
      if (body.secondary_color !== undefined)
        values.secondaryColor = body.secondary_color;
      if (body.voice_tone !== undefined) values.voiceTone = body.voice_tone;
      if (body.photo_urls !== undefined) values.photoUrls = body.photo_urls;

      if (existing) {
        await repo.updateBrandKit(req.params.tenantId, values);
      } else {
        await repo.createBrandKit({
          tenantId: req.params.tenantId,
          ...values,
        });
      }

      res.json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── Goals ─────────────────────────────────────────────

  upsertGoals = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = this.repo;
      const body = upsertGoalsSchema.parse(req.body);
      const tenantId = req.params.tenantId;

      const existing = await repo.findClientGoalByTenant(tenantId);

      const values = {
        objective: body.objective,
        niche: body.niche,
        mainProduct: body.mainProduct,
        monthlyBudget: toMoney(body.monthlyBudget),
        targetCpa: toMoney(body.targetCpa),
        updatedAt: new Date(),
      };

      if (existing) {
        await repo.updateClientGoal(tenantId, values);
      } else {
        await repo.createClientGoal({
          tenantId,
          ...values,
        });
      }

      res.json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── Audience ──────────────────────────────────────────

  updateAudience = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.params.tenantId;

      const repo = this.repo;

      // Find the owner user of this tenant
      const owner = (await repo.listUsersByTenant(tenantId))[0] ?? null;
      if (!owner)
        throw new AppError(
          404,
          "NO_OWNER",
          "Nenhum usuário encontrado neste tenant",
        );

      const { businessContext, ...audienceOnly } = req.body;
      const body = updateUserSchema.shape.audienceDefaults.parse(audienceOnly);

      await repo.updateUserAudienceDefaults(owner.id, body);

      if (businessContext !== undefined) {
        await repo.updateTenant(tenantId, { businessContext });
      }

      res.json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── Plans ─────────────────────────────────────────────

  listPlans = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = this.repo;
      const allPlans = await repo.listPlans();

      const counts = await repo.listSubscriberCountsByPlan();

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
  };

  createPlan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createPlanSchema.parse(req.body);
      const plan = await this.repo.createPlan(body);
      res
        .status(201)
        .json({ success: true, data: plan, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };

  updatePlan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = this.repo;
      const body = updatePlanSchema.parse(req.body);
      const existing = await repo.findPlanById(req.params.id);
      if (!existing)
        throw new AppError(404, "PLAN_NOT_FOUND", "Plano não encontrado");

      await repo.updatePlan(req.params.id, body);
      res.json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  deletePlan = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const repo = this.repo;
      const { id } = req.params;
      const migrateTo = typeof req.query.migrateTo === "string" ? req.query.migrateTo : undefined;

      const plan = await repo.findPlanById(id);
      if (!plan)
        throw new AppError(404, "PLAN_NOT_FOUND", "Plano não encontrado");

      // Count subscribers
      const subscriberCount = await repo.countSubscriptionsByPlan(id);

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
        const targetPlan = await repo.findPlanById(migrateTo);
        if (!targetPlan)
          throw new AppError(404, "TARGET_PLAN_NOT_FOUND", "Plano de destino não encontrado");

        await repo.migratePlanSubscriptions(id, migrateTo);
      }

      await repo.deletePlan(id);

      res.json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── Users (admin list) ────────────────────────────────

  listUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
      const offset = (page - 1) * limit;
      const search = (req.query.search as string)?.trim() || null;

      const { rows, total } = await this.repo.paginateUsersAdmin(search ?? '', limit, offset);
      const pages = Math.ceil(total / limit);

      res.json({
        success: true,
        data: { users: rows, total, page, pages, limit },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  // ─── Campaigns ─────────────────────────────────────────

  listTenantCampaigns = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId } = req.params;
      const repo = this.repo;

      const campaigns = await repo.findCampaignsByTenant(tenantId);

      const creativeAssetsList = await repo.findCreativeAssetsByTenant(tenantId);

      res.json({
        success: true,
        data: { campaigns, creativeAssets: creativeAssetsList },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}