import { Request, Response, NextFunction } from 'express';
import { ObservabilityService } from '../services/observability.service.js';
import { getCachedKPI, setCachedKPI } from '../lib/observability-cache.js';
import { kpiQuerySchema, type KPIQueryParams, type KPIResponse } from '../types/observability.types.js';

export class ObservabilityController {
  private service: ObservabilityService;

  constructor() {
    this.service = new ObservabilityService();
  }

  async getAllKPIs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = req.tenant?.tenantId;
      if (!tenantId) {
        return void res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Tenant context not found',
          },
        });
      }

      const validation = kpiQuerySchema.safeParse(req.query);
      if (!validation.success) {
        const response: KPIResponse = {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error.errors[0].message,
            details: validation.error.errors,
          },
        };
        return void res.status(400).json(response);
      }

      const params: KPIQueryParams = {
        startDate: validation.data.startDate,
        endDate: validation.data.endDate,
        tenantId, // Use tenant from middleware
      };

      // Check cache first
      const cacheKey = {
        type: 'all' as const,
        tenantId,
        startDate: params.startDate,
        endDate: params.endDate,
      };

      let cached = await getCachedKPI(cacheKey);
      let wasCached = false;

      if (cached) {
        wasCached = true;
      } else {
        // Fetch fresh data
        const data = await this.service.getAllKPIs(params);
        cached = data;

        // Cache for 60 seconds
        await setCachedKPI(cacheKey, cached);
      }

      const response: KPIResponse = {
        success: true,
        data: {
          ...cached,
          requestedAt: new Date().toISOString(),
          ...(wasCached && { cachedAt: new Date().toISOString() }),
          ttlSeconds: 60,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}
