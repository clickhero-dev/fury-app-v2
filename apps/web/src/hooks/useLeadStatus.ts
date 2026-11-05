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

type LeadListCache = {
  data: Array<{ id: string; status?: string }>;
};

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

      const previous = queryClient.getQueriesData<LeadListCache>({ queryKey: ['campaigns/leads'] });

      queryClient.setQueriesData<LeadListCache>({ queryKey: ['campaigns/leads'] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.map((lead) => (lead.id === id ? { ...lead, status } : lead)),
        };
      });

      return { previous };
    },
    onError: (_err, _vars, context: { previous?: Array<[readonly unknown[], LeadListCache | undefined]> } | undefined) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns/leads'] });
    },
  });
}
