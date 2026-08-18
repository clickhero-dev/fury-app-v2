import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  GoogleBusinessSettings,
  GoogleBusinessSettingsInput,
  GoogleCategory,
} from '@/types/google';

interface GoogleApiResponse<T> {
  success: boolean;
  data: T;
}

/** Carrega os dados do negócio (GET /google/settings), pré-preenchidos do tenant. */
export function useGoogleSettings() {
  return useQuery<GoogleBusinessSettings | null>({
    queryKey: ['google-settings'],
    queryFn: async () => {
      const response = await api.get<GoogleApiResponse<GoogleBusinessSettings | null>>(
        '/google/settings'
      );
      return response.data.data;
    },
    placeholderData: null,
    retry: false,
  });
}

/** Salva os dados do negócio (PUT /google/settings) e invalida o cache. */
export function useGoogleUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: GoogleBusinessSettingsInput) => {
      const response = await api.put<GoogleApiResponse<GoogleBusinessSettings>>('/google/settings', data);
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['google-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['google-lookup'] });
    },
  });
}

/** Autocomplete de categorias (GET /google/categories?query=). Debounce no chamador. */
export function useGoogleCategories(query: string, enabled: boolean) {
  return useQuery<GoogleCategory[]>({
    queryKey: ['google-categories', query],
    queryFn: async () => {
      const response = await api.get<GoogleApiResponse<{ categories: GoogleCategory[] }>>(
        '/google/categories',
        { params: { query } }
      );
      return response.data.data.categories ?? [];
    },
    enabled: enabled && query.trim().length > 0,
    staleTime: 60_000,
    retry: false,
  });
}