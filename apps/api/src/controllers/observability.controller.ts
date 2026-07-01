import { Request, Response, NextFunction } from 'express';
import { ObservabilityService } from '../services/observability.service.js';
import { getCachedKPI, setCachedKPI } from '../lib/observability-cache.js';
import { kpiQuerySchema, type KPIQueryParams, type KPIResponse } from '../types/observability.types.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * TODO: SuperAdmin Authorization
 *
 * Add SuperAdmin check before allowing cross-tenant observability access:
 *
 * if (req.user?.role !== 'superadmin') {
 *   return next(new AppError(403, 'FORBIDDEN', 'SuperAdmin role required'));
 * }
 *
 * This check should be added as middleware once SuperAdmin role is implemented.
 */

export class ObservabilityController {
  private service: ObservabilityService;

  constructor() {
    this.service = new ObservabilityService();
  }

  async getAllKPIs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // TODO: Add SuperAdmin authorization middleware check here

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
        tenantId: validation.data.tenantId, // Can be undefined for platform-wide
      };

      // Check cache first
      const cacheKey = {
        type: 'all' as const,
        tenantId: params.tenantId,
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

  async getBusinessKPIs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // TODO: Add SuperAdmin authorization middleware check here

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

      const params: KPIQueryParams = validation.data;

      // Check cache
      const cacheKey = {
        type: 'business' as const,
        tenantId: params.tenantId,
        startDate: params.startDate,
        endDate: params.endDate,
      };

      let cached = await getCachedKPI(cacheKey);
      let wasCached = false;

      if (cached) {
        wasCached = true;
      } else {
        const data = await this.service.getAllKPIs(params);
        cached = { business: data.business };
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

  async getTechnicalKPIs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // TODO: Add SuperAdmin authorization middleware check here

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

      const params: KPIQueryParams = validation.data;

      // Check cache
      const cacheKey = {
        type: 'technical' as const,
        tenantId: params.tenantId,
        startDate: params.startDate,
        endDate: params.endDate,
      };

      let cached = await getCachedKPI(cacheKey);
      let wasCached = false;

      if (cached) {
        wasCached = true;
      } else {
        const data = await this.service.getAllKPIs(params);
        cached = { technical: data.technical };
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

  async getEngagementKPIs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // TODO: Add SuperAdmin authorization middleware check here

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

      const params: KPIQueryParams = validation.data;

      // Check cache
      const cacheKey = {
        type: 'engagement' as const,
        tenantId: params.tenantId,
        startDate: params.startDate,
        endDate: params.endDate,
      };

      let cached = await getCachedKPI(cacheKey);
      let wasCached = false;

      if (cached) {
        wasCached = true;
      } else {
        const data = await this.service.getAllKPIs(params);
        cached = { engagement: data.engagement };
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
