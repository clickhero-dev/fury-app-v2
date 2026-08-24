import { Router } from "express";
import healthRoutes from "./health.js";
import authRoutes from "./auth.routes.js";
import metaRoutes from "./meta.routes.js";
import googleRoutes from "./google.routes.js";
import metricsRoutes from "./metrics.routes.js";
import automationRoutes from "./automation.routes.js";
import studioRoutes from "./studio.routes.js";
import campaignRoutes from "./campaigns.routes.js";
import budgetRoutes from "./budget.routes.js";
import instagramRoutes from "./instagram.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import formsRoutes from "./forms.routes.js";
import openrouterRoutes from "./openrouter.routes.js";
import observabilityRoutes from "./observability.routes.js";

import furyRoutes from "./fury.routes.js";
import goalsRoutes from "./goals.routes.js";
import billingRoutes from "./billing.routes.js";
import brandKitRoutes from "./brand-kit.routes.js";
import superadminRoutes from "./superadmin.routes.js";
import plannerRoutes from "./planner.routes.js"; // NOVO

import { authMiddleware } from "../middleware/auth.middleware.js";
import { tenantMiddleware } from "../middleware/tenant.middleware.js";
import { tenantOrSuperadminMiddleware } from "../middleware/tenantOrSuperadmin.middleware.js";
import { checkSubscriptionActive } from "../middleware/checkSubscriptionActive.js";
import { searchMetaLocationsHandler, searchMetaInterestsHandler } from "../controllers/campaigns.controller.js";

const AUTH_TENANT_SUB = [authMiddleware, tenantMiddleware, checkSubscriptionActive];

const router = Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/meta", metaRoutes);
router.use("/google", googleRoutes);

router.use("/metrics", ...AUTH_TENANT_SUB, metricsRoutes);
router.use("/automation", automationRoutes);
router.use("/studio", studioRoutes);

// Allow superadmin to access meta-locations with explicit tenantId (query param or header)
router.get("/campaigns/meta-locations", authMiddleware, checkSubscriptionActive, tenantOrSuperadminMiddleware, searchMetaLocationsHandler);
router.get("/campaigns/meta-interests", authMiddleware, checkSubscriptionActive, tenantOrSuperadminMiddleware, searchMetaInterestsHandler);

router.use("/campaigns", ...AUTH_TENANT_SUB, campaignRoutes);
router.use("/budget", budgetRoutes);
router.use("/instagram", ...AUTH_TENANT_SUB, instagramRoutes);
router.use("/dashboard", ...AUTH_TENANT_SUB, dashboardRoutes);
router.use("/forms", ...AUTH_TENANT_SUB, formsRoutes);
router.use("/fury", furyRoutes);
router.use("/goals", goalsRoutes);
router.use("/billing", billingRoutes);
router.use("/brand-kit", ...AUTH_TENANT_SUB, brandKitRoutes);
router.use("/openrouter", openrouterRoutes);
router.use(
  "/observability",
  ...AUTH_TENANT_SUB,
  observabilityRoutes,
);
router.use("/admin", superadminRoutes);
router.use("/planner", ...AUTH_TENANT_SUB, plannerRoutes); // NOVO

export default router;
