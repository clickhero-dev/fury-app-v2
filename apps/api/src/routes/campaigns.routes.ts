import { Router } from 'express';
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

// Static and collection routes first
router.get('/', getCampaignsHandler);
router.post('/create', createCampaignHandler);

// Specific sub-resource routes before generic /:id to avoid Express matching /:id first
router.patch('/:id/pause', pauseCampaignHandler);
router.patch('/:id/resume', resumeCampaignHandler);
router.patch('/:id/status', updateCampaignStatusHandler);
router.patch('/:id/budget', updateBudgetHandler);
router.get('/:id/insights', getCampaignInsightsHandler);

// Generic /:id routes last
router.get('/:id', getCampaignHandler);
router.patch('/:id', updateCampaignHandler);
router.delete('/:id', softDeleteCampaignHandler);

export default router;
