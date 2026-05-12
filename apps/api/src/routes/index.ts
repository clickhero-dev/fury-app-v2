import { Router } from 'express';
import healthRoutes from './health.js';
import authRoutes from './auth.routes.js';
import metaRoutes from './meta.routes.js';
import metricsRoutes from './metrics.routes.js';
import studioRoutes from './studio.routes.js';
import campaignRoutes from './campaigns.routes.js';
import automationRoutes from './automation.routes.js';

import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/meta', metaRoutes);
router.use('/metrics', authMiddleware, tenantMiddleware, metricsRoutes);
router.use('/studio', studioRoutes);
router.use('/campaigns', authMiddleware, tenantMiddleware, campaignRoutes);
router.use('/automation', automationRoutes);

export default router;
