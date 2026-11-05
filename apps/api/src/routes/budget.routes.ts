import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { tenantMiddleware } from '../middleware/tenant.middleware.js';
import { controllers } from '../di.js';

const budget = controllers.budget;

const router = Router();

// All budget routes require authentication and tenant middleware
router.use(authMiddleware, tenantMiddleware);

/**
 * Budget Optimization Endpoints
 */

// Trigger immediate optimization
router.post('/optimize', budget.triggerOptimization);

/**
 * Budget Suggestions Endpoints
 */

// Get all suggestions (optionally filtered by status)
// GET /api/budget/suggestions?status=pending
router.get('/suggestions', budget.getSuggestions);

// Apply a single suggestion
// POST /api/budget/suggestions/:id/apply
router.post('/suggestions/:id/apply', budget.applySuggestion);

// Reject a single suggestion
// POST /api/budget/suggestions/:id/reject
router.post('/suggestions/:id/reject', budget.rejectSuggestion);

// Apply multiple suggestions in bulk
// POST /api/budget/apply-bulk
router.post('/apply-bulk', budget.applyBulk);

// Reject multiple suggestions in bulk
// POST /api/budget/reject-bulk
router.post('/reject-bulk', budget.rejectBulk);

/**
 * Budget Configuration Endpoints
 */

// Get budget config for tenant
// GET /api/budget/config
router.get('/config', budget.getConfig);

// Update budget config for tenant
// PATCH /api/budget/config
router.patch('/config', budget.updateConfig);

export default router;