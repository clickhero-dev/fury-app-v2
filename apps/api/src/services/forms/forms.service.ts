import { db } from '@fury/db';
import { formSubmissions } from '@fury/db/schema';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../../middleware/errorHandler.js';
import type { FormSubmissionStatus } from '../../schemas/forms.schema.js';

export async function startFormSubmission(
  tenantId: string,
  userId: string,
  formType: string
) {
  const submission = await db
    .insert(formSubmissions)
    .values({
      tenantId,
      userId,
      formType,
      status: 'PENDING',
    })
    .returning();

  if (!submission || submission.length === 0) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create form submission');
  }

  return submission[0];
}

export async function completeFormSubmission(formSubmissionId: string, tenantId: string) {
  const existing = await db.query.formSubmissions.findFirst({
    where: and(
      eq(formSubmissions.id, formSubmissionId),
      eq(formSubmissions.tenantId, tenantId)
    ),
  });

  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Form submission not found');
  }

  const updated = await db
    .update(formSubmissions)
    .set({
      status: 'COMPLETED',
      updatedAt: new Date(),
    })
    .where(eq(formSubmissions.id, formSubmissionId))
    .returning();

  if (!updated || updated.length === 0) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to update form submission');
  }

  return updated[0];
}

export async function errorFormSubmission(
  formSubmissionId: string,
  tenantId: string
) {
  const existing = await db.query.formSubmissions.findFirst({
    where: and(
      eq(formSubmissions.id, formSubmissionId),
      eq(formSubmissions.tenantId, tenantId)
    ),
  });

  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Form submission not found');
  }

  const updated = await db
    .update(formSubmissions)
    .set({
      status: 'ERROR',
      updatedAt: new Date(),
    })
    .where(eq(formSubmissions.id, formSubmissionId))
    .returning();

  if (!updated || updated.length === 0) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to update form submission');
  }

  return updated[0];
}

export async function abandonedFormSubmission(
  formSubmissionId: string,
  tenantId: string
) {
  const existing = await db.query.formSubmissions.findFirst({
    where: and(
      eq(formSubmissions.id, formSubmissionId),
      eq(formSubmissions.tenantId, tenantId)
    ),
  });

  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Form submission not found');
  }

  const updated = await db
    .update(formSubmissions)
    .set({
      status: 'ABANDONED',
      abandonedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(formSubmissions.id, formSubmissionId))
    .returning();

  if (!updated || updated.length === 0) {
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to update form submission');
  }

  return updated[0];
}
