import { Router, type Request, type Response, type NextFunction } from 'express';
import { controllers } from '../di.js';
import { cacheMiddleware } from '../middleware/cache.middleware.js';

const router = Router();

const CACHE_METRICS = { ttl: 300 };

router.get('/summary', cacheMiddleware(CACHE_METRICS), (req: Request, res: Response, next: NextFunction) =>
  controllers.metrics.getSummary(req, res, next)
);

router.get('/campaigns', cacheMiddleware(CACHE_METRICS), (req: Request, res: Response, next: NextFunction) =>
  controllers.metrics.getCampaigns(req, res, next)
);

router.get('/campaigns/:campaignId/adsets', cacheMiddleware(CACHE_METRICS), (req: Request, res: Response, next: NextFunction) =>
  controllers.metrics.getCampaignAdsets(req, res, next)
);

router.get('/campaigns/:campaignId/insights', cacheMiddleware(CACHE_METRICS), (req: Request, res: Response, next: NextFunction) =>
  controllers.metrics.getCampaignInsights(req, res, next)
);

router.get('/daily', cacheMiddleware(CACHE_METRICS), (req: Request, res: Response, next: NextFunction) =>
  controllers.metrics.getDailyMetrics(req, res, next)
);

router.get('/goals-progress', cacheMiddleware(CACHE_METRICS), (req: Request, res: Response, next: NextFunction) =>
  controllers.metrics.getGoalsProgress(req, res, next)
);

export default router;