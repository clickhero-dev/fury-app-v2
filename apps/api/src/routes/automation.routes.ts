import { Router } from 'express';

import * as automationController from '../controllers/automation.controller.js';

import { authMiddleware, authSSEMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.get('/feed', authSSEMiddleware, tenantMiddleware, automationController.getSSEFeedHandler);

router.use(authMiddleware, tenantMiddleware);

router.post('/rules', automationController.createRuleHandler);

router.get('/rules', automationController.getRulesHandler);

router.delete('/rules/:id', automationController.deleteRuleHandler);

router.get('/takedowns', automationController.getTakedownsHandler);

router.post('/budget-smart', automationController.budgetSmartHandler);

export default router;