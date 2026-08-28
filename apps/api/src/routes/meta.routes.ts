import { Router } from 'express';
import { controllers } from '../di.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.get('/auth/test', (req, res) => {
  res.json({ status: 'ok', message: 'meta auth router is reachable', timestamp: new Date().toISOString() });
});

router.get('/auth/url', authMiddleware, controllers.meta.getAuthUrl);
router.get('/auth/callback', controllers.meta.authCallback);
router.get('/scopes', authMiddleware, tenantMiddleware, controllers.meta.getScopes);
router.get('/pages', authMiddleware, tenantMiddleware, controllers.meta.getPages);
router.get(
  '/pages/:pageId/whatsapp-numbers',
  authMiddleware,
  tenantMiddleware,
  controllers.meta.getPageWhatsappNumbers
);
router.get('/businesses', authMiddleware, tenantMiddleware, controllers.meta.getBusinesses);
router.post('/pages-by-business', authMiddleware, tenantMiddleware, controllers.meta.getPagesByBusiness);
router.post('/adaccounts-by-business', authMiddleware, tenantMiddleware, controllers.meta.getAdAccountsByBusiness);
router.post('/whatsapp-by-pages', authMiddleware, tenantMiddleware, controllers.meta.getWhatsappByPages);
router.post('/save-selection', authMiddleware, tenantMiddleware, controllers.meta.saveSelection);
router.get('/asset-selection', authMiddleware, tenantMiddleware, controllers.meta.getAssetSelection);
router.get('/connections', authMiddleware, tenantMiddleware, controllers.meta.getConnections);
router.patch(
  '/connections/:id/select-account',
  authMiddleware,
  tenantMiddleware,
  controllers.meta.selectAdAccount
);
router.delete('/connections/:id', authMiddleware, tenantMiddleware, controllers.meta.deleteConnection);

export default router;