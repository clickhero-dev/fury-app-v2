import { AppError } from '../../middleware/errorHandler.js';
import { FormsRepository } from '../../repository/forms.repository.js';
import type { FormSubmissionStatus } from '../../schemas/forms.schema.js';

export async function startFormSubmission(
  tenantId: string,
  userId: string,
  formType: string
) {
  const submission = await new FormsRepository(tenantId).createFormSubmission({
    userId,
    formType,
    status: 'PENDING' as FormSubmissionStatus,
  });

  if (!submission) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create form submission');
  }

  return submission;
}

async function findAndPatch(
  formSubmissionId: string,
  tenantId: string,
  patch: Parameters<FormsRepository['patchFormSubmission']>[1],
) {
  const repo = new FormsRepository(tenantId);
  const existing = await repo.findFormSubmission(formSubmissionId);

  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Form submission not found');
  }

  const updated = await repo.patchFormSubmission(formSubmissionId, patch);

  if (!updated) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to update form submission');
  }

  return updated;
}

export async function completeFormSubmission(formSubmissionId: string, tenantId: string) {
  return findAndPatch(formSubmissionId, tenantId, {
    status: 'COMPLETED',
    updatedAt: new Date(),
  });
}

export async function errorFormSubmission(
  formSubmissionId: string,
  tenantId: string
) {
  return findAndPatch(formSubmissionId, tenantId, {
    status: 'ERROR',
    updatedAt: new Date(),
  });
}

export async function abandonedFormSubmission(
  formSubmissionId: string,
  tenantId: string
) {
  return findAndPatch(formSubmissionId, tenantId, {
    status: 'ABANDONED',
    abandonedAt: new Date(),
    updatedAt: new Date(),
  });
}