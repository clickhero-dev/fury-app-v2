import { Router } from 'express';
import healthRoutes from './health.js';
import metricsRoutes from './metrics.routes.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.use('/', healthRoutes);

router.use('/metrics', authMiddleware, tenantMiddleware, metricsRoutes);

export default router;
