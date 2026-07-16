import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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
    retry: 1,
  });

  const handleConfirm = useCallback(async () => {
    if (!data?.id) return;
    await api.post('/planner/plans/confirm', { planId: data.id });
    setConfirmed(true);
  }, [data?.id]);

  if (isLoading) return <AppLayout><LoadingSpinner /></AppLayout>;

  if (error && !data) {
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <p className="text-red-400 text-sm mb-4">Erro ao carregar calendário</p>
          <p className="text-gray-500 text-xs">Verifique sua conexão e tente novamente</p>
        </div>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
          <h1 className="text-2xl font-bold text-white">Calendário Editorial</h1>
          <div className="rounded-xl bg-gray-800/40 border border-gray-700/50 p-8 text-center">
            <p className="text-gray-500 mb-4">Nenhum plano encontrado</p>
            <Link
              to="/planejador"
              className="inline-block px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-light text-white text-sm font-medium transition-all"
            >
              Criar planejamento
            </Link>
          </div>
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
