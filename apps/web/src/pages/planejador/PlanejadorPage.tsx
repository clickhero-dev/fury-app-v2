import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AppLayout, LoadingSpinner } from '@/components';
import api from '@/lib/api';
import { GeneratingState } from './components/GeneratingState';
import { IdleStatus } from './components/IdleStatus';
import type { PrerequisiteCheck } from './components/IdleStatus';
import type { JobStatus, ViewState } from './types';
import { captureEvent } from '@/lib/posthog';

interface AgentLabelsResponse {
  order: string[];
  labels: Record<string, string>;
}

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

  // Busca labels dos agentes (para o GeneratingState)
  const { data: agentLabels } = useQuery<{ order: string[]; labels: Record<string, string> }>({
    queryKey: ['planner-agent-labels'],
    queryFn: async () => {
      const { data } = await api.get('/planner/agent-labels');
      return data.data as { order: string[]; labels: Record<string, string> };
    },
    staleTime: 60 * 60 * 1000, // 1h — labels mudam raramente
  });

  // Busca pré-requisitos do tenant
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
    staleTime: 30_000,
  });

  const checks: PrerequisiteCheck[] | undefined = pre
    ? [
        { label: 'Meta conectada (Instagram + Facebook)', ok: pre.metaConnected },
        { label: 'Produto principal cadastrado', ok: pre.hasProduct },
        { label: 'Objetivo de negócio definido', ok: pre.hasObjective },
        { label: 'Tom de voz definido', ok: pre.hasVoiceTone },
      ]
    : undefined;

  // Recupera job salvo ao montar a página
  useEffect(() => {
    if (jobId && !recoveryChecked.current) {
      recoveryChecked.current = true;
      setView('generating');
      setRecovered(true);
    }
  }, [jobId]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      captureEvent('gerar_plano_iniciado');
      const { data } = await api.post('/planner/generate');
      return data.data as JobStatus;
    },
    onSuccess: (job) => {
      setJobId(job.id);
      saveJobId(job.id);
      setView('generating');
      setErrorMsg(null);
      setRecovered(false);
      captureEvent('gerar_plano_sucesso', { jobId: job.id });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || err?.message || 'Erro ao iniciar geração';
      setErrorMsg(msg);
      captureEvent('gerar_plano_falha', { message: msg });
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
      if (recovered && !query.state.data) return false;
      const status = query.state.data?.status;
      if (status === 'done' || status === 'error') return false;
      return 1500;
    },
    retry: 1,
  });

  // Redireciona para o calendário ao concluir
  useEffect(() => {
    if (jobStatus?.status === 'done') {
      saveJobId(null);
      navigate('/calendario');
    }
  }, [jobStatus, navigate]);

  // Limpa o job e exibe erro caso falhe
  useEffect(() => {
    if (jobStatus?.status === 'error') {
      saveJobId(null);
      setErrorMsg(jobStatus.error || 'Erro na geração do plano');
      setJobId(null);
      setView('idle');
    }
  }, [jobStatus]);

  // Trata falhas no processo de recuperação de estado
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

 // Loading do estado de recuperação
 if (recovered && !isFetched) {
  return (
    <AppLayout>
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
        <LoadingSpinner />
        <p className="mt-4 text-sm font-medium text-slate-400">
          Recuperando planejamento...
        </p>
      </div>
    </AppLayout>
  );
}

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Estado de Geração de Conteúdo */}
        {view === 'generating' && (
          <div className="rounded-xl bg-surface-secondary/40 border border-border/50 p-6">
            <GeneratingState jobStatus={jobStatus} agentLabels={agentLabels} />
          </div>
        )}

        {/* Loading dos Pré-requisitos */}
        {view === 'idle' && preLoading && (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        )}

        {/* Mensagem de Erro quando houver */}
        {view === 'idle' && errorMsg && (
          <div className="max-w-5xl mx-auto">
            <div className="rounded-2xl bg-red-950/20 border border-red-800/30 p-4 text-center">
              <p className="text-red-400 text-sm font-medium">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Estado de Idle (Início) */}
        {view === 'idle' && !preLoading && (
          <IdleStatus
            onGenerate={handleGenerate}
            isLoading={generateMutation.isPending}
            checks={checks}
          />
        )}
      </div>
    </AppLayout>
  );
}