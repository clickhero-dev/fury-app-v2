import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * Configuração de metas do FURY Engine para o tenant.
 * Define os targets usados no algoritmo de scoring de campanhas.
 */
export type FuryConfig = {
  id: string;
  tenantId: string;
  /** ROAS alvo para pontuação máxima (40 pontos no scoring). */
  targetRoas: string;
  /** CPA alvo — quanto menor o CPA real em relação a este valor, maior a pontuação. */
  targetCpa: string;
  /** CTR alvo para pontuação máxima (30 pontos no scoring). */
  targetCtr: string;
  /** Percentual ideal de utilização do orçamento (ex: 80 = 80%). */
  targetBudgetUtilization: string;
  updatedAt: string;
};

/** Payload para atualização parcial da configuração do FURY Engine. */
export type UpdateFuryConfigPayload = {
  targetRoas?: number;
  targetCpa?: number;
  targetCtr?: number;
  targetBudgetUtilization?: number;
};

/**
 * Hook para buscar a configuração atual do FURY Engine do tenant.
 * Cache válido por 5 minutos.
 *
 * @returns Resultado do React Query com `FuryConfig`
 *
 * @example
 * const { data: config } = useFuryConfig();
 * console.log(config?.targetRoas); // '4.0'
 */
export function useFuryConfig() {
  return useQuery<FuryConfig>({
    queryKey: ['fury-config'],
    queryFn: async () => {
      const res = await api.get<{ data: FuryConfig }>('/fury/config');
      return res.data.data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook para atualizar a configuração do FURY Engine.
 * Atualiza o cache diretamente após sucesso, sem necessidade de refetch.
 *
 * @returns Mutation do React Query para atualização da configuração
 *
 * @example
 * const { mutate: updateConfig } = useUpdateFuryConfig();
 * updateConfig({ targetRoas: 5.0, targetCpa: 40 });
 */
export function useUpdateFuryConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateFuryConfigPayload) => {
      const res = await api.patch<{ data: FuryConfig }>('/fury/config', payload);
      return res.data.data;
    },
    onSuccess: (data) => {
      // Atualiza o cache diretamente com os novos dados para resposta imediata na UI
      queryClient.setQueryData(['fury-config'], data);
    },
  });
}