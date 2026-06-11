import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface MetaPageOption {
  pageId: string;
  name: string;
  hasWhatsApp: boolean;
}

export interface MetaWhatsappNumberOption {
  phoneNumberId: string;
  displayPhoneNumber: string;
  verifiedName: string;
}

interface MetaPagesResponse {
  success: true;
  data: MetaPageOption[];
}

interface MetaWhatsappNumbersResponse {
  success: true;
  data: MetaWhatsappNumberOption[];
}

export function useMetaPages(enabled: boolean) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['meta/pages'],
    queryFn: async () => {
      const response = await api.get<MetaPagesResponse>('/meta/pages');
      return response.data.data;
    },
    enabled,
  });

  return {
    pages: data ?? [],
    isLoading: enabled && isLoading,
    isError,
  };
}

export function useMetaPageWhatsappNumbers(pageId?: string) {
  const enabled = Boolean(pageId);

  const { data, isLoading, isError, isSuccess } = useQuery({
    queryKey: ['meta/pages/whatsapp-numbers', pageId],
    queryFn: async () => {
      const response = await api.get<MetaWhatsappNumbersResponse>(
        `/meta/pages/${pageId}/whatsapp-numbers`
      );
      return response.data.data;
    },
    enabled,
  });

  return {
    numbers: data ?? [],
    isLoading: enabled && isLoading,
    isError,
    isLoaded: enabled && isSuccess,
  };
}
