import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { analyze, getInsights } from '../controllers/fury.controller.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.post('/analyze', analyze);
router.get('/insights', getInsights);

export default router;
