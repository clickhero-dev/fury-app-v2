import { Router } from "express";
import * as superadminController from "../controllers/superadmin.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { superadminMiddleware } from "../middleware/superadmin.middleware.js";

const router = Router();

// All routes require auth + superadmin role
router.use(authMiddleware, superadminMiddleware);

// Tenants
router.get("/tenants", superadminController.listTenants);
router.get("/tenants/:id", superadminController.getTenant);
router.delete("/tenants/:id", superadminController.deleteTenant);

// Users
router.get("/users", superadminController.listUsers);
router.post("/users", superadminController.createUser);
router.patch("/users/:id", superadminController.updateUser);
router.delete("/users/:id", superadminController.deleteUser);

// Setup tenant + user
router.post("/setup-tenant", superadminController.setupTenant);

// Subscription
router.patch(
  "/tenants/:tenantId/subscription",
  superadminController.updateSubscription,
);

// Fury Config (Benchmarks)
router.patch(
  "/tenants/:tenantId/fury-config",
  superadminController.updateFuryConfig,
);

// Brand Kit
router.get("/tenants/:tenantId/brand-kit", superadminController.getBrandKit);
router.patch(
  "/tenants/:tenantId/brand-kit",
  superadminController.upsertBrandKit,
);

// Campaigns
router.get(
  "/tenants/:tenantId/campaigns",
  superadminController.listTenantCampaigns,
);

// Goals
router.put("/tenants/:tenantId/goals", superadminController.upsertGoals);

// Audience
router.patch(
  "/tenants/:tenantId/audience",
  superadminController.updateAudience,
);

// Plans
router.get("/plans", superadminController.listPlans);
router.post("/plans", superadminController.createPlan);
router.patch("/plans/:id", superadminController.updatePlan);

export default router;
