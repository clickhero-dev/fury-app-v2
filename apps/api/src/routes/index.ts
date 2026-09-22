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
import studioAiRoutes from "./studio-ai.routes.js";
import observabilityRoutes from "./observability.routes.js";
import bullBoardRoutes from "./bull-board.routes.js";

import furyRoutes from "./fury.routes.js";
import goalsRoutes from "./goals.routes.js";
import billingRoutes from "./billing.routes.js";
import brandKitRoutes from "./brand-kit.routes.js";
import superadminRoutes from "./superadmin.routes.js";
import policyRoutes from "./policy.routes.js";
import plannerRoutes from "./planner.routes.js"; // NOVO
import wppRoutes from "./wpp.routes.js";

import { authMiddleware } from "../middleware/auth.middleware.js";
import { tenantMiddleware } from "../middleware/tenant.middleware.js";
import { tenantOrSuperadminMiddleware } from "../middleware/tenantOrSuperadmin.middleware.js";
import { checkSubscriptionActive } from "../middleware/checkSubscriptionActive.js";
import { searchMetaLocationsHandler, searchMetaInterestsHandler, debugSearchNeighborhoodsHandler } from "../controllers/campaigns.controller.js";

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
// Debug temporário — Fase 1 da spec de segmentação por bairro/cidade (spec-segmentacao-bairro-cidade). Remover depois.
router.get("/campaigns/debug-meta-neighborhoods", authMiddleware, checkSubscriptionActive, tenantOrSuperadminMiddleware, debugSearchNeighborhoodsHandler);

router.use("/campaigns", ...AUTH_TENANT_SUB, campaignRoutes);
router.use("/budget", budgetRoutes);
router.use("/instagram", ...AUTH_TENANT_SUB, instagramRoutes);
router.use("/dashboard", ...AUTH_TENANT_SUB, dashboardRoutes);
router.use("/forms", ...AUTH_TENANT_SUB, formsRoutes);
router.use("/fury", furyRoutes);
router.use("/goals", goalsRoutes);
router.use("/billing", billingRoutes);
// Política de uso: auth+tenant (sem checkSubscriptionActive) — o aceite vem
// ANTES do onboarding/planos, e usuário novo ainda não tem assinatura.
router.use("/policy", authMiddleware, tenantMiddleware, policyRoutes);
router.use("/brand-kit", ...AUTH_TENANT_SUB, brandKitRoutes);
router.use("/studio/ai", studioAiRoutes);
router.use(
  "/observability",
  ...AUTH_TENANT_SUB,
  observabilityRoutes,
);
router.use("/admin", superadminRoutes);
router.use("/admin/queues", bullBoardRoutes);
router.use("/planner", ...AUTH_TENANT_SUB, plannerRoutes); // NOVO
router.use("/wpp", wppRoutes);

export default router;
