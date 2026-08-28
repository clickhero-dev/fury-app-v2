import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { SubscriptionRepository } from '../repository/subscription.repository.js';
import { BudgetOptimizerService } from '../services/campaigns/budget-optimizer.service.js';

/** Controller de budget — glue HTTP fino. Recebe o service no construtor (injeção). */
export class BudgetController {
  constructor(private budgetOptimizer: BudgetOptimizerService) {}

  /**
   * POST /api/budget/optimize
   * Trigger immediate budget optimization
   */
  triggerOptimization = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const { totalBudget } = z
        .object({
          totalBudget: z.number().positive('Total budget must be positive'),
        })
        .parse(req.body);

      const config = this.budgetOptimizer.getBudgetConfig(tenantId);
      const suggestions = await this.budgetOptimizer.optimizeBudget(tenantId, totalBudget);

      if (suggestions.length === 0) {
        throw new AppError(
          404,
          'NO_CAMPAIGNS',
          'No campaigns found for optimization',
        );
      }

      const stored = await this.budgetOptimizer.saveSuggestions(
        tenantId,
        suggestions,
        config.mode || 'suggestion',
      );

      // Persist to database
      const dbRecord = await new SubscriptionRepository(tenantId).createBudgetOptimization({
        tenantId,
        totalBudget: totalBudget.toString(),
        adjustments: suggestions as any,
        mode: config.mode || 'suggestion',
        status: config.mode === 'auto' ? 'applied' : 'pending',
        appliedAt: config.mode === 'auto' ? new Date() : undefined,
      });

      res.status(201).json({
        success: true,
        data: {
          optimizationId: dbRecord?.id,
          totalBudget,
          mode: config.mode,
          suggestionsCount: stored.length,
          suggestions: stored.map((s) => ({
            id: s.id,
            campaignId: s.campaignId,
            campaignName: s.campaignName,
            currentBudget: s.currentBudget,
            suggestedBudget: s.suggestedBudget,
            change_pct: s.change_pct,
            reason: s.reason,
            status: s.status,
          })),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/budget/suggestions
   * Retrieve budget suggestions for tenant
   */
  getSuggestions = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const { status } = z
        .object({
          status: z.enum(['pending', 'applied', 'rejected']).optional(),
        })
        .parse(req.query);

      const suggestions = this.budgetOptimizer.getSuggestions(tenantId, status);

      res.json({
        success: true,
        data: {
          count: suggestions.length,
          suggestions: suggestions.map((s) => ({
            id: s.id,
            campaignId: s.campaignId,
            campaignName: s.campaignName,
            currentBudget: s.currentBudget,
            suggestedBudget: s.suggestedBudget,
            change_pct: s.change_pct,
            reason: s.reason,
            status: s.status,
            createdAt: s.createdAt,
            appliedAt: s.appliedAt,
            rejectedAt: s.rejectedAt,
          })),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/budget/suggestions/:id/apply
   * Apply a specific budget suggestion
   */
  applySuggestion = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const { id } = req.params;
      if (!id) {
        throw new AppError(
          400,
          'MISSING_SUGGESTION_ID',
          'Suggestion ID is required',
        );
      }

      const applied = await this.budgetOptimizer.applySuggestions(tenantId, [id]);

      if (applied.length === 0) {
        throw new AppError(
          400,
          'APPLY_FAILED',
          'Failed to apply suggestion (may not exist or already applied)',
        );
      }

      const suggestion = applied[0];

      res.json({
        success: true,
        data: {
          id: suggestion.id,
          campaignId: suggestion.campaignId,
          campaignName: suggestion.campaignName,
          currentBudget: suggestion.currentBudget,
          suggestedBudget: suggestion.suggestedBudget,
          change_pct: suggestion.change_pct,
          reason: suggestion.reason,
          status: suggestion.status,
          appliedAt: suggestion.appliedAt,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/budget/suggestions/:id/reject
   * Reject a specific budget suggestion
   */
  rejectSuggestion = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const { id } = req.params;
      if (!id) {
        throw new AppError(
          400,
          'MISSING_SUGGESTION_ID',
          'Suggestion ID is required',
        );
      }

      const rejected = this.budgetOptimizer.rejectSuggestions(tenantId, [id]);

      if (rejected.length === 0) {
        throw new AppError(
          400,
          'REJECT_FAILED',
          'Failed to reject suggestion (may not exist or already rejected)',
        );
      }

      const suggestion = rejected[0];

      res.json({
        success: true,
        data: {
          id: suggestion.id,
          campaignId: suggestion.campaignId,
          campaignName: suggestion.campaignName,
          currentBudget: suggestion.currentBudget,
          suggestedBudget: suggestion.suggestedBudget,
          change_pct: suggestion.change_pct,
          reason: suggestion.reason,
          status: suggestion.status,
          rejectedAt: suggestion.rejectedAt,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/budget/config
   * Get budget configuration for tenant
   */
  getConfig = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const config = this.budgetOptimizer.getBudgetConfig(tenantId);

      res.json({
        success: true,
        data: {
          tenantId: config.tenantId,
          mode: config.mode,
          totalBudget: config.totalBudget,
          autoApplyEnabled: config.autoApplyEnabled,
          lastOptimizedAt: config.lastOptimizedAt,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * PATCH /api/budget/config
   * Update budget configuration for tenant
   */
  updateConfig = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const updateData = z
        .object({
          mode: z.enum(['suggestion', 'auto']).optional(),
          totalBudget: z.number().positive().optional(),
          autoApplyEnabled: z.boolean().optional(),
        })
        .parse(req.body);

      if (Object.keys(updateData).length === 0) {
        throw new AppError(400, 'EMPTY_UPDATE', 'At least one field must be provided');
      }

      const updated = this.budgetOptimizer.updateBudgetConfig(tenantId, updateData);

      res.json({
        success: true,
        data: {
          tenantId: updated.tenantId,
          mode: updated.mode,
          totalBudget: updated.totalBudget,
          autoApplyEnabled: updated.autoApplyEnabled,
          lastOptimizedAt: updated.lastOptimizedAt,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/budget/apply-bulk
   * Apply multiple suggestions at once
   */
  applyBulk = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const { suggestionIds } = z
        .object({
          suggestionIds: z.array(z.string()).min(1, 'At least one suggestion ID required'),
        })
        .parse(req.body);

      const applied = await this.budgetOptimizer.applySuggestions(tenantId, suggestionIds);

      res.json({
        success: true,
        data: {
          appliedCount: applied.length,
          appliedIds: applied.map((s) => s.id),
          suggestions: applied.map((s) => ({
            id: s.id,
            campaignId: s.campaignId,
            suggestedBudget: s.suggestedBudget,
            status: s.status,
            appliedAt: s.appliedAt,
          })),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/budget/reject-bulk
   * Reject multiple suggestions at once
   */
  rejectBulk = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const { suggestionIds } = z
        .object({
          suggestionIds: z.array(z.string()).min(1, 'At least one suggestion ID required'),
        })
        .parse(req.body);

      const rejected = this.budgetOptimizer.rejectSuggestions(tenantId, suggestionIds);

      res.json({
        success: true,
        data: {
          rejectedCount: rejected.length,
          rejectedIds: rejected.map((s) => s.id),
          suggestions: rejected.map((s) => ({
            id: s.id,
            campaignId: s.campaignId,
            suggestedBudget: s.suggestedBudget,
            status: s.status,
            rejectedAt: s.rejectedAt,
          })),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}