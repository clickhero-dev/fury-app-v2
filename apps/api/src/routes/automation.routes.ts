import { Router } from 'express';

import * as automationController from '../controllers/automation.controller.js';

import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.post('/rules', automationController.createRule);

router.get('/rules', automationController.getRules);

router.delete('/rules/:id', automationController.deleteRule);

router.get('/takedowns', automationController.getTakedowns);

router.get('/feed', automationController.getSSEFeed);

export default router;