import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { createRuleHandler, getRulesHandler } from '../controllers/automation.controller.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.post('/rules', createRuleHandler);
router.get('/rules', getRulesHandler);

export default router;
