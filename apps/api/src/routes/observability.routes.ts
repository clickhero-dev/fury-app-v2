import { Router, Request, Response, NextFunction } from 'express';
import { ObservabilityController } from '../controllers/observability.controller.js';

const router = Router();
const controller = new ObservabilityController();

/**
 * TODO: SuperAdmin Authorization Middleware
 *
 * These endpoints are designed for platform-wide observability and require SuperAdmin authorization.
 * Add the following middleware to routes once SuperAdmin role is implemented:
 *
 * ```typescript
 * const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
 *   if (req.user?.role !== 'superadmin') {
 *     return res.status(403).json({
 *       success: false,
 *       error: {
 *         code: 'FORBIDDEN',
 *         message: 'SuperAdmin role required to access platform observability',
 *       },
 *     });
 *   }
 *   next();
 * };
 *
 * router.use(requireSuperAdmin);
 * ```
 *
 * Note: Current implementation requires authMiddleware + JWT validation.
 * SuperAdmin role would be checked in the JWT payload.
 */

/**
 * GET /api/observability/kpis
 * Get all KPIs (business, technical, engagement) grouped by category
 *
 * Query Parameters:
 * - startDate (optional): YYYY-MM-DD format
 * - endDate (optional): YYYY-MM-DD format
 * - tenantId (optional): UUID for tenant-specific metrics (requires SuperAdmin)
 *
 * Response: KPIResponse with all three categories
 *
 * Example:
 * GET /api/observability/kpis?startDate=2026-06-01&endDate=2026-06-30
 */
router.get(
  '/kpis',
  (req: Request, res: Response, next: NextFunction) => controller.getAllKPIs(req, res, next)
);

/**
 * GET /api/observability/kpis/business
 * Get only Business KPIs (MRR, Trial→Paid, Churn, ROAS)
 *
 * Query Parameters:
 * - startDate (optional): YYYY-MM-DD format
 * - endDate (optional): YYYY-MM-DD format
 * - tenantId (optional): UUID for tenant-specific metrics
 *
 * Response: KPIResponse with business category only
 */
router.get(
  '/kpis/business',
  (req: Request, res: Response, next: NextFunction) => controller.getBusinessKPIs(req, res, next)
);

/**
 * GET /api/observability/kpis/technical
 * Get only Technical KPIs (Active Campaigns, Latency, Error Rate, RPS, Slow Endpoints)
 *
 * Query Parameters:
 * - startDate (optional): YYYY-MM-DD format
 * - endDate (optional): YYYY-MM-DD format
 * - tenantId (optional): UUID for tenant-specific metrics
 *
 * Response: KPIResponse with technical category only
 */
router.get(
  '/kpis/technical',
  (req: Request, res: Response, next: NextFunction) => controller.getTechnicalKPIs(req, res, next)
);

/**
 * GET /api/observability/kpis/engagement
 * Get only Engagement KPIs (Active Tenants 24h, Automations, Creatives)
 *
 * Query Parameters:
 * - startDate (optional): YYYY-MM-DD format
 * - endDate (optional): YYYY-MM-DD format
 * - tenantId (optional): UUID for tenant-specific metrics
 *
 * Response: KPIResponse with engagement category only
 */
router.get(
  '/kpis/engagement',
  (req: Request, res: Response, next: NextFunction) => controller.getEngagementKPIs(req, res, next)
);

export default router;
