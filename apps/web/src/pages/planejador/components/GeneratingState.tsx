import { CheckCircle, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import type { JobStatus } from '../types';

interface GeneratingStateProps {
  jobStatus: JobStatus | null;
}

const AGENT_DESCRIPTIONS: Record<string, string> = {
  'Context Agent': 'Lendo o perfil da sua empresa',
  'Research Agent': 'Pesquisando o seu mercado',
  'Analytics Agent': 'Analisando resultados anteriores',
  'Strategy Agent': 'Definindo a estratégia do mês',
  'Planner Agent': 'Montando o calendário',
  'Copywriter Agent': 'Escrevendo os textos',
  'Creative Agent': 'Criando as ideias visuais',
  'Quality Agent': 'Revisando tudo',
  'Scheduler Agent': 'Distribuindo nos melhores horários',
  'Branding Agent': 'Aplicando o seu tom de voz',
};

export function GeneratingState({ jobStatus }: GeneratingStateProps) {
  const agents = [
    'Context Agent', 'Research Agent', 'Analytics Agent',
    'Strategy Agent', 'Planner Agent', 'Copywriter Agent',
    'Creative Agent', 'Quality Agent', 'Scheduler Agent', 'Branding Agent',
  ];

  // 1. Caso a API ainda não tenha retornado o primeiro JobStatus
  if (!jobStatus) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="size-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-4">
          <Loader2 className="size-6 animate-spin text-accent" />
        </div>
        <p className="text-base font-semibold text-text-primary">Iniciando pipeline...</p>
        <p className="text-xs text-text-tertiary mt-1">Conectando aos nossos agentes de IA.</p>
      </div>
    );
  }

  // 2. Caso ocorra algum erro na API
  if (jobStatus.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center p-10 text-center text-red-400 bg-red-950/20 rounded-3xl border border-red-800/30 max-w-xl mx-auto">
        <AlertCircle className="size-10 mb-3" />
        <p className="text-base font-semibold text-white">Erro na geração</p>
        <p className="text-sm text-red-300/80 mt-1">{jobStatus.error || 'Erro desconhecido'}</p>
      </div>
    );
  }

  // Cálculos de progresso com base no jobStatus real
  const completedCount = jobStatus.agentProgress?.filter((s) => s.status === 'completed').length || 0;
  const runningStep = jobStatus.agentProgress?.find((s) => s.status === 'running');
  const runningPct = runningStep ? (runningStep.pct || 0) / 100 : 0;
  const overallPercentage = Math.min(
    100,
    Math.round(((completedCount + runningPct) / agents.length) * 100)
  );

  // 3. Renderização estilizada com os dados reais
  return (
    <section className="relative overflow-hidden rounded-3xl gradient-teal shadow-lift text-primary-foreground max-w-5xl mx-auto">
      <div className="absolute inset-0 grid-dots opacity-60" aria-hidden="true" />

      <div className="relative p-6 lg:p-7">
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
              <Sparkles className="size-5 text-spark" />
            </span>
            <div>
              <p className="text-base font-semibold text-white leading-tight">
                {jobStatus.status === 'done'
                  ? 'Pipeline concluído'
                  : `Processando: ${jobStatus.currentAgent || 'Iniciando...'}`}
              </p>
              <p className="text-xs sm:text-sm text-white/70 leading-tight mt-0.5">
                {jobStatus.status === 'done'
                  ? 'Tudo revisado e organizado para você.'
                  : AGENT_DESCRIPTIONS[jobStatus.currentAgent || ''] || 'Aguarde enquanto os agentes trabalham.'}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-2xl font-semibold text-white tabular-nums leading-tight">
              {overallPercentage}%
            </p>
            <p className="text-xs text-white/70 leading-tight">
              {completedCount} de {agents.length} etapas
            </p>
          </div>
        </div>

        {/* Barra de Progresso Geral */}
        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full gradient-spark transition-[width] duration-300"
            style={{ width: `${overallPercentage}%` }}
          />
        </div>

        {/* Lista dos 10 Agentes */}
        <div className="mt-5 grid gap-2">
          {agents.map((name) => {
            const step = jobStatus.agentProgress?.find((s) => s.name === name);
            const status = step?.status ?? 'pending';

            const isDone = status === 'completed';
            const isRunning = status === 'running';

            return (
              <div
                key={name}
                className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-all backdrop-blur-sm ${
                  isRunning
                    ? 'border-spark/50 bg-white/15'
                    : isDone
                      ? 'border-white/10 bg-white/10'
                      : 'border-white/5 bg-white/5 opacity-60'
                }`}
              >
                {/* Ícones de Status */}
                {isDone && <CheckCircle className="size-5 text-spark shrink-0" />}
                {isRunning && <Loader2 className="size-5 animate-spin text-white shrink-0" />}
                {status === 'failed' && <AlertCircle className="size-5 text-red-400 shrink-0" />}
                {status === 'pending' && (
                  <div className="size-5 rounded-full border border-white/25 shrink-0" />
                )}

                {/* Textos */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-medium ${
                      isDone || isRunning ? 'text-white' : 'text-white/50'
                    }`}
                  >
                    {name}
                  </p>
                  <p className="truncate text-xs text-white/60">
                    {AGENT_DESCRIPTIONS[name]}
                  </p>
                </div>

                {/* Barra Individual */}
                <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-white/10 sm:block">
                  <div
                    className="h-full rounded-full gradient-spark transition-all duration-300"
                    style={{
                      width: isDone ? '100%' : isRunning ? `${step?.pct ?? 0}%` : '0%',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}