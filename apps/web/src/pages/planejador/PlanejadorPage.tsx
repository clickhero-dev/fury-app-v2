import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components';
import api from '@/lib/api';
import { GeneratingState } from './components/GeneratingState';
import { CalendarView } from './components/CalendarView';
import { PlanSummary } from './components/PlanSummary';
import type { Plan, JobStatus, ViewState } from './types';

export function PlanejadorPage() {
  const [view, setView] = useState<ViewState>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/planner/generate');
      return data.data as JobStatus;
    },
    onSuccess: (job) => {
      setJobId(job.id);
      setView('generating');
    },
  });

  const { data: jobStatus } = useQuery({
    queryKey: ['planner-job', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const { data } = await api.get(`/planner/jobs/${jobId}`);
      return data.data as JobStatus;
    },
    enabled: !!jobId && view === 'generating',
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'done' || status === 'error') return false;
      return 1500;
    },
  });

  useEffect(() => {
    if (jobStatus?.status === 'done' && jobStatus?.planId) {
      setPlanId(jobStatus.planId);
      setView('review');
    }
    if (jobStatus?.status === 'error') {
      setJobId(null);
    }
  }, [jobStatus]);

  const { data: plan, isLoading: planLoading, error: planError } = useQuery({
    queryKey: ['planner-plan', planId],
    queryFn: async () => {
      if (!planId) return null;
      const { data } = await api.get(`/planner/plans/${planId}`);
      return data.data as Plan;
    },
    enabled: !!planId,
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/planner/plans/confirm', { planId });
      return data.data;
    },
    onSuccess: () => setConfirmed(true),
  });

  const handleGenerate = useCallback(() => {
    generateMutation.mutate();
  }, [generateMutation]);

  const handleConfirm = useCallback(() => {
    confirmMutation.mutate();
  }, [confirmMutation]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Planejador de Conteúdo</h1>
            <p className="text-sm text-gray-400 mt-1">
              Gere 1 mês de conteúdo orgânico com IA
            </p>
          </div>
          {view === 'idle' && (
            <button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium hover:from-blue-500 hover:to-purple-500 disabled:opacity-50 transition-all"
            >
              {generateMutation.isPending ? 'Iniciando...' : 'Gerar Plano'}
            </button>
          )}
        </div>

        {view === 'generating' && (
          <div className="rounded-xl bg-gray-800/40 border border-gray-700/50 p-6">
            <GeneratingState jobStatus={jobStatus} />
          </div>
        )}

        {view === 'idle' && !generateMutation.isPending && (
          <div className="rounded-xl bg-gray-800/40 border border-gray-700/50 p-12 text-center">
            <p className="text-gray-500">Clique em "Gerar Plano" para iniciar o pipeline de 10 agentes</p>
          </div>
        )}

        {view === 'review' && plan && (
          <>
            {!showCalendar ? (
              <PlanSummary plan={plan} onViewCalendar={() => setShowCalendar(true)} />
            ) : (
              <CalendarView
                plan={plan}
                onConfirm={handleConfirm}
                confirmed={confirmed}
              />
            )}
          </>
        )}

        {view === 'review' && planLoading && (
          <div className="text-center py-8 text-gray-500">Carregando plano...</div>
        )}

        {view === 'review' && planError && (
          <div className="text-center py-8 text-red-400">Erro ao carregar plano</div>
        )}
      </div>
    </AppLayout>
  );
}
