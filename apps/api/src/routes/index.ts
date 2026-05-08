import authRoutes from './auth.routes.js';

import { Router } from 'express';
import healthRoutes from './health.js';
import goalsRoutes from './goals.routes.js';
import furyRoutes from './fury.routes.js';
import campaignsRoutes from './campaigns.routes.js';

const router = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/goals', goalsRoutes);
router.use('/fury', furyRoutes);
router.use('/campaigns', campaignsRoutes);

export default router;
