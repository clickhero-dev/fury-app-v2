import { AppError } from '../../middleware/errorHandler.js';
import { FormsRepository } from '../../repository/forms.repository.js';
import type { FormSubmissionStatus } from '../../schemas/forms.schema.js';

export class FormsService {
  constructor(
    private repoFactory: (tenantId: string) => FormsRepository = (t) => new FormsRepository(t),
  ) {}

  private repo(tenantId: string): FormsRepository {
    return this.repoFactory(tenantId);
  }

  async startFormSubmission(tenantId: string, userId: string, formType: string) {
    const submission = await this.repo(tenantId).createFormSubmission({
      userId,
      formType,
      status: 'PENDING' as FormSubmissionStatus,
    });
    if (!submission) throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create form submission');
    return submission;
  }

  private async findAndPatch(
    formSubmissionId: string,
    tenantId: string,
    patch: Parameters<FormsRepository['patchFormSubmission']>[1],
  ) {
    const repo = this.repo(tenantId);
    const existing = await repo.findFormSubmission(formSubmissionId);
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Form submission not found');
    const updated = await repo.patchFormSubmission(formSubmissionId, patch);
    if (!updated) throw new AppError(500, 'INTERNAL_ERROR', 'Failed to update form submission');
    return updated;
  }

  async completeFormSubmission(formSubmissionId: string, tenantId: string) {
    return this.findAndPatch(formSubmissionId, tenantId, { status: 'COMPLETED', updatedAt: new Date() });
  }

  async errorFormSubmission(formSubmissionId: string, tenantId: string) {
    return this.findAndPatch(formSubmissionId, tenantId, { status: 'ERROR', updatedAt: new Date() });
  }

  async abandonedFormSubmission(formSubmissionId: string, tenantId: string) {
    return this.findAndPatch(formSubmissionId, tenantId, { status: 'ABANDONED', abandonedAt: new Date(), updatedAt: new Date() });
  }
}