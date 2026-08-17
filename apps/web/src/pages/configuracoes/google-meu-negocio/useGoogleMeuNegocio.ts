import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  GoogleConnection,
  GoogleLookupResult,
  GoogleAccountsResult,
} from '@/types/google';

export const googleConnectionKey = ['google-connection'] as const;

interface GoogleApiResponse<T> {
  success: boolean;
  data: T;
}

/** Retorna a conexão Google atual do tenant (ou null quando não conectado). */
export function useGoogleConnection() {
  return useQuery<GoogleConnection | null>({
    queryKey: googleConnectionKey,
    queryFn: async () => {
      try {
        const response = await api.get<GoogleApiResponse<GoogleConnection | null>>('/google/connections');
        return response.data.data;
      } catch {
        return null;
      }
    },
    placeholderData: null,
    refetchOnMount: true,
  });
}

/** Busca se já existe perfil no Google para o negócio do tenant. */
export function useGoogleLookup(enabled: boolean) {
  return useQuery<GoogleLookupResult | null>({
    queryKey: ['google-lookup'],
    queryFn: async () => {
      const response = await api.get<GoogleApiResponse<GoogleLookupResult>>('/google/lookup');
      return response.data.data;
    },
    enabled,
    retry: false,
  });
}

/** Lista as contas de negócio GBP e a conta selecionada. */
export function useGoogleAccounts(enabled: boolean) {
  return useQuery<GoogleAccountsResult | null>({
    queryKey: ['google-accounts'],
    queryFn: async () => {
      const response = await api.get<GoogleApiResponse<GoogleAccountsResult>>('/google/accounts');
      return response.data.data;
    },
    enabled,
    retry: false,
  });
}

/** Inicia o fluxo OAuth: busca a URL de autorização e redireciona o navegador. */
export function useGoogleConnect() {
  return useMutation({
    mutationFn: async (context: 'onboarding' | 'settings' = 'settings') => {
      const response = await api.get<GoogleApiResponse<{ authUrl: string }>>('/google/auth/url', {
        params: { context },
      });
      return response.data.data.authUrl;
    },
    onSuccess: (authUrl) => {
      window.location.href = authUrl;
    },
  });
}

/** Desconecta a conta Google (revoga token no servidor e limpa cache). */
export function useGoogleDisconnect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      await api.delete(`/google/connections/${connectionId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: googleConnectionKey });
      void queryClient.invalidateQueries({ queryKey: ['google-lookup'] });
      void queryClient.invalidateQueries({ queryKey: ['google-accounts'] });
    },
  });
}