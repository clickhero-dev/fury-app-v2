import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { createRuleHandler, getRulesHandler } from '../controllers/automation.controller.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.post('/rules', createRuleHandler);
router.get('/rules', getRulesHandler);
import * as automationController from '../controllers/automation.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.post('/rules', authMiddleware, tenantMiddleware, automationController.createRule);
router.get('/rules', authMiddleware, tenantMiddleware, automationController.getRules);
router.delete('/rules/:id', authMiddleware, tenantMiddleware, automationController.deleteRule);
router.get('/takedowns', authMiddleware, tenantMiddleware, automationController.getTakedowns);
router.get('/feed', authMiddleware, tenantMiddleware, automationController.getSSEFeed);

export default router;
