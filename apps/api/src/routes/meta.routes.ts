import { Router } from 'express';
import * as metaController from '../controllers/meta.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.get('/auth/test', (req, res) => {
  console.log('=== META AUTH TEST HIT ===');
  res.json({ status: 'ok', message: 'meta auth router is reachable', timestamp: new Date().toISOString() });
});

router.get('/auth/url', authMiddleware, metaController.getAuthUrl);
router.get('/auth/callback', metaController.authCallback);
router.get('/scopes', authMiddleware, tenantMiddleware, metaController.getScopes);
router.get('/connections', authMiddleware, tenantMiddleware, metaController.getConnections);
router.patch(
  '/connections/:id/select-account',
  authMiddleware,
  tenantMiddleware,
  metaController.selectAdAccount
);
router.delete(
  '/connections/:id',
  authMiddleware,
  tenantMiddleware,
  metaController.deleteConnection
);

export default router;
