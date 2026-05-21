import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import {
  triggerOptimizationHandler,
  getSuggestionsHandler,
  applySuggestionHandler,
  rejectSuggestionHandler,
  getBudgetConfigHandler,
  updateBudgetConfigHandler,
  applyBulkHandler,
  rejectBulkHandler,
} from '../controllers/budget.controller.js';

const router = Router();

// All budget routes require authentication and tenant middleware
router.use(authMiddleware, tenantMiddleware);

/**
 * Budget Optimization Endpoints
 */

// Trigger immediate optimization
router.post('/optimize', triggerOptimizationHandler);

/**
 * Budget Suggestions Endpoints
 */

// Get all suggestions (optionally filtered by status)
// GET /api/budget/suggestions?status=pending
router.get('/suggestions', getSuggestionsHandler);

// Apply a single suggestion
// POST /api/budget/suggestions/:id/apply
router.post('/suggestions/:id/apply', applySuggestionHandler);

// Reject a single suggestion
// POST /api/budget/suggestions/:id/reject
router.post('/suggestions/:id/reject', rejectSuggestionHandler);

// Apply multiple suggestions in bulk
// POST /api/budget/apply-bulk
router.post('/apply-bulk', applyBulkHandler);

// Reject multiple suggestions in bulk
// POST /api/budget/reject-bulk
router.post('/reject-bulk', rejectBulkHandler);

/**
 * Budget Configuration Endpoints
 */

// Get budget config for tenant
// GET /api/budget/config
router.get('/config', getBudgetConfigHandler);

// Update budget config for tenant
// PATCH /api/budget/config
router.patch('/config', updateBudgetConfigHandler);

export default router;
