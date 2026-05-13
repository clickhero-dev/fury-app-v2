import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, XCircle, Target, TrendingUp, Calendar } from 'lucide-react';
import { AppLayout, PageHeader, LoadingSpinner } from '@/components';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

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

// ─── Mocks ────────────────────────────────────────────────────────────────────

const MOCK_GOALS: Goals = {
  objective: 'aumentar_vendas',
  monthlyBudget: 8000,
  targetCpa: 50,
  niche: 'E-commerce de Moda',
  mainProduct: 'Roupas esportivas',
};

const MOCK_PROGRESS: GoalsProgress = {
  goal: { objective: 'aumentar_vendas', monthlyBudget: 8000, targetCpa: 50 },
  current: { spend: 4850, roas: 3.2, cpa: 48.5, conversions: 97 },
  progressPercent: 61,
  onTrack: true,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OBJECTIVES: Record<string, string> = {
  aumentar_vendas: 'Aumentar Vendas',
  gerar_leads: 'Gerar Leads',
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
        <span className="text-text-secondary font-medium">{label}</span>
        <div className="flex items-center gap-3">
          <span className={cn('font-bold', isGood ? 'text-success' : 'text-error')}>{currentLabel}</span>
          <span className="text-text-tertiary text-xs">/ meta {targetLabel}</span>
        </div>
      </div>
      <div className="h-2 bg-surface-secondary rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', isGood ? 'bg-success' : 'bg-error')}
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
      try {
        return await api.get('/goals').then((r) => r.data);
      } catch {
        return MOCK_GOALS;
      }
    },
    placeholderData: MOCK_GOALS,
  });

  const { data: progress, isLoading: loadingProgress } = useQuery<GoalsProgress>({
    queryKey: ['goals-progress'],
    queryFn: async () => {
      try {
        return await api.get('/metrics/goals-progress').then((r) => r.data);
      } catch {
        return MOCK_PROGRESS;
      }
    },
    placeholderData: MOCK_PROGRESS,
  });

  const isLoading = loadingGoals || loadingProgress;

  const g = goals ?? MOCK_GOALS;
  const p = progress ?? MOCK_PROGRESS;

  // Month projection
  const today = new Date();
  const dayOfMonth = today.getDate();
  const daysInMonth = getDaysInMonth();
  const daysRemaining = daysInMonth - dayOfMonth;

  const currentConversions = p.current?.conversions ?? Math.round((p.current?.spend ?? 0) / (p.current?.cpa || 1));
  const projectedConversions = dayOfMonth > 0 ? Math.round((currentConversions / dayOfMonth) * daysInMonth) : 0;
  const projectedSpend = dayOfMonth > 0 ? Math.round(((p.current?.spend ?? 0) / dayOfMonth) * daysInMonth) : 0;

  // Status indicator
  const isOnTrack = p.onTrack;
  const pct = p.progressPercent ?? 0;
  const isWarning = !isOnTrack && pct >= 40;
  const isDanger = !isOnTrack && pct < 40;

  const StatusIcon = isOnTrack ? CheckCircle2 : isWarning ? AlertTriangle : XCircle;
  const statusText = isOnTrack ? 'No caminho certo' : isWarning ? 'Atenção necessária' : 'Fora da meta';
  const statusEmoji = isOnTrack ? '✅' : isWarning ? '⚠️' : '🚨';
  const statusClass = isOnTrack
    ? 'bg-success-light text-success border-success/20'
    : isWarning
      ? 'bg-warning-light text-warning border-warning/20'
      : 'bg-error-light text-error border-error/20';

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
      <div className="space-y-8">
        <PageHeader
          title="Minhas Metas"
          description="Configure e acompanhe os objetivos das suas campanhas"
          actions={
            <Button variant="outline" size="sm" onClick={() => navigate('/onboarding/metas')}>
              Editar metas
            </Button>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Metas atuais ─────────────────────────────────────────── */}
          <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FEF0E7] flex items-center justify-center">
                <Target className="w-4 h-4 text-accent" />
              </div>
              <h3 className="font-bold text-text-primary">Metas configuradas</h3>
            </div>

            <div className="space-y-4 divide-y divide-border">
              <GoalRow label="Objetivo" value={translateObjective(g.objective)} highlight />
              <div className="pt-4 space-y-4">
                <GoalRow label="Orçamento mensal" value={`R$ ${fmtBRL(g.monthlyBudget)}/mês`} />
                <GoalRow label="CPA alvo" value={`R$ ${fmtBRL(g.targetCpa)} por conversão`} />
                {g.niche && <GoalRow label="Nicho" value={g.niche} />}
                {g.mainProduct && <GoalRow label="Produto principal" value={g.mainProduct} />}
              </div>
            </div>
          </div>

          {/* ── Performance vs Meta ──────────────────────────────────── */}
          <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#FEF0E7] flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-accent" />
              </div>
              <h3 className="font-bold text-text-primary">Performance atual vs meta</h3>
            </div>

            <div className="space-y-5">
              <ComparisonRow
                label="CPA atual vs CPA alvo"
                currentValue={p.current?.cpa ?? 0}
                targetValue={p.goal?.targetCpa ?? g.targetCpa}
                currentLabel={`R$ ${fmtBRL(p.current?.cpa ?? 0)}`}
                targetLabel={`R$ ${fmtBRL(p.goal?.targetCpa ?? g.targetCpa)}`}
                lowerIsBetter
              />

              <div className="flex items-center justify-between text-sm pt-1">
                <span className="text-text-secondary font-medium">ROAS atual</span>
                <span
                  className={cn(
                    'font-bold text-base',
                    (p.current?.roas ?? 0) >= 2 ? 'text-success' : 'text-error'
                  )}
                >
                  {(p.current?.roas ?? 0).toFixed(1)}x
                </span>
              </div>
            </div>

            {/* Status indicator */}
            <div className={cn('flex items-center gap-3 border rounded-xl px-4 py-3 mt-2', statusClass)}>
              <span className="text-2xl">{statusEmoji}</span>
              <div>
                <p className="font-bold text-sm flex items-center gap-1.5">
                  <StatusIcon className="w-4 h-4" />
                  {statusText}
                </p>
                <p className="text-xs opacity-80 mt-0.5">
                  {pct}% do orçamento mensal utilizado
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Projeção do mês ──────────────────────────────────────────── */}
        <div className="bg-surface border border-border rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FEF0E7] flex items-center justify-center">
              <Calendar className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 className="font-bold text-text-primary">Projeção do mês</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Baseado no ritmo atual — {daysRemaining} dias restantes no mês
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ProjectionCard
              label="Conversões estimadas"
              value={projectedConversions.toLocaleString('pt-BR')}
              sub={`${currentConversions.toLocaleString('pt-BR')} realizadas até hoje`}
            />
            <ProjectionCard
              label="Investimento projetado"
              value={`R$ ${projectedSpend.toLocaleString('pt-BR')}`}
              sub={`de R$ ${(g.monthlyBudget ?? 0).toLocaleString('pt-BR')} de orçamento`}
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

// ─── Small helpers ────────────────────────────────────────────────────────────

function GoalRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className={cn('text-sm font-semibold text-right', highlight ? 'text-accent' : 'text-text-primary')}>
        {value}
      </span>
    </div>
  );
}

function ProjectionCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-surface-secondary rounded-xl p-4 space-y-1.5">
      <p className="text-xs text-text-secondary font-medium uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-black text-text-primary">{value}</p>
      <p className="text-xs text-text-tertiary">{sub}</p>
    </div>
  );
}
