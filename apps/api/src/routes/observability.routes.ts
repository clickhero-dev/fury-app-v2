import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { controllers } from '../di.js';

const router = Router();

router.use(authMiddleware, tenantMiddleware);

router.get('/kpis', controllers.observability.getKpis);
router.get('/kpis/list', controllers.observability.listKpis);

export default router;