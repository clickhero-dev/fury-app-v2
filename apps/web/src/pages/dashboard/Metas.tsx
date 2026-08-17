import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, XCircle, Target, TrendingUp, Calendar, ArrowRight } from 'lucide-react';
import { AppLayout, PageHeader, LoadingSpinner } from '@/components';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

// ─── Design Tokens (ady) ──────────────────────────────────────────────────────

const SURFACE =
  'rounded-2xl border border-slate-200 dark:border-[#262824] bg-white dark:bg-[#161814] p-6 shadow-sm dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_18px_40px_-24px_rgba(0,0,0,0.7)]';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Goals {
  objective: string;
  monthlyBudget: number;
  targetCpa: number;
  niche?: string;
  mainProduct?: string;
}

interface GoalsProgress {
  goal: { objective: string; monthlyBudget: number; targetCpa: number };
  current: { spend: number; roas: number; cpa: number; conversions?: number };
  progressPercent: number;
  onTrack: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OBJECTIVES: Record<string, string> = {
  aumentar_vendas: 'Aumentar Vendas',
  gerar_leads: 'Atrair Pessoas',
  aumentar_awareness: 'Aumentar Awareness',
  maximizar_roas: 'Maximizar ROAS',
  reduzir_cpa: 'Reduzir CPA',
};

function translateObjective(key?: string) {
  return (key && OBJECTIVES[key]) ?? key ?? '—';
}

function fmtBRL(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDaysInMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ComparisonRow({
  label,
  currentValue,
  targetValue,
  currentLabel,
  targetLabel,
  lowerIsBetter = false,
}: {
  label: string;
  currentValue: number;
  targetValue: number;
  currentLabel: string;
  targetLabel: string;
  lowerIsBetter?: boolean;
}) {
  const ratio = targetValue > 0 ? currentValue / targetValue : 0;
  const isGood = lowerIsBetter ? ratio <= 1 : ratio >= 1;
  const barPercent = Math.min(100, ratio * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-500 dark:text-[#9A9D96]">{label}</span>
        <div className="flex items-center gap-3">
          <span className={cn('font-bold', isGood ? 'text-[#1E88A8]' : 'text-[#da3633]')}>
            {currentLabel}
          </span>
          <span className="text-xs text-slate-400 dark:text-[#8A8D86]">/ meta {targetLabel}</span>
        </div>
      </div>

      {/* Trilho da barra de progresso suave no modo claro */}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-[#1F211D]">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-700',
            isGood ? 'bg-[#1E88A8]' : 'bg-[#da3633]'
          )}
          style={{ width: `${barPercent}%` }}
        />
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Metas() {
  const navigate = useNavigate();

  const { data: goals, isLoading: loadingGoals } = useQuery<Goals>({
    queryKey: ['goals'],
    queryFn: async () => {
      return await api.get('/goals').then((r) => r.data);
    },
  });

  const { data: progress, isLoading: loadingProgress } = useQuery<GoalsProgress>({
    queryKey: ['goals-progress'],
    queryFn: async () => {
      return await api.get('/metrics/goals-progress').then((r) => r.data);
    },
  });

  const isLoading = loadingGoals || loadingProgress;

  const today = new Date();
  const dayOfMonth = today.getDate();
  const daysInMonth = getDaysInMonth();
  const daysRemaining = Math.max(0, daysInMonth - dayOfMonth);

  const hasGoals = Boolean(goals?.monthlyBudget || goals?.targetCpa || goals?.objective);

  const currentConversions =
    progress?.current?.conversions ??
    Math.round((progress?.current?.spend ?? 0) / (progress?.current?.cpa || 1));
  const projectedConversions =
    dayOfMonth > 0 ? Math.round((currentConversions / dayOfMonth) * daysInMonth) : 0;
  const projectedSpend =
    dayOfMonth > 0 ? Math.round(((progress?.current?.spend ?? 0) / dayOfMonth) * daysInMonth) : 0;

  const isOnTrack = progress?.onTrack ?? false;
  const pct = progress?.progressPercent ?? 0;
  const isWarning = !isOnTrack && pct >= 40;

  const StatusIcon = isOnTrack ? CheckCircle2 : isWarning ? AlertTriangle : XCircle;
  const statusText = isOnTrack
    ? 'No caminho certo'
    : isWarning
      ? 'Atenção necessária'
      : 'Fora da meta';
  const statusEmoji = isOnTrack ? '✅' : isWarning ? '⚠️' : '🚨';
  const statusClass = isOnTrack
    ? 'border-[#1E88A8]/30 bg-[#1E88A8]/10 text-slate-900 dark:text-[#ECEDEF]'
    : isWarning
      ? 'border-[#CF6F03]/30 bg-[#CF6F03]/10 text-slate-900 dark:text-[#ECEDEF]'
      : 'border-[#da3633]/30 bg-[#da3633]/10 text-slate-900 dark:text-[#ECEDEF]';

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-5xl space-y-8 px-6 py-10 text-slate-900 dark:text-[#ECEDEF] sm:px-10 lg:py-14">
        <PageHeader
          title="Minhas Metas"
          description="Configure e acompanhe os objetivos das suas campanhas"
          actions={
            <button
              onClick={() => navigate('/configuracoes?tab=metas')}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-[#262824] bg-slate-100 dark:bg-[#1F211D] px-4 py-2 text-xs font-semibold text-slate-800 dark:text-[#ECEDEF] transition-all hover:border-[#1E88A8] hover:text-[#1E88A8]"
            >
              Editar metas
            </button>
          }
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ── Metas atuais ─────────────────────────────────────────── */}
          <div className={`${SURFACE} space-y-5`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-[#1E88A8]/10 dark:bg-[#1F211D]">
                  <Target className="size-4 text-[#1E88A8]" />
                </div>
                <h3 className="font-semibold text-slate-900 dark:text-[#ECEDEF]">Metas configuradas</h3>
              </div>

              {!hasGoals && (
                <button
                  type="button"
                  onClick={() => navigate('/configuracoes?tab=metas')}
                  className="flex items-center gap-1 text-xs font-medium text-[#1E88A8] hover:underline cursor-pointer"
                >
                  Definir metas <ArrowRight className="size-3" />
                </button>
              )}
            </div>

            <div className="space-y-4 divide-y divide-slate-100 dark:divide-[#262824]">
              <GoalRow label="Objetivo" value={translateObjective(goals?.objective)} highlight />
              <div className="space-y-4 pt-4">
                <GoalRow
                  label="Orçamento mensal"
                  value={hasGoals ? `R$ ${fmtBRL(goals?.monthlyBudget ?? 0)}/mês` : 'Não definido'}
                />
                <GoalRow
                  label="CPA alvo"
                  value={hasGoals ? `R$ ${fmtBRL(goals?.targetCpa ?? 0)} por conversão` : 'Não definido'}
                />
                {goals?.niche && <GoalRow label="Nicho" value={goals.niche} />}
                {goals?.mainProduct && (
                  <GoalRow label="Produto principal" value={goals.mainProduct} />
                )}
              </div>
            </div>
          </div>

          {/* ── Performance vs Meta ──────────────────────────────────── */}
          <div className={`${SURFACE} space-y-5`}>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-[#1E88A8]/10 dark:bg-[#1F211D]">
                <TrendingUp className="size-4 text-[#1E88A8]" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-[#ECEDEF]">Performance atual vs meta</h3>
            </div>

            <div className="space-y-5">
              <ComparisonRow
                label="CPA atual vs CPA alvo"
                currentValue={progress?.current?.cpa ?? 0}
                targetValue={progress?.goal?.targetCpa ?? goals?.targetCpa ?? 0}
                currentLabel={`R$ ${fmtBRL(progress?.current?.cpa ?? 0)}`}
                targetLabel={`R$ ${fmtBRL(progress?.goal?.targetCpa ?? goals?.targetCpa ?? 0)}`}
                lowerIsBetter
              />

              <div className="flex items-center justify-between pt-1 text-sm">
                <span className="font-medium text-slate-500 dark:text-[#9A9D96]">ROAS atual</span>
                <span
                  className={cn(
                    'text-base font-bold',
                    (progress?.current?.roas ?? 0) >= 2 ? 'text-[#1E88A8]' : 'text-[#da3633]'
                  )}
                >
                  {(progress?.current?.roas ?? 0).toFixed(1)}x
                </span>
              </div>
            </div>

            {/* Status Indicator */}
            <div className={cn('mt-2 flex items-center gap-3 rounded-xl border px-4 py-3', statusClass)}>
              <span className="text-2xl">{statusEmoji}</span>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-bold">
                  <StatusIcon className="size-4" />
                  {statusText}
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-[#9A9D96]">
                  {pct}% do orçamento mensal utilizado
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Projeção do mês ──────────────────────────────────────────── */}
        <div className={`${SURFACE} space-y-5`}>
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[#1E88A8]/10 dark:bg-[#1F211D]">
              <Calendar className="size-4 text-[#1E88A8]" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-[#ECEDEF]">Projeção do mês</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-[#9A9D96]">
                Baseado no ritmo atual — <span className="font-medium text-[#1E88A8]">{daysRemaining} dias restantes</span> no mês
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ProjectionCard
              label="Conversões estimadas"
              value={projectedConversions.toLocaleString('pt-BR')}
              sub={`${currentConversions.toLocaleString('pt-BR')} realizadas até hoje`}
            />
            <ProjectionCard
              label="Investimento projetado"
              value={`R$ ${projectedSpend.toLocaleString('pt-BR')}`}
              sub={`de R$ ${(goals?.monthlyBudget ?? 0).toLocaleString('pt-BR')} de orçamento`}
            />
            <ProjectionCard
              label="Dias restantes"
              value={String(daysRemaining)}
              sub={`Dia ${dayOfMonth} de ${daysInMonth}`}
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default Metas;

// ─── Small helpers ────────────────────────────────────────────────────────────

function GoalRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-slate-500 dark:text-[#9A9D96]">{label}</span>
      <span
        className={cn(
          'text-sm font-semibold text-right',
          highlight ? 'text-[#1E88A8]' : 'text-slate-900 dark:text-[#ECEDEF]'
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ProjectionCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="space-y-1.5 rounded-xl border border-slate-200 dark:border-[#262824] bg-slate-50/70 dark:bg-[#1F211D]/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-[#9A9D96]">{label}</p>
      <p className="text-2xl font-black text-slate-900 dark:text-[#ECEDEF]">{value}</p>
      <p className="text-xs text-slate-400 dark:text-[#8A8D86]">{sub}</p>
    </div>
  );
}