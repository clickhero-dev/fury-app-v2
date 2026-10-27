import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { RbacViewKey } from '@/lib/rbac-views';

/**
 * Telas bloqueadas pelo RBAC para o usuário logado (chaves já expandidas pela API).
 * Enquanto carrega ou se falhar, nada fica escondido — o servidor continua bloqueando.
 */
export function useBlockedViews() {
  const token = localStorage.getItem('token');
  const { data } = useQuery({
    queryKey: ['rbac', 'blocked-views'],
    queryFn: async (): Promise<string[]> => {
      const res = await api.get<{ data: { blocked: string[] } }>('/rbac/blocked-views');
      return res.data.data.blocked ?? [];
    },
    enabled: !!token,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const isBlocked = useCallback((key: RbacViewKey) => (data ?? []).includes(key), [data]);
  return { isBlocked };
}
