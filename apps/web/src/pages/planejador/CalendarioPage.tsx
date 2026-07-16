import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppLayout, LoadingSpinner } from '@/components';
import api from '@/lib/api';
import { CalendarView } from './components/CalendarView';
import type { Plan } from './types';

export function CalendarioPage() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const planId = sessionStorage.getItem('fury_last_plan_id');

  const { isLoading } = useQuery({
    queryKey: ['planner/plan', planId],
    queryFn: async () => {
      if (!planId) throw new Error('no plan');
      const { data: res } = await api.get(`/planner/plans/${planId}`);
      setPlan(res.data as Plan);
      return res.data;
    },
    enabled: !!planId,
    retry: 1,
  });

  if (!planId) return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center py-20 text-text-tertiary">
        <p className="text-lg">Nenhum plano encontrado.</p>
        <p className="text-sm mt-2">Vá em Planejador e gere um plano primeiro.</p>
      </div>
    </AppLayout>
  );

  if (isLoading || !plan) return (
    <AppLayout>
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    </AppLayout>
  );

  return (
    <AppLayout className="!p-0">
      <CalendarView plan={plan} />
    </AppLayout>
  );
}
