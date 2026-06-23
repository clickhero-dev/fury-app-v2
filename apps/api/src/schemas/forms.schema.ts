import { z } from 'zod';

export const formSubmissionStatusEnum = z.enum(['PENDING', 'COMPLETED', 'ERROR', 'ABANDONED']);

export const createFormSubmissionSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  formType: z.string().min(1, 'Form type is required'),
});

export const updateFormSubmissionStatusSchema = z.object({
  formSubmissionId: z.string().uuid(),
  status: formSubmissionStatusEnum,
});

export const formSubmissionResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  formType: z.string(),
  status: formSubmissionStatusEnum,
  abandonedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type FormSubmissionStatus = z.infer<typeof formSubmissionStatusEnum>;
export type CreateFormSubmissionRequest = z.infer<typeof createFormSubmissionSchema>;
export type UpdateFormSubmissionStatusRequest = z.infer<typeof updateFormSubmissionStatusSchema>;
export type FormSubmissionResponse = z.infer<typeof formSubmissionResponseSchema>;
