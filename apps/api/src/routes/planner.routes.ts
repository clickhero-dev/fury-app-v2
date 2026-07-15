import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { generatePlan, getJobStatus, getPlan, updatePost } from '../controllers/planner.controller.js';

const router = Router();

const AUTH = [authMiddleware, tenantMiddleware];

router.post('/generate', ...AUTH, generatePlan);
router.get('/jobs/:jobId', ...AUTH, getJobStatus);
router.get('/plans/:planId', ...AUTH, getPlan);
router.patch('/posts/:postId', ...AUTH, updatePost);

export default router;
