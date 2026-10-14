import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { controllers } from '../di.js';

// Sem tenantMiddleware: todo usuário logado vê avisos, inclusive superadmin
const router = Router();
router.use(authMiddleware);
router.get('/pending', controllers.announcement.listPending);
router.post('/:id/seen', controllers.announcement.markSeen);
export default router;
