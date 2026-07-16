import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { generatePlan, getJob, getPlan, handleConfirm, handleRevalidate } from '../controllers/planner.controller.js';

const router = Router();

router.use(authMiddleware);

router.post('/generate', tenantMiddleware, generatePlan);
router.get('/jobs/:jobId', tenantMiddleware, getJob);
router.get('/plans/:planId', tenantMiddleware, getPlan);
router.post('/plans/confirm', tenantMiddleware, handleConfirm);
router.post('/plans/revalidate', tenantMiddleware, handleRevalidate);

export default router;
