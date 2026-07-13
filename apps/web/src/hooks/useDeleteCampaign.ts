import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import api from '../lib/api';

export function useDeleteCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/campaigns/${id}`);
    },
    onSuccess: () => {
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
