import api from './api';

export interface FormSubmission {
  id: string;
  tenantId: string;
  userId: string;
  formType: string;
  status: 'PENDING' | 'COMPLETED' | 'ERROR' | 'ABANDONED';
  abandonedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function startForm(
  tenantId: string,
  userId: string,
  formType: string
): Promise<FormSubmission> {
  const response = await api.post('/forms/start', {
    tenantId,
    userId,
    formType,
  });

  if (!response.data.success) {
    throw new Error('Failed to start form submission');
  }

  return response.data.data;
}

export async function completeForm(formSubmissionId: string): Promise<FormSubmission> {
  const response = await api.post('/forms/complete', {
    formSubmissionId,
    status: 'COMPLETED',
  });

  if (!response.data.success) {
    throw new Error('Failed to complete form submission');
  }

  return response.data.data;
}

export async function errorForm(formSubmissionId: string): Promise<FormSubmission> {
  const response = await api.post('/forms/error', {
    formSubmissionId,
    status: 'ERROR',
  });

  if (!response.data.success) {
    throw new Error('Failed to mark form as error');
  }

  return response.data.data;
}

export async function abandonedForm(formSubmissionId: string): Promise<FormSubmission> {
  const response = await api.post('/forms/abandoned', {
    formSubmissionId,
    status: 'ABANDONED',
  });

  if (!response.data.success) {
    throw new Error('Failed to mark form as abandoned');
  }

  return response.data.data;
}
