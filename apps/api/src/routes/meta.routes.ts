import { Router } from 'express';
import * as metaController from '../controllers/meta.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.get('/auth/test', (req, res) => {
  res.json({ status: 'ok', message: 'meta auth router is reachable', timestamp: new Date().toISOString() });
});

router.get('/auth/url', authMiddleware, metaController.getAuthUrl);
router.get('/auth/callback', metaController.authCallback);
router.get('/scopes', authMiddleware, tenantMiddleware, metaController.getScopes);
router.get('/pages', authMiddleware, tenantMiddleware, metaController.getPages);
router.get(
  '/pages/:pageId/whatsapp-numbers',
  authMiddleware,
  tenantMiddleware,
  metaController.getPageWhatsappNumbers
);
router.get('/businesses', authMiddleware, tenantMiddleware, metaController.getBusinesses);
router.post('/pages-by-business', authMiddleware, tenantMiddleware, metaController.getPagesByBusiness);
router.post('/adaccounts-by-business', authMiddleware, tenantMiddleware, metaController.getAdAccountsByBusiness);
router.post('/whatsapp-by-pages', authMiddleware, tenantMiddleware, metaController.getWhatsappByPages);
router.post('/save-selection', authMiddleware, tenantMiddleware, metaController.saveSelection);
router.get('/asset-selection', authMiddleware, tenantMiddleware, metaController.getAssetSelection);
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
