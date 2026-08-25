/// <reference path="../types/express.d.ts" />
import { Request, Response, NextFunction } from 'express';
import {
  createFormSubmissionSchema,
  updateFormSubmissionStatusSchema,
} from '../schemas/forms.schema.js';
import {
  startFormSubmission,
  completeFormSubmission,
  errorFormSubmission,
  abandonedFormSubmission,
} from '../services/forms/forms.service.js';
import { AppError } from '../middleware/errorHandler.js';

export async function startFormHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createFormSubmissionSchema.parse(req.body);
    const tenantId = req.tenant?.tenantId || '';

    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    const submission = await startFormSubmission(data.tenantId, data.userId, data.formType);

    res.status(201).json({
      success: true,
      data: submission,
    });
  } catch (error) {
    next(error);
  }
}

export async function completeFormHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateFormSubmissionStatusSchema.parse(req.body);
    const tenantId = req.tenant?.tenantId || '';

    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    const submission = await completeFormSubmission(data.formSubmissionId, tenantId);

    res.status(200).json({
      success: true,
      data: submission,
    });
  } catch (error) {
    next(error);
  }
}

export async function errorFormHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateFormSubmissionStatusSchema.parse(req.body);
    const tenantId = req.tenant?.tenantId || '';

    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    const submission = await errorFormSubmission(data.formSubmissionId, tenantId);

    res.status(200).json({
      success: true,
      data: submission,
    });
  } catch (error) {
    next(error);
  }
}

export async function abandonedFormHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateFormSubmissionStatusSchema.parse(req.body);
    const tenantId = req.tenant?.tenantId || '';

    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    const submission = await abandonedFormSubmission(data.formSubmissionId, tenantId);

    res.status(200).json({
      success: true,
      data: submission,
    });
  } catch (error) {
    next(error);
  }
}
