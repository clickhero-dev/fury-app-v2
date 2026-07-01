import { Router } from 'express';
import healthRoutes from './health.js';
import authRoutes from './auth.routes.js';
import metaRoutes from './meta.routes.js';
import metricsRoutes from './metrics.routes.js';
import automationRoutes from './automation.routes.js';
import studioRoutes from './studio.routes.js';
import campaignRoutes from './campaigns.routes.js';
import budgetRoutes from './budget.routes.js';
import instagramRoutes from './instagram.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import formsRoutes from './forms.routes.js';
import openrouterRoutes from './openrouter.routes.js';
import observabilityRoutes from './observability.routes.js';

import furyRoutes from './fury.routes.js';
import goalsRoutes from './goals.routes.js';
import billingRoutes from './billing.routes.js';
import brandKitRoutes from './brand-kit.routes.js';

import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/meta', metaRoutes);

router.use('/metrics', authMiddleware, tenantMiddleware, metricsRoutes);
router.use('/automation', automationRoutes);
router.use('/studio', studioRoutes);
router.use('/campaigns', authMiddleware, tenantMiddleware, campaignRoutes);
router.use('/budget', budgetRoutes);
router.use('/instagram', authMiddleware, tenantMiddleware, instagramRoutes);
router.use('/dashboard', authMiddleware, tenantMiddleware, dashboardRoutes);
router.use('/forms', authMiddleware, tenantMiddleware, formsRoutes);
router.use('/metrics', authMiddleware, tenantMiddleware, observabilityRoutes);
router.use('/fury', furyRoutes);
router.use('/goals', goalsRoutes);
router.use('/billing', billingRoutes);
router.use('/brand-kit', authMiddleware, tenantMiddleware, brandKitRoutes);
router.use('/openrouter', openrouterRoutes);

export default router;
