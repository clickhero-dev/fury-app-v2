import { Router, Request, Response, NextFunction } from 'express';
import { ObservabilityController } from '../controllers/observability.controller.js';

const router = Router();
const controller = new ObservabilityController();

/**
 * GET /api/metrics/kpis
 * Get all KPIs grouped by category (business, technical, engagement)
 *
 * Query Parameters:
 * - startDate (optional): YYYY-MM-DD format
 * - endDate (optional): YYYY-MM-DD format
 *
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "business": { mrr, trialToPaid, churn, roas },
 *     "technical": { activeCampaigns, latency, errorRate, rps, slowEndpoints },
 *     "engagement": { activeTenants24h, automations, creatives },
 *     "requestedAt": "2026-07-01T12:00:00Z",
 *     "ttlSeconds": 60
 *   }
 * }
 */
router.get(
  '/kpis',
  (req: Request, res: Response, next: NextFunction) => controller.getAllKPIs(req, res, next)
);

export default router;
