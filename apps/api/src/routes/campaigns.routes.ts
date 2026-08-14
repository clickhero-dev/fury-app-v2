import { Router } from 'express';
import multer from 'multer';
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
  createWizardCampaignHandler,
  mcpLogWizardHandler,
  searchMetaLocationsHandler,
  uploadWizardCreativeHandler,
  createWizardCampaignDiagHandler,
  searchMetaInterestsHandler,
  suggestTextHandler
} from '../controllers/campaigns.controller.js';

const router = Router();

const creativeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpeg') {
      cb(null, true);
    } else {
      cb(new Error('Formato inválido. Envie PNG ou JPG.'));
    }
  },
});

// Static and collection routes first
router.get('/', getCampaignsHandler);
router.post('/create', createCampaignHandler);
router.post('/create-wizard', createWizardCampaignHandler);
router.post('/mcp-log', mcpLogWizardHandler);
router.get('/create-wizard-diag', createWizardCampaignDiagHandler);
router.post('/upload-creative', creativeUpload.single('file'), uploadWizardCreativeHandler);
// Note: /meta-locations and /meta-interests are defined in index.ts with custom middleware
router.post('/suggest-text', suggestTextHandler);

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
