import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { setupGoal, getGoal, updateGoal } from '../controllers/goals.controller.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.post('/setup', setupGoal);
router.get('/', getGoal);
router.put('/', updateGoal);

export default router;
