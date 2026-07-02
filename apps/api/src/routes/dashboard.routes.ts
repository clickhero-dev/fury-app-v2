import { Router } from 'express';
import { getInstagramInsightsHandler } from '../controllers/dashboard.controller.js';
import { cacheMiddleware } from '../middleware/cache.middleware.js';

const router = Router();

router.get('/instagram-insights', cacheMiddleware({ ttl: 360 }), getInstagramInsightsHandler);

export default router;
