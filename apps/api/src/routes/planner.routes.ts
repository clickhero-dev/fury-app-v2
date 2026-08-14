import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import {
  generatePlan,
  getJob,
  getPlan,
  getLatestPlan,
  handleGetPrerequisites,
  handleConfirm,
  handleRevalidate,
  handleEditPost,
  handleGetCalendar,
  handleBulkSchedule,
  handleBulkDelete,
  handleCreatePost,
  handleMovePost,
  handlePublishDue,
<<<<<<< HEAD
=======
  handleUploadMedia,
>>>>>>> origin/hmg
} from '../controllers/planner.controller.js';

const router = Router();

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/quicktime'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Formato inválido. Envie PNG, JPG, WebP, MP4 ou MOV.'));
  },
});

router.use(authMiddleware);

router.post('/generate', tenantMiddleware, generatePlan);
router.get('/jobs/:jobId', tenantMiddleware, getJob);
router.get('/plans/latest', tenantMiddleware, getLatestPlan);
router.get('/plans/:planId', tenantMiddleware, getPlan);
router.get('/prerequisites', tenantMiddleware, handleGetPrerequisites);
router.post('/plans/confirm', tenantMiddleware, handleConfirm);
router.post('/plans/revalidate', tenantMiddleware, handleRevalidate);
router.patch('/posts/:postId', tenantMiddleware, handleEditPost);

// Calendário Editorial
router.get('/calendar', tenantMiddleware, handleGetCalendar);
router.patch('/posts/bulk-schedule', tenantMiddleware, handleBulkSchedule);
router.delete('/posts/bulk', tenantMiddleware, handleBulkDelete);
router.post('/posts', tenantMiddleware, handleCreatePost);
<<<<<<< HEAD
=======
router.post('/posts/upload', tenantMiddleware, mediaUpload.single('file'), handleUploadMedia);
>>>>>>> origin/hmg
router.patch('/posts/:postId/move', tenantMiddleware, handleMovePost);
router.post('/posts/publish-due', tenantMiddleware, handlePublishDue);

// Cron: publish-due sem auth (usa API key)
router.post('/cron/publish-due', handlePublishDue);

export default router;
