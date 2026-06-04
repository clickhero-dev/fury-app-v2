import { Request, Response, NextFunction } from 'express';
import { MetricsService } from '../services/metrics.service.js';
import {
  metricsQuerySchema,
  campaignsQuerySchema,
  dailyQuerySchema,
} from '../types/metrics.types.js';

export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = metricsQuerySchema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error.errors[0].message,
            details: validation.error.errors,
          },
        });
      }

      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tenant context' },
        });
      }

      let summary = null;
      try {
        summary = await this.metricsService.getSummary(
          tenantId,
          validation.data.startDate,
          validation.data.endDate
        );
      } catch {
        // META_NOT_CONNECTED or provider error — return empty summary
      }

      return res.status(200).json({
        success: true,
        data: { summary: summary ?? {} },
      });
    } catch (error) {
      next(error);
    }
  }

  async getCampaigns(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = campaignsQuerySchema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error.errors[0].message,
            details: validation.error.errors,
          },
        });
      }

      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tenant context' },
        });
      }

      let result = { data: [] as import('../types/metrics.types.js').CampaignResponse[], pagination: { page: 1, limit: 10, total: 0 } };
      try {
        result = await this.metricsService.getCampaigns(
          tenantId,
          validation.data.startDate,
          validation.data.endDate,
          validation.data.status,
          validation.data.page,
          validation.data.limit
        );
      } catch {
        // META_NOT_CONNECTED or provider error — return empty list
      }

      return res.status(200).json({
        success: true,
        data: {
          campaigns: result.data,
          pagination: result.pagination,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getCampaignAdsets(req: Request, res: Response, next: NextFunction) {
    try {
      const { campaignId } = req.params;

      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tenant context' },
        });
      }

      const adsets = await this.metricsService.getCampaignAdsets(tenantId, campaignId);

      return res.status(200).json({
        success: true,
        data: adsets,
      });
    } catch (error) {
      next(error);
    }
  }

  async getCampaignInsights(req: Request, res: Response, next: NextFunction) {
    try {
      const { campaignId } = req.params;
      const validation = metricsQuerySchema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error.errors[0].message,
            details: validation.error.errors,
          },
        });
      }

      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tenant context' },
        });
      }

      const insights = await this.metricsService.getCampaignInsights(
        tenantId,
        campaignId,
        validation.data.startDate,
        validation.data.endDate
      );

      return res.status(200).json({
        success: true,
        data: insights,
      });
    } catch (error) {
      next(error);
    }
  }

  async getDailyMetrics(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = dailyQuerySchema.safeParse(req.query);
      if (!validation.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error.errors[0].message,
            details: validation.error.errors,
          },
        });
      }

      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tenant context' },
        });
      }

      let daily = null;
      try {
        daily = await this.metricsService.getDailyMetrics(
          tenantId,
          validation.data.startDate,
          validation.data.endDate
        );
      } catch {
        // META_NOT_CONNECTED or provider error — return empty list
      }

      return res.status(200).json({
        success: true,
        data: daily ?? [],
      });
    } catch (error) {
      next(error);
    }
  }

  async getGoalsProgress(req: Request, res: Response, next: NextFunction) {
    try {
      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'No tenant context' },
        });
      }

      const progress = await this.metricsService.getGoalsProgress(tenantId);

      return res.status(200).json({
        success: true,
        data: progress,
      });
    } catch (error) {
      next(error);
    }
  }
}
