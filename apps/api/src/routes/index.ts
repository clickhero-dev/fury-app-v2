import { Router } from 'express';
import healthRoutes from './health.js';
import authRoutes from './auth.routes.js';
import metaRoutes from './meta.routes.js';
import metricsRoutes from './metrics.routes.js';
<<<<<<< HEAD
import automationRoutes from './automation.routes.js';
=======
import campaignRoutes from './campaigns.routes.js';
>>>>>>> main
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/meta', metaRoutes);
router.use('/metrics', authMiddleware, tenantMiddleware, metricsRoutes);
<<<<<<< HEAD
router.use('/automation', automationRoutes);
=======
router.use('/campaigns', authMiddleware, tenantMiddleware, campaignRoutes);
>>>>>>> main

export default router;
