import { Router } from 'express';
import multer from 'multer';
import * as googleController from '../controllers/google.controller.js';
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

router.get('/auth/url', authMiddleware, googleController.getAuthUrl);
router.get('/auth/callback', googleController.authCallback);
router.get('/connections', authMiddleware, tenantMiddleware, googleController.getConnection);
router.delete('/connections/:id', authMiddleware, tenantMiddleware, googleController.disconnectConnection);
router.get('/accounts', authMiddleware, tenantMiddleware, googleController.getAccounts);
router.get('/lookup', authMiddleware, tenantMiddleware, googleController.lookup);
router.get('/categories', authMiddleware, tenantMiddleware, googleController.getCategories);
router.get('/settings', authMiddleware, tenantMiddleware, googleController.getSettings);
router.put('/settings', authMiddleware, tenantMiddleware, googleController.updateSettings);
router.post('/profiles', authMiddleware, tenantMiddleware, googleController.createProfile);
router.get('/profiles/:id/verification', authMiddleware, tenantMiddleware, googleController.getVerification);
router.post(
  '/profiles/:id/verification/complete',
  authMiddleware,
  tenantMiddleware,
  googleController.completeVerification
);
router.get('/profiles/:id', authMiddleware, tenantMiddleware, googleController.getProfile);
router.patch('/profiles/:id', authMiddleware, tenantMiddleware, googleController.updateProfile);
router.post('/profiles/:id/sync', authMiddleware, tenantMiddleware, googleController.syncProfile);
router.get('/profiles/:id/sync-logs', authMiddleware, tenantMiddleware, googleController.getSyncLogs);
router.post(
  '/profiles/:id/photos',
  authMiddleware,
  tenantMiddleware,
  photoUpload.single('photo'),
  googleController.uploadPhoto
);
router.delete('/profiles/:id/photos', authMiddleware, tenantMiddleware, googleController.deletePhoto);

export default router;