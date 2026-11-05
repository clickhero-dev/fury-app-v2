import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { superadminMiddleware } from '../middleware/superadmin.middleware.js';
import { controllers } from '../di.js';

const router = Router();

// KPIs da plataforma inteira: só super_admin
router.use(authMiddleware, tenantMiddleware, superadminMiddleware);

router.get('/kpis', controllers.observability.getKpis);
router.get('/kpis/list', controllers.observability.listKpis);

export default router;