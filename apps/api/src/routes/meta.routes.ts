import { Router } from 'express';
import * as metaController from '../controllers/meta.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.get('/auth/url', authMiddleware, metaController.getAuthUrl);
router.get('/auth/callback', metaController.authCallback);
router.get('/connections', authMiddleware, tenantMiddleware, metaController.getConnections);
router.delete(
  '/connections/:id',
  authMiddleware,
  tenantMiddleware,
  metaController.deleteConnection
);

export default router;
