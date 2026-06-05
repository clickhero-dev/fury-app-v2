import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import api from '../lib/api';
import type { CampaignApiStatus } from '../types/campaigns';

interface PauseCampaignRequest {
  id: string;
  action: 'pause' | 'resume';
}

export interface CampaignStatusUpdateResponse {
  success: boolean;
  data: {
    status: CampaignApiStatus;
  };
  timestamp: string;
}

export function getFriendlyPauseError(err: unknown): string {
  if (isAxiosError(err)) {
    const code = err.response?.data?.error?.code as string | undefined;
    const message = err.response?.data?.error?.message as string | undefined;

    if (code === 'META_TOKEN_EXPIRED') {
      return 'Token Meta expirado. Reconecte sua conta em Configurações > Integrações.';
    }
    if (code === 'META_CONNECTION_NOT_FOUND') {
      return 'Conta Meta não conectada. Acesse Configurações > Integrações.';
    }
    if (code === 'CAMPAIGN_NOT_FOUND') {
      return 'Campanha não encontrada. Atualize a página e tente novamente.';
    }
    if (code === 'FORBIDDEN') {
      return 'Você não tem permissão para alterar esta campanha.';
    }
    if (err.response?.status === 500) {
      return 'Erro interno ao processar a solicitação. Tente novamente em instantes.';
    }
    if (!err.response || err.code === 'ERR_NETWORK') {
      return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
    }
    if (message) return message;
  }
  return 'Não foi possível alterar o status da campanha. Tente novamente.';
}

export function usePauseCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, action }: PauseCampaignRequest) => {
      const response = await api.patch<CampaignStatusUpdateResponse>(
        `/campaigns/${id}/${action}`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}
