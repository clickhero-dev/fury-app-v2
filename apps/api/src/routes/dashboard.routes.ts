import { Router } from 'express';
import { controllers } from '../di.js';
import { cacheMiddleware } from '../middleware/cache.middleware.js';

const router = Router();

router.get(
  '/instagram-insights',
  cacheMiddleware({ ttl: 300 }),
  controllers.dashboard.getInstagramInsightsHandler
);

export default router;
