import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AppLayout, LoadingSpinner } from '@/components';
import api from '@/lib/api';
import { GeneratingState } from './components/GeneratingState';
import { IdleStatus } from './components/IdleStatus';
import type { PrerequisiteCheck } from './components/IdleStatus';
import type { JobStatus, ViewState } from './types';

const STORAGE_KEY = 'fury_planner_job_id';

function loadSavedJobId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveJobId(id: string | null) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage indisponível — segue sem persistência
  }
}

export function PlanejadorPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>('idle');
  const [jobId, setJobId] = useState<string | null>(() => loadSavedJobId());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);
  const recoveryChecked = useRef(false);

  // Busca prerequisites do tenant
  const { data: pre, isLoading: preLoading } = useQuery({
    queryKey: ['planner-prerequisites'],
    queryFn: async () => {
      const { data } = await api.get('/planner/prerequisites');
      return data.data as {
        metaConnected: boolean;
        hasProduct: boolean;
        hasObjective: boolean;
        hasVoiceTone: boolean;
      };
    },
    staleTime: 30_000, // 30s — não precisa refetch a cada clique
  });

  const checks: PrerequisiteCheck[] | undefined = pre
    ? [
        { label: 'Meta conectada (Instagram + Facebook)', ok: pre.metaConnected },
        { label: 'Produto principal cadastrado', ok: pre.hasProduct },
        { label: 'Objetivo de negócio definido', ok: pre.hasObjective },
        { label: 'Tom de voz definido', ok: pre.hasVoiceTone },
      ]
    : undefined;

  // No mount: se tinha jobId salvo, tenta recuperar
  useEffect(() => {
    if (jobId && !recoveryChecked.current) {
      recoveryChecked.current = true;
      setView('generating');
      setRecovered(true);
    }
  }, [jobId]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/planner/generate');
      return data.data as JobStatus;
    },
    onSuccess: (job) => {
      setJobId(job.id);
      saveJobId(job.id);
      setView('generating');
      setErrorMsg(null);
      setRecovered(false);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Erro ao iniciar geração';
      setErrorMsg(msg);
    },
  });

  const {
    data: jobStatus,
    error: jobQueryError,
    isFetched,
  } = useQuery({
    queryKey: ['planner-job', jobId],
    queryFn: async () => {
      if (!jobId) return null;
      const { data } = await api.get(`/planner/jobs/${jobId}`);
      return data.data as JobStatus;
    },
    enabled: !!jobId && view === 'generating',
    refetchInterval: (query) => {
      if (recovered && !query.state.data) return false; // espera primeira resposta
      const status = query.state.data?.status;
      if (status === 'done' || status === 'error') return false;
      return 1500;
    },
    retry: 1,
  });

  // Efeito: job completou → redirect
  useEffect(() => {
    if (jobStatus?.status === 'done') {
      saveJobId(null);
      navigate('/calendario');
    }
  }, [jobStatus, navigate]);

  // Efeito: job falhou → limpa storage + mostra erro
  useEffect(() => {
    if (jobStatus?.status === 'error') {
      saveJobId(null);
      setErrorMsg(jobStatus.error || 'Erro na geração do plano');
      setJobId(null);
      setView('idle');
    }
  }, [jobStatus]);

  // Efeito: recuperação falhou (404 / job perdido no restart)
  useEffect(() => {
    if (recovered && isFetched && !jobStatus && jobQueryError) {
      saveJobId(null);
      setJobId(null);
      setErrorMsg('A geração anterior foi interrompida. Inicie novamente.');
      setView('idle');
      setRecovered(false);
    }
  }, [recovered, isFetched, jobStatus, jobQueryError]);

  const handleGenerate = useCallback(() => {
    generateMutation.mutate();
  }, [generateMutation]);

  // Estado de loading inicial (recuperando job salvo)
  if (recovered && !isFetched) {
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <p className="text-gray-500">Recuperando planejamento...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {view === 'generating' && (
          <div className="rounded-xl bg-gray-800/40 border border-gray-700/50 p-6">
            <GeneratingState jobStatus={jobStatus} />
          </div>
        )}

        {view === 'idle' && preLoading && (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        )}

        {view === 'idle' && !preLoading && !generateMutation.isPending && !errorMsg && (
          <IdleStatus onGenerate={handleGenerate} isLoading={generateMutation.isPending} checks={checks} />
        )}

        {view === 'idle' && errorMsg && (
          <div className="space-y-4">
            <div className="rounded-xl bg-red-900/20 border border-red-700/30 p-4 text-center">
              <p className="text-red-400 text-sm">{errorMsg}</p>
            </div>
            {!preLoading && (
              <IdleStatus onGenerate={handleGenerate} isLoading={generateMutation.isPending} checks={checks} />
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
