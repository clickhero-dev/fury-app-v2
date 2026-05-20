import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import {
  createCampaignHandler,
  pauseCampaignHandler,
  resumeCampaignHandler,
  updateBudgetHandler,
  getCampaignHandler,
  getCampaignsHandler,
  updateCampaignHandler,
  updateCampaignStatusHandler,
  softDeleteCampaignHandler,
  getCampaignInsightsHandler,
} from '../controllers/campaigns.controller.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/', getCampaignsHandler);
router.post('/create', createCampaignHandler);
router.get('/:id', getCampaignHandler);
router.patch('/:id', updateCampaignHandler);
router.patch('/:id/status', updateCampaignStatusHandler);
router.delete('/:id', softDeleteCampaignHandler);
router.get('/:id/insights', getCampaignInsightsHandler);
router.patch('/:id/pause', pauseCampaignHandler);
router.patch('/:id/resume', resumeCampaignHandler);
router.patch('/:id/budget', updateBudgetHandler);

export default router;
