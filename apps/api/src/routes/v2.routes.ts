import { Router } from 'express';
import type { MetaSyncV2Controller } from '../controllers/meta-sync.controller.js';

/**
 * Rotas v2 — dados Meta direto do banco com fallback stale (T005).
 * Montadas em /api/v2 com authMiddleware + tenantMiddleware (routes/index.ts).
 */
export function createV2Router(controller: MetaSyncV2Controller): Router {
  const router = Router();

  router.get('/campaigns', controller.getCampaigns);
  router.get('/campaigns/:id/leads', controller.getCampaignLeads);
  router.get('/campaigns/:id', controller.getCampaignDetail);
  router.get('/leads', controller.getAllLeads);
  router.get('/lead-campaigns', controller.getLeadCampaigns);
  router.get('/metrics/summary', controller.getMetricsSummary);
  router.get('/metrics/daily', controller.getMetricsDaily);
  router.get('/metrics/goals-progress', controller.getGoalsProgress);
  router.get('/dashboard/instagram-insights', controller.getInstagramInsights);

  return router;
}