import { Router } from 'express';
import * as googleController from '../controllers/google.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const router = Router();

router.get('/auth/url', authMiddleware, googleController.getAuthUrl);
router.get('/auth/callback', googleController.authCallback);
router.get('/connections', authMiddleware, tenantMiddleware, googleController.getConnection);
router.delete('/connections/:id', authMiddleware, tenantMiddleware, googleController.disconnectConnection);
router.get('/accounts', authMiddleware, tenantMiddleware, googleController.getAccounts);
router.get('/lookup', authMiddleware, tenantMiddleware, googleController.lookup);
router.get('/categories', authMiddleware, tenantMiddleware, googleController.getCategories);
router.get('/settings', authMiddleware, tenantMiddleware, googleController.getSettings);
router.put('/settings', authMiddleware, tenantMiddleware, googleController.updateSettings);

export default router;