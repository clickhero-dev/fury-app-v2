import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { controllers } from '../di.js';
import { cacheMiddleware } from '../middleware/cache.middleware.js';

const router = Router();
router.use(authMiddleware, tenantMiddleware);

// GET  /goals            → metas
// POST /goals/setup      → upsert metas
// PUT  /goals            → atualiza metas
// GET  /goals/progress   → projeção de metas (negócio em GoalService)
router.get('/', controllers.goal.get);
router.post('/setup', controllers.goal.setup);
router.put('/', controllers.goal.update);
router.get('/progress', cacheMiddleware({ ttl: 300 }), controllers.goal.getProgress);

export default router;