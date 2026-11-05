import type { Request, Response, NextFunction } from 'express';
import { createFormSubmissionSchema, updateFormSubmissionStatusSchema } from '../schemas/forms.schema.js';
import { FormsService } from '../services/forms/forms.service.js';
import { AppError } from '../middleware/errorHandler.js';

export class FormsController {
  constructor(private service: FormsService) {}

  start = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = createFormSubmissionSchema.parse(req.body);
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      // tenant e usuário vêm do token, nunca do corpo
      const submission = await this.service.startFormSubmission(tenantId, req.user!.userId, data.formType);
      res.status(201).json({ success: true, data: submission });
    } catch (error) { next(error); }
  };

  complete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = updateFormSubmissionStatusSchema.parse(req.body);
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      const submission = await this.service.completeFormSubmission(data.formSubmissionId, tenantId);
      res.status(200).json({ success: true, data: submission });
    } catch (error) { next(error); }
  };

  error = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = updateFormSubmissionStatusSchema.parse(req.body);
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      const submission = await this.service.errorFormSubmission(data.formSubmissionId, tenantId);
      res.status(200).json({ success: true, data: submission });
    } catch (error) { next(error); }
  };

  abandoned = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = updateFormSubmissionStatusSchema.parse(req.body);
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      const submission = await this.service.abandonedFormSubmission(data.formSubmissionId, tenantId);
      res.status(200).json({ success: true, data: submission });
    } catch (error) { next(error); }
  };
}