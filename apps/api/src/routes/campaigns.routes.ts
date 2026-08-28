import { Router } from 'express';
import multer from 'multer';
import { controllers } from '../di.js';

const campaigns = controllers.campaigns;

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
router.get('/', campaigns.getCampaigns);
router.post('/create', campaigns.createCampaign);
router.post('/create-wizard', campaigns.createWizardCampaign);
router.post('/mcp-log', campaigns.mcpLogWizard);
router.get('/create-wizard-diag', campaigns.createWizardCampaignDiag);
router.post('/upload-creative', creativeUpload.single('file'), campaigns.uploadWizardCreative);
// Note: /meta-locations and /meta-interests are defined in index.ts with custom middleware
router.post('/suggest-text', campaigns.suggestText);

// Specific sub-resource routes before generic /:id to avoid Express matching /:id first
router.patch('/:id/pause', campaigns.pauseCampaign);
router.patch('/:id/resume', campaigns.resumeCampaign);
router.patch('/:id/status', campaigns.updateCampaignStatus);
router.patch('/:id/budget', campaigns.updateBudget);
router.get('/:id/insights', campaigns.getCampaignInsights);

// Generic /:id routes last
router.get('/:id', campaigns.getCampaign);
router.patch('/:id', campaigns.updateCampaign);
router.delete('/:id', campaigns.softDeleteCampaign);

export default router;