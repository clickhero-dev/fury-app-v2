import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import api from '../lib/api';

function isCampaignUnavailableError(err: unknown): boolean {
  if (!isAxiosError(err)) return false;
  const status = err.response?.status;
  const code = err.response?.data?.error?.code as string | undefined;
  return (status === 404 && code === 'CAMPAIGN_NOT_FOUND')
    || (status === 400 && code === 'CAMPAIGN_DELETED');
}

function removeCampaignFromCache(cache: unknown, campaignId: string) {
  if (!cache || typeof cache !== 'object') return cache;
  const entry = cache as { data?: unknown };
  if (!Array.isArray(entry.data)) return cache;
  return {
    ...entry,
    data: entry.data.filter((campaign) =>
      !campaign || typeof campaign !== 'object' || (campaign as { id?: unknown }).id !== campaignId
    ),
  };
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await api.delete(`/campaigns/${id}`);
        return { id, unavailable: false };
      } catch (err) {
        // A stale row is already in the desired end state for the list. Keep
        // this fallback restricted to the two explicit, client-safe contracts.
        if (isCampaignUnavailableError(err)) return { id, unavailable: true };
        throw err;
      }
    },
    onSuccess: ({ id, unavailable }) => {
      if (unavailable) {
        queryClient.setQueriesData({ queryKey: ['campaigns'] }, (cache) =>
          removeCampaignFromCache(cache, id)
        );
      }
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function getDeleteCampaignError(err: unknown): string {
  if (isAxiosError(err)) {
    const code = err.response?.data?.error?.code as string | undefined;
    const message = err.response?.data?.error?.message as string | undefined;
    if (code === 'CAMPAIGN_DELETED') return message || 'Campanha já foi excluída no Meta.';
    if (code === 'META_TOKEN_EXPIRED') return 'Token Meta expirado. Reconecte sua conta.';
    if (code === 'CAMPAIGN_NOT_FOUND') return 'Campanha não encontrada.';
    if (code === 'FORBIDDEN') return 'Você não tem permissão para excluir esta campanha.';
    if (err.response?.status === 500) return 'Erro interno ao excluir campanha. Tente novamente.';
    if (!err.response || err.code === 'ERR_NETWORK') return 'Sem conexão com o servidor.';
    if (message) return message;
  }
  return 'Não foi possível excluir a campanha. Tente novamente.';
}
