import { Router, type Request, type Response, type NextFunction } from 'express';
import { controllers } from '../di.js';

const router = Router();

router.get('/summary', (req: Request, res: Response, next: NextFunction) =>
  controllers.metrics.getSummary(req, res, next)
);

router.get('/campaigns', (req: Request, res: Response, next: NextFunction) =>
  controllers.metrics.getCampaigns(req, res, next)
);

router.get('/campaigns/:campaignId/adsets', (req: Request, res: Response, next: NextFunction) =>
  controllers.metrics.getCampaignAdsets(req, res, next)
);

router.get('/campaigns/:campaignId/insights', (req: Request, res: Response, next: NextFunction) =>
  controllers.metrics.getCampaignInsights(req, res, next)
);

router.get('/daily', (req: Request, res: Response, next: NextFunction) =>
  controllers.metrics.getDailyMetrics(req, res, next)
);

router.get('/goals-progress', (req: Request, res: Response, next: NextFunction) =>
  controllers.metrics.getGoalsProgress(req, res, next)
);

export default router;