import { Router } from "express";
import { controllers } from "../di.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { superadminMiddleware } from "../middleware/superadmin.middleware.js";

const router = Router();

// All routes require auth + superadmin role
router.use(authMiddleware, superadminMiddleware);

// Dashboard (stats globais)
router.get("/dashboard", controllers.superadmin.getDashboard);

// Tenants
router.get("/tenants", controllers.superadmin.listTenants);
router.get("/tenants/:id", controllers.superadmin.getTenant);
router.delete("/tenants/:id", controllers.superadmin.deleteTenant);

// Users
router.get("/users", controllers.superadmin.listUsers);
router.post("/users", controllers.superadmin.createUser);
router.get("/users/check-email/:email", controllers.superadmin.checkEmail);
router.patch("/users/:id", controllers.superadmin.updateUser);
router.delete("/users/:id", controllers.superadmin.deleteUser);

// Setup tenant + user
router.post("/setup-tenant", controllers.superadmin.setupTenant);

// Subscription
router.patch(
  "/tenants/:tenantId/subscription",
  controllers.superadmin.updateSubscription,
);
router.post(
  "/tenants/:tenantId/reset-quota",
  controllers.superadmin.resetQuota,
);

// Fury Config (Benchmarks)
router.patch(
  "/tenants/:tenantId/fury-config",
  controllers.superadmin.updateFuryConfig,
);

// Brand Kit
router.get("/tenants/:tenantId/brand-kit", controllers.superadmin.getBrandKit);
router.patch(
  "/tenants/:tenantId/brand-kit",
  controllers.superadmin.upsertBrandKit,
);

// Campaigns
router.get(
  "/tenants/:tenantId/campaigns",
  controllers.superadmin.listTenantCampaigns,
);

// Goals
router.put("/tenants/:tenantId/goals", controllers.superadmin.upsertGoals);

// Audience
router.patch(
  "/tenants/:tenantId/audience",
  controllers.superadmin.updateAudience,
);

// Plans
router.get("/plans", controllers.superadmin.listPlans);
router.post("/plans", controllers.superadmin.createPlan);
router.patch("/plans/:id", controllers.superadmin.updatePlan);
router.delete("/plans/:id", controllers.superadmin.deletePlan);

export default router;