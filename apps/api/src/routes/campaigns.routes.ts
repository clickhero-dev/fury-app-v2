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

// Wrapper que garante JSON sempre, mesmo se o handler crashar
function safeHandler(handler: any) {
  return async (req: any, res: any, next: any) => {
    try {
      await handler(req, res, next);
    } catch (e: any) {
      console.error('[SAFE] Wizard crash:', e?.message || e);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: { code: 'WIZARD_CRASH', message: e?.message || 'Unknown error' },
        });
      }
    }
  };
}

// Static and collection routes first
router.get('/', getCampaignsHandler);
router.post('/create', createCampaignHandler);
router.post('/create-wizard', safeHandler(createWizardCampaignHandler));
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
