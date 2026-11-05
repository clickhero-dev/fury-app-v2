import { Router } from 'express';
import multer from 'multer';
import { controllers } from '../di.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens sao permitidas.'));
    }
  },
});

const router = Router();

router.get('/auth/url', authMiddleware, controllers.google.getAuthUrl);
router.get('/auth/callback', controllers.google.authCallback);
router.get('/connections', authMiddleware, tenantMiddleware, controllers.google.getConnection);
router.delete('/connections/:id', authMiddleware, tenantMiddleware, controllers.google.disconnectConnection);
router.get('/accounts', authMiddleware, tenantMiddleware, controllers.google.getAccounts);
router.get('/lookup', authMiddleware, tenantMiddleware, controllers.google.lookup);
router.get('/categories', authMiddleware, tenantMiddleware, controllers.google.getCategories);
router.get('/settings', authMiddleware, tenantMiddleware, controllers.google.getSettings);
router.put('/settings', authMiddleware, tenantMiddleware, controllers.google.updateSettings);
router.post('/profiles', authMiddleware, tenantMiddleware, controllers.google.createProfile);
router.get('/profiles/:id/verification', authMiddleware, tenantMiddleware, controllers.google.getVerification);
router.post(
  '/profiles/:id/verification/complete',
  authMiddleware,
  tenantMiddleware,
  controllers.google.completeVerification
);
router.get('/profiles/:id', authMiddleware, tenantMiddleware, controllers.google.getProfile);
router.get('/profiles/:id/quality', authMiddleware, tenantMiddleware, controllers.google.getProfileQuality);
router.patch('/profiles/:id', authMiddleware, tenantMiddleware, controllers.google.updateProfile);
router.post('/profiles/:id/sync', authMiddleware, tenantMiddleware, controllers.google.syncProfile);
router.get('/profiles/:id/sync-logs', authMiddleware, tenantMiddleware, controllers.google.getSyncLogs);
router.post(
  '/profiles/:id/photos',
  authMiddleware,
  tenantMiddleware,
  photoUpload.single('photo'),
  controllers.google.uploadPhoto
);
router.delete('/profiles/:id/photos', authMiddleware, tenantMiddleware, controllers.google.deletePhoto);

export default router;