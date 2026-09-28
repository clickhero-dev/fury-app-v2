import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';

export const LEAD_STATUS_OPTIONS = [
  'novo',
  'não contatado',
  'tentativa de contato',
  'negociando',
  'comprou',
  'não comprou',
] as const;

export type LeadStatus = (typeof LEAD_STATUS_OPTIONS)[number];

interface LeadStatusResponse {
  success: boolean;
  data: { id: string; status: LeadStatus } | null;
  error?: { code?: string; message?: string };
}

/**
 * Alteração manual de status de cliente (transições livres).
 * Otimista: atualiza o cache local de leads antes do PATCH e reverte em erro.
 */
export function useLeadStatus() {
  const queryClient = useQueryClient();

  return useMutation<LeadStatusResponse, Error, { id: string; status: LeadStatus }>({
    mutationFn: async ({ id, status }) => {
      const response = await api.patch<LeadStatusResponse>(`/v2/leads/${id}/status`, { status });
      return response.data;
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['campaigns/leads'] });

      const key = ['campaigns/leads', 'all'];
      const previous = queryClient.getQueryData<{
        data: Array<{ id: string; status?: string }>;
      }>(key);

      queryClient.setQueryData(key, (old: { data: Array<{ id: string; status?: string }> } | undefined) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((lead) => (lead.id === id ? { ...lead, status } : lead)),
        };
      });

      return { previous };
    },
    onError: (_err, _vars, context: { previous?: unknown } | undefined) => {
      if (context?.previous) {
        queryClient.setQueryData(['campaigns/leads', 'all'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns/leads'] });
    },
  });
}