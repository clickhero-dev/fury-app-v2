import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import api from '../lib/api';
import type { CampaignApiStatus } from '../types/campaigns';

interface PauseCampaignRequest {
  id: string;
  /** Ação a executar: pausar ou retomar a campanha. */
  action: 'pause' | 'resume';
}

/** Resposta da API ao atualizar o status de uma campanha. */
export interface CampaignStatusUpdateResponse {
  success: boolean;
  data: {
    status: CampaignApiStatus;
  };
  timestamp: string;
}

/**
 * Converte erros da API de pausa/retomada de campanha em mensagens amigáveis para o usuário.
 * Trata códigos de erro específicos do backend e casos de falha de rede.
 *
 * @param err - Erro capturado na chamada da API
 * @returns Mensagem de erro legível em português
 *
 * @example
 * try {
 *   await pauseCampaign({ id, action: 'pause' });
 * } catch (err) {
 *   toast.error(getFriendlyPauseError(err));
 * }
 */
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

/**
 * Hook para pausar ou retomar uma campanha Meta Ads.
 * Invalida o cache de campanhas automaticamente após sucesso.
 *
 * @returns Mutation do React Query para pausa/retomada de campanha
 *
 * @example
 * const { mutate: toggleCampaign } = usePauseCampaign();
 *
 * // Pausar
 * toggleCampaign({ id: 'uuid', action: 'pause' });
 *
 * // Retomar
 * toggleCampaign({ id: 'uuid', action: 'resume' });
 */
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
      // Recarrega a lista de campanhas para refletir o novo status
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}