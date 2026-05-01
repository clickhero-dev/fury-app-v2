import { Router } from 'express';
import healthRoutes from './health.js';
import goalsRoutes from './goals.routes.js';
import furyRoutes from './fury.routes.js';

const router = Router();

router.use('/', healthRoutes);
router.use('/goals', goalsRoutes);
router.use('/fury', furyRoutes);

export default router;
