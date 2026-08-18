import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import type {
  GoogleConnection,
  GoogleLookupResult,
  GoogleAccountsResult,
  GoogleCreateProfileResult,
  GoogleVerificationResult,
  GoogleCompleteVerificationInput,
  GoogleCompleteVerificationResult,
  GoogleBusinessProfile,
  GoogleSyncLogsResult,
  GooglePhotoUploadResult,
} from '@/types/google';

export const googleConnectionKey = ['google-connection'] as const;
export const googleVerificationKey = (profileId: string | null) =>
  ['google-verification', profileId] as const;
export const googleProfileKey = (profileId: string | null) =>
  ['google-profile', profileId] as const;
export const googleSyncLogsKey = (profileId: string | null) =>
  ['google-sync-logs', profileId] as const;

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

/** Cria um novo perfil na GBP a partir dos dados do negócio (POST /profiles). */
export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<GoogleCreateProfileResult> => {
      const response = await api.post<GoogleApiResponse<GoogleCreateProfileResult>>('/google/profiles');
      return response.data.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['google-accounts'] });
    },
  });
}

/** Busca o status e os métodos elegíveis de verificação do perfil (US2). */
export function useVerification(profileId: string | null, enabled: boolean) {
  return useQuery<GoogleVerificationResult | null>({
    queryKey: googleVerificationKey(profileId),
    queryFn: async () => {
      const response = await api.get<GoogleApiResponse<GoogleVerificationResult>>(
        `/google/profiles/${profileId}/verification`
      );
      return response.data.data;
    },
    enabled: enabled && !!profileId,
    retry: false,
  });
}

/** Conclui a verificação do perfil: envia PIN (PHONE/EMAIL) ou orienta cartão postal (POSTAL). */
export function useCompleteVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileId,
      method,
    }: {
      profileId: string;
      method: GoogleCompleteVerificationInput['method'];
    }): Promise<GoogleCompleteVerificationResult> => {
      const response = await api.post<GoogleApiResponse<GoogleCompleteVerificationResult>>(
        `/google/profiles/${profileId}/verification/complete`,
        { method }
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: googleVerificationKey(variables.profileId) });
    },
  });
}

/** Busca o perfil espelhado com dados frescos do GBP (US3). */
export function useGoogleProfile(profileId: string | null, enabled: boolean) {
  return useQuery<GoogleBusinessProfile | null>({
    queryKey: googleProfileKey(profileId),
    queryFn: async () => {
      const response = await api.get<GoogleApiResponse<GoogleBusinessProfile | null>>(
        `/google/profiles/${profileId}`
      );
      return response.data.data;
    },
    enabled: enabled && !!profileId,
    retry: false,
  });
}

/** Atualiza campos do perfil no GBP (US3). */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileId,
      data,
    }: {
      profileId: string;
      data: Record<string, unknown>;
    }): Promise<GoogleBusinessProfile> => {
      const response = await api.patch<GoogleApiResponse<GoogleBusinessProfile>>(
        `/google/profiles/${profileId}`,
        data
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: googleProfileKey(variables.profileId) });
      void queryClient.invalidateQueries({ queryKey: ['google-settings'] });
    },
  });
}

/** Dispara sync imediato do perfil com o GBP (US3). */
export function useSyncProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profileId: string): Promise<GoogleBusinessProfile> => {
      const response = await api.post<GoogleApiResponse<GoogleBusinessProfile>>(
        `/google/profiles/${profileId}/sync`
      );
      return response.data.data;
    },
    onSuccess: (_data, profileId) => {
      void queryClient.invalidateQueries({ queryKey: googleProfileKey(profileId) });
      void queryClient.invalidateQueries({ queryKey: googleSyncLogsKey(profileId) });
    },
  });
}

/** Busca histórico de operações de sincronização (US3). */
export function useSyncLogs(profileId: string | null, enabled: boolean) {
  return useQuery<GoogleSyncLogsResult | null>({
    queryKey: googleSyncLogsKey(profileId),
    queryFn: async () => {
      const response = await api.get<GoogleApiResponse<GoogleSyncLogsResult>>(
        `/google/profiles/${profileId}/sync-logs`
      );
      return response.data.data;
    },
    enabled: enabled && !!profileId,
    retry: false,
  });
}

/** Upload de foto para o perfil (US3). */
export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileId,
      file,
    }: {
      profileId: string;
      file: File;
    }): Promise<GooglePhotoUploadResult> => {
      const formData = new FormData();
      formData.append('photo', file);

      const response = await api.post<GoogleApiResponse<GooglePhotoUploadResult>>(
        `/google/profiles/${profileId}/photos`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: googleProfileKey(variables.profileId) });
    },
  });
}

/** Remove foto do perfil (US3). */
export function useRemovePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      profileId,
      photoUrl,
    }: {
      profileId: string;
      photoUrl: string;
    }): Promise<GooglePhotoUploadResult> => {
      const response = await api.delete<GoogleApiResponse<GooglePhotoUploadResult>>(
        `/google/profiles/${profileId}/photos`,
        { params: { url: photoUrl } }
      );
      return response.data.data;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: googleProfileKey(variables.profileId) });
    },
  });
}