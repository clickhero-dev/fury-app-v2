import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import {
  createCampaignHandler,
  pauseCampaignHandler,
  resumeCampaignHandler,
  updateBudgetHandler,
  getCampaignHandler,
} from '../controllers/campaigns.controller.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.post('/create', createCampaignHandler);
router.get('/:id', getCampaignHandler);
router.patch('/:id/pause', pauseCampaignHandler);
router.patch('/:id/resume', resumeCampaignHandler);
router.patch('/:id/budget', updateBudgetHandler);

export default router;
