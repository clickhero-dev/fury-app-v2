import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppLayout, LoadingSpinner } from '@/components';
import api from '@/lib/api';
import { CalendarView } from './components/CalendarView';
import type { Plan } from './types';

export function CalendarioPage() {
  const [confirmed, setConfirmed] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['calendario-latest-plan'],
    queryFn: async () => {
      const { data } = await api.get('/planner/plans/latest');
      return data.data as Plan | null;
    },
  });

  const handleConfirm = useCallback(async () => {
    if (!data?.id) return;
    await api.post('/planner/plans/confirm', { planId: data.id });
    setConfirmed(true);
  }, [data?.id]);

  if (isLoading) return <AppLayout><LoadingSpinner /></AppLayout>;

  if (error || !data) {
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-500">Nenhum plano encontrado. Crie um no Planejador.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-2xl font-bold text-white">Calendário Editorial</h1>
        <CalendarView plan={data} onConfirm={handleConfirm} confirmed={confirmed || data.status === 'active'} />
      </div>
    </AppLayout>
  );
}
