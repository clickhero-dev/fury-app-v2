import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';

export type FuryRule = {
  id: string;
  tenantId: string;
  name: string;
  conditionField: 'cpc' | 'ctr' | 'roas' | 'cpa' | 'spend';
  conditionOperator: 'gt' | 'lt' | 'eq';
  conditionValue: string;
  action: 'pause_campaign' | 'reduce_budget' | 'notify' | 'increase_budget';
  actionValue?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateFuryRulePayload = {
  name: string;
  conditionField: 'cpc' | 'ctr' | 'roas' | 'cpa' | 'spend';
  conditionOperator: 'gt' | 'lt' | 'eq';
  conditionValue: number;
  action: 'pause_campaign' | 'reduce_budget' | 'notify' | 'increase_budget';
  actionValue?: number;
  isActive?: boolean;
};

export type UpdateFuryRulePayload = Partial<CreateFuryRulePayload>;

const FURY_RULES_QUERY_KEY = 'fury-rules';

export function useGetFuryRules() {
  return useQuery<{ success: boolean; data: FuryRule[] }>({
    queryKey: [FURY_RULES_QUERY_KEY],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: FuryRule[] }>('/fury/rules');
      return res.data;
    },
  });
}

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
