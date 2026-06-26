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
router.get('/create-wizard-diag', async (req: any, res: any) => {
  // DIAG: Test if createCampaignFromWizard is importable and callable
  try {
    const { createCampaignFromWizard } = await import('../services/campaigns.service.js');
    if (typeof createCampaignFromWizard !== 'function') {
      return res.json({ success: false, error: { code: 'NOT_A_FUNCTION', type: typeof createCampaignFromWizard } });
    }
    return res.json({ success: true, message: 'createCampaignFromWizard is a function and importable' });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: { code: 'IMPORT_FAIL', message: e.message, stack: e.stack?.split('\n').slice(0, 5) } });
  }
});
router.post('/upload-creative', creativeUpload.single('file'), uploadWizardCreativeHandler);
router.get('/meta-locations', searchMetaLocationsHandler);

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
