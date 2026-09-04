import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppLayout, LoadingSpinner } from '@/components';
import api from '@/lib/api';
import { GeneratingState } from './components/GeneratingState';
import { IdleStatus } from './components/IdleStatus';
import { PlanSummary } from './components/PlanSummary';
import { PostsGrid } from './components/PostsGrid';
import { PostSidePanel } from './components/PostSidePanel';
import type { PrerequisiteCheck } from './components/IdleStatus';
import type { JobStatus, Plan, Post, ViewState } from './types';
import { buildHistoryRows, generatePayload, shouldGiveUpPolling } from './plannerPage.utils';
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
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewState>('idle');
  const [jobId, setJobId] = useState<string | null>(() => loadSavedJobId());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);
  const recoveryChecked = useRef(false);
  // Plano em exibição: recém-gerado (job done) ou escolhido no histórico.
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  // Watchdog: evita polling infinito de job travado (a imagem pode nunca completar).
  const jobStartedAt = useRef<number>(0);

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

  // Busca cota de criativos do tenant
  const { data: quota } = useQuery({
    queryKey: ['planner-quota'],
    queryFn: async () => {
      const { data } = await api.get('/planner/quota');
      return data.data as {
        creativesRemaining: number | null;
        creativesLimit: number | null;
      };
    },
    staleTime: 60_000,
  });

  // Histórico de planos do tenant (mais recente primeiro)
  const { data: historyPlans, isLoading: historyLoading } = useQuery({
    queryKey: ['planner-plans'],
    queryFn: async () => {
      const { data } = await api.get('/planner/plans', { params: { limit: 10 } });
      return data.data as Array<{ id: string; title: string | null; status: string; createdAt?: string; postCount: number }>;
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

  // Calcula se há cota suficiente para gerar 8 posts (8 imagens)
  const creativesRemaining = quota?.creativesRemaining ?? null;
  const creativesLimit = quota?.creativesLimit ?? null;
  const quotaSufficient = creativesRemaining === null || creativesRemaining >= 8;

  // Recupera job salvo ao montar a página
  useEffect(() => {
    if (jobId && !recoveryChecked.current) {
      recoveryChecked.current = true;
      jobStartedAt.current = Date.now();
      setView('generating');
      setRecovered(true);
    }
  }, [jobId]);

  const generateMutation = useMutation({
    mutationFn: async (vars?: { postsCount?: number }) => {
      captureEvent('gerar_plano_iniciado', { postsCount: vars?.postsCount ?? 8 });
      const { data } = await api.post('/planner/generate', generatePayload(vars?.postsCount));
      return data.data as JobStatus;
    },
    onSuccess: (job) => {
      setJobId(job.id);
      saveJobId(job.id);
      jobStartedAt.current = Date.now();
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
      const state = query.state.data?.state;
      if (state === 'DONE' || state === 'ERROR') return false;
      // Watchdog: job em espera há tempo demais → para de pollear (evita tela eterna).
      if (shouldGiveUpPolling(query.state.data?.status, jobStartedAt.current, Date.now())) return false;
      return 1500;
    },
    retry: 1,
  });

  // Concluiu: mostra o resumo + posts na própria página (sem redirect automático)
  useEffect(() => {
    if (jobStatus?.state === 'DONE') {
      saveJobId(null);
      setJobId(null);
      if (jobStatus.planId) setActivePlanId(jobStatus.planId);
      setView('review');
      setErrorMsg(null);
      captureEvent('gerar_plano_concluido', { planId: jobStatus.planId ?? null });
    }
  }, [jobStatus]);

  // Limpa o job e exibe erro caso falhe
  useEffect(() => {
    if (jobStatus?.state === 'ERROR') {
      saveJobId(null);
      setErrorMsg('Desculpe, algo deu errado ao gerar seu plano. Tente novamente em instantes.');
      setJobId(null);
      setView('idle');
    }
  }, [jobStatus]);

  // Watchdog: job travado em espera por tempo demais → destrava o usuário sem
  // depender de restart da API (imagem que nunca completa, worker stallado...).
  useEffect(() => {
    if (jobStatus && shouldGiveUpPolling(jobStatus.status, jobStartedAt.current, Date.now())) {
      saveJobId(null);
      setErrorMsg('A geração está demorando mais que o esperado. Tente novamente.');
      setJobId(null);
      setView('idle');
      setRecovered(false);
      captureEvent('gerar_plano_stalled', { jobId: jobStatus.id });
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

  // Plano em exibição (vindo do job done ou do histórico)
  const { data: activePlan, isLoading: planLoading } = useQuery({
    queryKey: ['planner-plan', activePlanId],
    queryFn: async () => {
      if (!activePlanId) return null;
      const { data } = await api.get(`/planner/plans/${activePlanId}`);
      return data.data as Plan;
    },
    enabled: !!activePlanId,
  });

  const handleGenerate = useCallback((postsCount: number = 8) => {
    generateMutation.mutate({ postsCount } as any);
  }, [generateMutation]);

  const openHistoryPlan = useCallback((planId: string) => {
    setActivePlanId(planId);
    setSelectedPost(null);
    setView('review');
  }, []);

  const handlePostUpdated = useCallback((updated: Post) => {
    setSelectedPost(updated);
    // Atualiza o cache do plano aberto e revalida o histórico (contagem/status).
    queryClient.setQueryData<Plan | undefined>(['planner-plan', activePlanId], (old) =>
      old ? { ...old, posts: (old.posts ?? []).map((p) => (p.id === updated.id ? updated : p)) } : old
    );
    queryClient.invalidateQueries({ queryKey: ['planner-plans'] });
  }, [queryClient, activePlanId]);

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

  const historyRows = historyPlans ? buildHistoryRows(historyPlans) : [];

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Estado de Geração de Conteúdo */}
        {view === 'generating' && (
          <div className="rounded-xl bg-surface-secondary/40 border border-border/50 p-6">
            {jobStatus?.state === 'INITIALIZING' && (
              <p className="mb-3 text-sm font-medium text-text-tertiary">
                Iniciando geração do plano...
              </p>
            )}
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
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#E8631A] px-4 py-1.5 text-sm font-semibold text-white transition-all hover:bg-[#D45714]"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {/* Estado de Idle (Início) */}
        {view === 'idle' && !preLoading && (
          <IdleStatus
            onGenerate={handleGenerate}
            isLoading={generateMutation.isPending}
            checks={checks}
            creativesRemaining={creativesRemaining}
            creativesLimit={creativesLimit}
            quotaSufficient={quotaSufficient}
          />
        )}

        {/* Plano em exibição: recém-gerado ou do histórico — resumo + posts */}
        {view === 'review' && (
          <div className="space-y-6" aria-busy={planLoading}>
            {planLoading ? (
              <div className="space-y-4" aria-hidden="true">
                <div className="h-8 w-64 rounded-xl bg-surface-secondary/60 animate-pulse" />
                <div className="h-4 w-96 max-w-full rounded-xl bg-surface-secondary/40 animate-pulse" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-24 rounded-2xl bg-surface-secondary/40 animate-pulse" />
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="aspect-square rounded-xl bg-surface-secondary/40 animate-pulse" />
                  ))}
                </div>
              </div>
            ) : activePlan ? (
              <>
                <PlanSummary plan={activePlan} onViewCalendar={() => navigate('/calendario')} />
                <section aria-label="Posts gerados">
                  <h2 className="text-sm font-semibold text-text-primary mb-3">
                    Posts gerados ({activePlan.posts?.length ?? 0})
                  </h2>
                  <PostsGrid posts={activePlan.posts ?? []} onSelect={setSelectedPost} />
                </section>
              </>
            ) : (
              <div className="rounded-xl bg-surface-secondary/40 border border-border/50 p-6 text-center">
                <p className="text-sm font-medium text-text-primary">Seu plano foi concluído!</p>
                <p className="mt-1 text-sm text-text-tertiary">
                  O resumo não pôde ser carregado. Veja os posts no calendário ou gere um novo plano.
                </p>
                <div className="mt-3 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/calendario')}
                    className="inline-flex items-center gap-2 rounded-full bg-[#E8631A] px-4 py-1.5 text-sm font-semibold text-white transition-all hover:bg-[#D45714]"
                  >
                    Ver calendário
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePlanId(null);
                      setErrorMsg(null);
                      setView('idle');
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm font-semibold text-text-primary transition-all hover:bg-surface-hover"
                  >
                    Gerar novo plano
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Histórico de Planos */}
        {view !== 'generating' && (
          <section
            aria-label="Histórico de planos"
            className="rounded-xl bg-surface-secondary/40 border border-border/50 p-6"
          >
            <h2 className="text-sm font-semibold text-text-primary mb-4">Histórico de Planos</h2>

            {historyLoading ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 rounded-xl bg-surface-secondary/60 animate-pulse" />
                ))}
              </div>
            ) : historyRows.length > 0 ? (
              <ul className="divide-y divide-border/50">
                {historyRows.map((row) => {
                  const isActive = row.id === activePlanId && view === 'review';
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => openHistoryPlan(row.id)}
                        className={`w-full flex items-center justify-between gap-4 py-3 px-2 rounded-xl text-left transition-all cursor-pointer ${
                          isActive
                            ? 'bg-accent/10 border border-accent/30'
                            : 'border border-transparent hover:bg-surface-secondary/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text-primary truncate">{row.title}</p>
                          <p className="text-xs text-text-tertiary">
                            {row.dateLabel} · {row.postCount} posts
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full bg-surface-secondary border border-border/60 text-text-tertiary">
                          {row.statusLabel}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <p className="text-sm text-text-tertiary">Nenhum plano gerado ainda.</p>
                <button
                  type="button"
                  onClick={() => handleGenerate()}
                  disabled={generateMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
                >
                  Gerar primeiro plano
                </button>
              </div>
            )}
          </section>
        )}

        {/* Painel de edição do post (legenda, hashtags, imagem, texto) */}
        {selectedPost && (
          <PostSidePanel
            post={selectedPost}
            onClose={() => setSelectedPost(null)}
            onUpdate={handlePostUpdated}
          />
        )}
      </div>
    </AppLayout>
  );
}