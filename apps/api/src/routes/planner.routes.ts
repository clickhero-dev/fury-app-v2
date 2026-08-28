import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { controllers } from '../di.js';

const planner = controllers.planner;

const router: Router = Router();

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

router.post('/generate', tenantMiddleware, planner.generatePlan);
router.get('/jobs/:jobId', tenantMiddleware, planner.getJob);
router.get('/plans/latest', tenantMiddleware, planner.getLatestPlan);
router.get('/plans/:planId', tenantMiddleware, planner.getPlan);
router.get('/prerequisites', tenantMiddleware, planner.handleGetPrerequisites);
router.post('/plans/confirm', tenantMiddleware, planner.handleConfirm);
router.post('/plans/revalidate', tenantMiddleware, planner.handleRevalidate);
router.patch('/posts/:postId', tenantMiddleware, planner.handleEditPost);

// Calendário Editorial
router.get('/calendar', tenantMiddleware, planner.handleGetCalendar);
router.patch('/posts/bulk-schedule', tenantMiddleware, planner.handleBulkSchedule);
router.delete('/posts/bulk', tenantMiddleware, planner.handleBulkDelete);
router.post('/posts', tenantMiddleware, planner.handleCreatePost);
router.post('/posts/upload', tenantMiddleware, mediaUpload.single('file'), planner.handleUploadMedia);
router.patch('/posts/:postId/move', tenantMiddleware, planner.handleMovePost);
router.post('/posts/publish-due', tenantMiddleware, planner.handlePublishDue);

// Cron: publish-due sem auth (usa API key)
router.post('/cron/publish-due', planner.handlePublishDue);

// Agent labels (public endpoint para o frontend consumir)
router.get('/agent-labels', planner.handleGetAgentLabels);

export default router;