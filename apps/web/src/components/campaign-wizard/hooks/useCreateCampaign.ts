import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type { CreateWizardCampaignPayload, CreateWizardCampaignResult } from '../types';

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateWizardCampaignPayload) => {
      const response = await api.post<CreateWizardCampaignResult>('/campaigns/create-wizard', payload);
      return response.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useUploadCreative() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post<{ success: true; data: { url: string } }>(
        '/campaigns/upload-creative',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return response.data.data.url;
    },
  });
}
