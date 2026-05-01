import { Router } from 'express';
import healthRoutes from './health.js';
import authRoutes from './auth.routes.js';
import metaRoutes from './meta.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/meta', metaRoutes);

export default router;