import { Router, Request, Response, NextFunction } from 'express';
import { MetricsController } from '../controllers/metrics.controller.js';
import { MetricsService } from '../services/metrics.service.js';
import { MockMetricsProvider } from '../lib/providers/mock-metrics.provider.js';
import { DatabaseMetricsProvider } from '../lib/providers/db-metrics.provider.js';

const provider =
  process.env.META_USE_MOCK === 'true' && process.env.NODE_ENV !== 'production'
    ? new MockMetricsProvider()
    : new DatabaseMetricsProvider();

const metricsService = new MetricsService(provider);
const metricsController = new MetricsController(metricsService);

const router = Router();

router.get('/summary', (req: Request, res: Response, next: NextFunction) =>
  metricsController.getSummary(req, res, next)
);

router.get('/campaigns', (req: Request, res: Response, next: NextFunction) =>
  metricsController.getCampaigns(req, res, next)
);

router.get('/campaigns/:campaignId/adsets', (req: Request, res: Response, next: NextFunction) =>
  metricsController.getCampaignAdsets(req, res, next)
);

router.get('/campaigns/:campaignId/insights', (req: Request, res: Response, next: NextFunction) =>
  metricsController.getCampaignInsights(req, res, next)
);

router.get('/daily', (req: Request, res: Response, next: NextFunction) =>
  metricsController.getDailyMetrics(req, res, next)
);

router.get('/goals-progress', (req: Request, res: Response, next: NextFunction) =>
  metricsController.getGoalsProgress(req, res, next)
);

export default router;
