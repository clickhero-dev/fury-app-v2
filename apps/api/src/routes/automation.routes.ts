import { Router } from 'express';

import { controllers } from '../di.js';

import { authMiddleware, authSSEMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.get('/feed', authSSEMiddleware, tenantMiddleware, controllers.automation.getSSEFeedHandler);

router.use(authMiddleware, tenantMiddleware);

router.post('/rules', controllers.automation.createRuleHandler);

router.get('/rules', controllers.automation.getRulesHandler);

router.delete('/rules/:id', controllers.automation.deleteRuleHandler);

router.get('/takedowns', controllers.automation.getTakedownsHandler);

router.post('/budget-smart', controllers.automation.budgetSmartHandler);

export default router;