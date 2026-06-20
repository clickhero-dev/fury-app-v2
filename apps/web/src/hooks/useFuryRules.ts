import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

/**
 * Regra de automação configurada pelo usuário no FURY Engine.
 * Define uma condição sobre uma métrica e uma ação a ser executada quando atingida.
 */
export type FuryRule = {
  id: string;
  tenantId: string;
  name: string;
  /** Métrica monitorada pela regra. */
  conditionField: 'cpc' | 'ctr' | 'roas' | 'cpa' | 'spend';
  /** Operador de comparação: maior que, menor que ou igual. */
  conditionOperator: 'gt' | 'lt' | 'eq';
  conditionValue: string;
  /** Ação executada quando a condição é satisfeita. */
  action: 'pause_campaign' | 'reduce_budget' | 'notify' | 'increase_budget';
  /** Valor associado à ação (ex: percentual de redução de orçamento). */
  actionValue?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Payload para criação de uma nova regra de automação. */
export type CreateFuryRulePayload = {
  name: string;
  conditionField: 'cpc' | 'ctr' | 'roas' | 'cpa' | 'spend';
  conditionOperator: 'gt' | 'lt' | 'eq';
  conditionValue: number;
  action: 'pause_campaign' | 'reduce_budget' | 'notify' | 'increase_budget';
  actionValue?: number;
  isActive?: boolean;
};

/** Payload para atualização parcial de uma regra existente. */
export type UpdateFuryRulePayload = Partial<CreateFuryRulePayload>;

/** Chave usada no React Query para cache das regras FURY. */
const FURY_RULES_QUERY_KEY = 'fury-rules';

/**
 * Hook para listar todas as regras de automação do tenant autenticado.
 *
 * @returns Resultado do React Query com array de `FuryRule`
 *
 * @example
 * const { data } = useGetFuryRules();
 * const rules = data?.data ?? [];
 */
export function useGetFuryRules() {
  return useQuery<{ success: boolean; data: FuryRule[] }>({
    queryKey: [FURY_RULES_QUERY_KEY],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: FuryRule[] }>('/fury/rules');
      return res.data;
    },
  });
}

/**
 * Hook para criar uma nova regra de automação.
 * Invalida o cache de regras automaticamente após sucesso.
 *
 * @returns Mutation do React Query para criação de regra
 *
 * @example
 * const { mutate: createRule } = useCreateFuryRule();
 * createRule({ name: 'Pausar CPA alto', conditionField: 'cpa', conditionOperator: 'gt', conditionValue: 80, action: 'pause_campaign' });
 */
export function useCreateFuryRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateFuryRulePayload) => {
      const res = await api.post<{ success: boolean; data: FuryRule }>('/fury/rules', payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FURY_RULES_QUERY_KEY] });
    },
  });
}

/**
 * Hook para atualizar parcialmente uma regra de automação existente.
 * Invalida o cache de regras automaticamente após sucesso.
 *
 * @returns Mutation do React Query para atualização de regra
 *
 * @example
 * const { mutate: updateRule } = useUpdateFuryRule();
 * updateRule({ id: 'uuid', payload: { isActive: false } });
 */
export function useUpdateFuryRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: UpdateFuryRulePayload }) => {
      const res = await api.patch<{ success: boolean; data: FuryRule }>(`/fury/rules/${id}`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FURY_RULES_QUERY_KEY] });
    },
  });
}

/**
 * Hook para remover uma regra de automação.
 * Invalida o cache de regras automaticamente após sucesso.
 *
 * @returns Mutation do React Query para deleção de regra
 *
 * @example
 * const { mutate: deleteRule } = useDeleteFuryRule();
 * deleteRule('uuid-da-regra');
 */
export function useDeleteFuryRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/fury/rules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [FURY_RULES_QUERY_KEY] });
    },
  });
}