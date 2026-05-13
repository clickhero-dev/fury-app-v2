import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import * as studioController from '../controllers/studio.controller.js';

const router = Router();

router.post('/generate-image', authMiddleware, tenantMiddleware, studioController.generateImage);
router.post('/upload-to-meta', authMiddleware, tenantMiddleware, studioController.uploadToMeta);

export default router;