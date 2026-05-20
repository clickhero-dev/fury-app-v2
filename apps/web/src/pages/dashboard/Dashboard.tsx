import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import {
  Target,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Brain,
  AlertTriangle,
  Wifi,
  WifiOff,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { AppLayout, PageHeader, LoadingSpinner } from '@/components';
import api from '@/lib/api';
import { useGoalsProgress, translateObjective, type GoalItem, type FuryAlert } from '@/hooks/useGoalsProgress';
import { useFurySSE } from '@/hooks/useFurySSE';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricsSummary {
  spend: number;
  roas: number;
  cpa: number;
  conversions: number;
}

const MOCK_SUMMARY: MetricsSummary = {
  spend: 4850,
  roas: 3.2,
  cpa: 48.5,
  conversions: 94,
};

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  on_track: {
    label: 'No caminho',
    bg: 'bg-[#dff3e4]',
    text: 'text-[#2ea043]',
    bar: '#2ea043',
    dot: 'bg-[#2ea043]',
  },
  at_risk: {
    label: 'Em risco',
    bg: 'bg-[#fff4d6]',
    text: 'text-[#e8a317]',
    bar: '#e8a317',
    dot: 'bg-[#e8a317]',
  },
  off_track: {
    label: 'Fora da meta',
    bg: 'bg-[#fde8e7]',
    text: 'text-[#da3633]',
    bar: '#da3633',
    dot: 'bg-[#da3633]',
  },
} as const;

// ─── Hero Card ────────────────────────────────────────────────────────────────

function HeroCard({
  goal,
  objective,
  daysRemaining,
  isConnected,
}: {
  goal: GoalItem;
  objective: string;
  daysRemaining: number;
  isConnected: boolean;
}) {
  const cfg = STATUS_CONFIG[goal.status];
  const pct = Math.min(100, goal.progress_pct);

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#1c1c1e] to-[#2d2d30] rounded-2xl p-7 text-white">
      {/* Background accent */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-accent/10 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

      <div className="relative space-y-5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-white/60 text-sm font-medium mb-1">Progresso do mês</p>
            <h2 className="text-4xl font-black leading-none">
              {pct}
              <span className="text-2xl font-bold text-white/70">%</span>
            </h2>
            <p className="mt-2 text-white/80 text-base font-medium">
              do caminho para{' '}
              <span className="text-accent font-bold">{translateObjective(objective)}</span>
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {cfg.label}
            </span>
            <span className="text-white/50 text-xs">{daysRemaining} dias restantes</span>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${pct}%`,
                backgroundColor: cfg.bar,
                boxShadow: `0 0 12px ${cfg.bar}80`,
              }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-white/50">
            <span>
              {goal.current_value.toLocaleString('pt-BR')} {goal.unit}
            </span>
            <span>
              meta: {goal.target_value.toLocaleString('pt-BR')} {goal.unit}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 text-xs text-white/40">
          {isConnected ? (
            <span className="flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-[#2ea043]" />
              <span className="text-[#2ea043]">Tempo real</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <WifiOff className="w-3.5 h-3.5" />
              Atualiza a cada 5 min
            </span>
          )}
          <span>·</span>
          <span>
            Projeção:{' '}
            <span className="font-semibold text-white/70">
              {goal.projected_value.toLocaleString('pt-BR')} {goal.unit}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({
  data,
  color,
}: {
  data: { date: string; value: number }[];
  color: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Goal Card ────────────────────────────────────────────────────────────────

const GOAL_ICONS = {
  conversions: Target,
  spend: DollarSign,
  roas: TrendingUp,
} as const;

function fmtVal(val: number, unit: string) {
  if (unit === 'R$') return `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (unit === 'x') return `${val.toFixed(1)}x`;
  return `${val.toLocaleString('pt-BR')} ${unit}`;
}

function GoalCard({ goal }: { goal: GoalItem }) {
  const cfg = STATUS_CONFIG[goal.status];
  const Icon = GOAL_ICONS[goal.metric as keyof typeof GOAL_ICONS] ?? Target;
  const pct = goal.progress_pct;
  const sparkColor = cfg.bar;

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-4 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-surface-secondary flex items-center justify-center">
            <Icon className="w-4 h-4 text-text-secondary" />
          </div>
          <p className="text-sm font-semibold text-text-secondary">{goal.name}</p>
        </div>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.text}`}
        >
          {cfg.label}
        </span>
      </div>

      {/* Main value */}
      <div>
        <div className="text-2xl font-black text-text-primary">
          {fmtVal(goal.current_value, goal.unit)}
        </div>
        <div className="text-xs text-text-secondary mt-0.5">
          meta: {fmtVal(goal.target_value, goal.unit)}
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="h-1.5 bg-surface-secondary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: cfg.bar }}
          />
        </div>
        <div className="flex justify-between text-xs text-text-tertiary">
          <span>{pct}% concluído</span>
          <span>proj: {fmtVal(goal.projected_value, goal.unit)}</span>
        </div>
      </div>

      {/* Sparkline */}
      {goal.sparkline.length > 1 && (
        <Sparkline data={goal.sparkline} color={sparkColor} />
      )}
    </div>
  );
}

// ─── Progress Chart ───────────────────────────────────────────────────────────

function ProgressChart({
  data,
  targetConversions,
}: {
  data: { date: string; real: number; ideal: number }[];
  targetConversions: number;
}) {
  const fmt = (d: string) => {
    const [, , day] = d.split('-');
    return `Dia ${parseInt(day, 10)}`;
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-text-primary">Progresso vs. Meta Ideal</h3>
          <p className="text-xs text-text-secondary mt-0.5">Conversões acumuladas no mês</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-accent inline-block rounded" />
            Real
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t-2 border-dashed border-[#9ca3af] inline-block" />
            Ideal
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="realGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#e8631a" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#e8631a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tickFormatter={fmt}
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: '#1c1c1e',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 12,
            }}
            formatter={(val, name) => [
              `${Number(val).toLocaleString('pt-BR')} conv.`,
              name === 'real' ? 'Real' : 'Ideal',
            ]}
            labelFormatter={(label) => fmt(String(label))}
          />
          <ReferenceLine
            y={targetConversions}
            strokeDasharray="4 4"
            stroke="#9ca3af"
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="ideal"
            stroke="#9ca3af"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            fill="none"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="real"
            stroke="#e8631a"
            strokeWidth={2.5}
            fill="url(#realGrad)"
            dot={false}
            activeDot={{ r: 5, fill: '#e8631a', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── FURY Alerts ──────────────────────────────────────────────────────────────

function FuryAlerts({
  alerts,
  sseUpdate,
}: {
  alerts: FuryAlert[];
  sseUpdate: { timestamp: string; scores: { campaignId: string; campaignName: string; score: number; grade: string }[] } | null;
}) {
  const allAlerts = [...alerts];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#FEF0E7] flex items-center justify-center shrink-0">
          <Brain className="w-4 h-4 text-accent" />
        </div>
        <div>
          <h3 className="text-base font-bold text-text-primary">Alertas do FURY</h3>
          <p className="text-xs text-text-secondary">Campanhas com desvio crítico em relação à meta</p>
        </div>
        {sseUpdate && (
          <span className="ml-auto text-xs text-[#2ea043] flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2ea043] animate-pulse" />
            Atualizado agora
          </span>
        )}
      </div>

      {allAlerts.length === 0 && !sseUpdate && (
        <div className="bg-[#dff3e4] border border-[#2ea043]/20 rounded-xl p-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#2ea043]/10 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-[#2ea043]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#2ea043]">Todas as campanhas dentro da meta</p>
            <p className="text-xs text-[#2ea043]/70">Nenhum desvio crítico detectado pelo FURY</p>
          </div>
        </div>
      )}

      {allAlerts.map((alert) => {
        const isCpaHigh = alert.type === 'cpa_high';
        return (
          <div
            key={`${alert.campaignId}-${alert.metric}`}
            className="bg-surface border border-border rounded-xl p-4 flex items-center gap-4"
          >
            <div className="w-9 h-9 rounded-xl bg-[#fde8e7] flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 text-[#da3633]" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-text-primary truncate">{alert.campaignName}</p>
              <p className="text-xs text-text-secondary mt-0.5">
                {alert.metric}{' '}
                <span className="font-semibold text-text-primary">
                  {alert.metric === 'CPA'
                    ? `R$ ${alert.current_value.toFixed(2)}`
                    : `${alert.current_value.toFixed(1)}x`}
                </span>{' '}
                · meta:{' '}
                {alert.metric === 'CPA'
                  ? `R$ ${alert.target_value.toFixed(2)}`
                  : `${alert.target_value.toFixed(1)}x`}
              </p>
            </div>

            <div className="shrink-0 flex items-center gap-1">
              {isCpaHigh ? (
                <ArrowUpRight className="w-4 h-4 text-[#da3633]" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-[#da3633]" />
              )}
              <span className="text-sm font-black text-[#da3633]">
                {Math.abs(alert.deviation_pct)}%
              </span>
            </div>
          </div>
        );
      })}

      {sseUpdate && sseUpdate.scores.length > 0 && (
        <div className="bg-surface-secondary border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-text-secondary mb-3 uppercase tracking-wider">
            Scores FURY — atualização em tempo real
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {sseUpdate.scores.slice(0, 6).map((s) => (
              <div
                key={s.campaignId}
                className="bg-surface rounded-lg p-3 border border-border"
              >
                <p className="text-xs text-text-secondary truncate">{s.campaignName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg font-black text-text-primary">{s.score}</span>
                  <span
                    className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      s.grade === 'A'
                        ? 'bg-[#dff3e4] text-[#2ea043]'
                        : s.grade === 'B'
                          ? 'bg-[#dff3e4] text-[#2ea043]'
                          : s.grade === 'C'
                            ? 'bg-[#fff4d6] text-[#e8a317]'
                            : 'bg-[#fde8e7] text-[#da3633]'
                    }`}
                  >
                    {s.grade}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Metric Summary Row ───────────────────────────────────────────────────────

function MetricPill({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-surface-secondary flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-text-secondary" />
      </div>
      <div>
        <p className="text-xs text-text-secondary font-medium">{label}</p>
        <p className="text-base font-black text-text-primary">{value}</p>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { data: goalsData, isLoading: loadingGoals } = useGoalsProgress();
  const { lastUpdate: sseUpdate, isConnected } = useFurySSE();

  const { data: summary } = useQuery<MetricsSummary>({
    queryKey: ['metrics-summary'],
    queryFn: async () => {
      try {
        const res = await api.get<{ data: MetricsSummary }>('/metrics/summary');
        return res.data.data;
      } catch {
        return MOCK_SUMMARY;
      }
    },
    refetchInterval: 5 * 60 * 1000,
    placeholderData: MOCK_SUMMARY,
  });

  const s = summary ?? MOCK_SUMMARY;
  const g = goalsData;

  const primaryGoal = g?.primary_goal ?? g?.goals?.[0];
  const objective = g?.objective ?? 'gerar_leads';

  return (
    <AppLayout>
      <div className="space-y-6 pb-8">
        <PageHeader
          title="Dashboard"
          description={`Objetivo: ${translateObjective(objective)} · ${g?.days_remaining ?? '—'} dias restantes no mês`}
        />

        {/* ── Hero Card ───────────────────────────────────────────────────── */}
        {loadingGoals ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="lg" />
          </div>
        ) : primaryGoal ? (
          <HeroCard
            goal={primaryGoal}
            objective={objective}
            daysRemaining={g?.days_remaining ?? 0}
            isConnected={isConnected}
          />
        ) : null}

        {/* ── Goals Grid ──────────────────────────────────────────────────── */}
        {g?.goals && g.goals.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {g.goals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} />
            ))}
          </div>
        )}

        {/* ── Progress Chart ──────────────────────────────────────────────── */}
        {g?.ideal_line && g.ideal_line.length > 1 && (
          <ProgressChart
            data={g.ideal_line}
            targetConversions={g.primary_goal?.target_value ?? 0}
          />
        )}

        {/* ── Metric Summary ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricPill label="ROAS" value={`${s.roas.toFixed(1)}x`} icon={TrendingUp} />
          <MetricPill
            label="CPA"
            value={`R$ ${s.cpa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={Target}
          />
          <MetricPill
            label="Investido"
            value={`R$ ${s.spend.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            icon={DollarSign}
          />
          <MetricPill
            label="Conversões"
            value={s.conversions.toLocaleString('pt-BR')}
            icon={ShoppingCart}
          />
        </div>

        {/* ── FURY Alerts ─────────────────────────────────────────────────── */}
        <FuryAlerts
          alerts={g?.alerts ?? []}
          sseUpdate={sseUpdate}
        />
      </div>
    </AppLayout>
  );
}
