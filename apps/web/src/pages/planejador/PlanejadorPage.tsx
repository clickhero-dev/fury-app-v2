import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components';
import api from '@/lib/api';
import { GeneratingState } from './components/GeneratingState';
import { IdleStatus } from './components/IdleStatus';
import type { JobStatus, ViewState } from './types';

export function PlanejadorPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/planner/generate');
      return data.data as JobStatus;
    },
    onSuccess: (job) => {
      setJobId(job.id);
      setView('generating');
      setErrorMsg(null);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Erro ao iniciar geração';
      setErrorMsg(msg);
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
    if (jobStatus?.status === 'done') {
      navigate('/calendario');
    }
    if (jobStatus?.status === 'error') {
      setErrorMsg(jobStatus.error || 'Erro na geração do plano');
      setJobId(null);
      setView('idle');
    }
  }, [jobStatus, navigate]);

  const handleGenerate = useCallback(() => {
    generateMutation.mutate();
  }, [generateMutation]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {view === 'generating' && (
          <div className="rounded-xl bg-gray-800/40 border border-gray-700/50 p-6">
            <GeneratingState jobStatus={jobStatus} />
          </div>
        )}

        {view === 'idle' && !generateMutation.isPending && !errorMsg && (
          <IdleStatus onGenerate={handleGenerate} isLoading={generateMutation.isPending} />
        )}

        {view === 'idle' && errorMsg && (
          <div className="space-y-4">
            <div className="rounded-xl bg-red-900/20 border border-red-700/30 p-4 text-center">
              <p className="text-red-400 text-sm">{errorMsg}</p>
            </div>
            <IdleStatus onGenerate={handleGenerate} isLoading={generateMutation.isPending} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
