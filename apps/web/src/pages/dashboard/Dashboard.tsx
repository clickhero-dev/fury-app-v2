import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Users,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  Radio,
  ShieldCheck,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { AppLayout, PageHeader } from '@/components';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import api from '@/lib/api';
import { useGoalsProgress, translateObjective, type FuryAlert } from '@/hooks/useGoalsProgress';
import { type Period, getPeriodDates, formatPeriodLabel } from '@/lib/period-utils';
import { PeriodSelector } from '@/components/PeriodSelector';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveCampaign {
  id: string;
  name: string;
  status: string;
  metrics: {
    spend: number;
    conversions: number | null;
    roas: number | null;
    cpa: number | null;
  };
}

interface MetricsSummary {
  spend: number;
  roas: number;
  cpa: number;
  conversions: number;
}

interface DailyMetric {
  date: string;
  spend: number;
  conversions: number;
  roas: number;
  clicks: number;
  impressions: number;
}

type Sparkline = { date: string; value: number }[];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAlertValue(type: FuryAlert['type'], value: number) {
  if (type === 'roas_low') return `${value.toFixed(1)}x`;
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  on_track:  { label: 'No caminho',    bg: 'bg-[#dff3e4]', text: 'text-[#2ea043]', bar: '#2ea043' },
  at_risk:   { label: 'Em risco',      bg: 'bg-[#fff4d6]', text: 'text-[#e8a317]', bar: '#e8a317' },
  off_track: { label: 'Fora da meta',  bg: 'bg-[#fde8e7]', text: 'text-[#da3633]', bar: '#da3633' },
  no_goals:  { label: 'Sem metas',     bg: 'bg-gray-100',  text: 'text-gray-500',  bar: '#d1d5db' },
} as const;

const NO_DATA_CFG = { label: 'Sem dados', bg: 'bg-gray-100', text: 'text-gray-500', bar: '#d1d5db' };

// ─── Meta Banner ──────────────────────────────────────────────────────────────

function MetaBanner() {
  return (
    <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
      <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
        <Radio className="w-4 h-4 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-blue-900">
          Conecte sua conta Meta Ads para ver seus dados reais
        </p>
        <p className="text-xs text-blue-600 mt-0.5">
          Os valores abaixo refletem apenas as metas configuradas — sem métricas reais ainda.
        </p>
      </div>
      <Link
        to="/configuracoes/integracoes"
        className="shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
      >
        Conectar agora
      </Link>
    </div>
  );
}

// ─── Compact Hero Strip ───────────────────────────────────────────────────────

function HeroStrip({
  goal,
  objective,
  daysRemaining,
  hasRealData,
  hasGoals,
}: {
  goal: NonNullable<ReturnType<typeof useGoalsProgress>['data']>['primary_goal'];
  objective: string;
  daysRemaining: number;
  hasRealData: boolean;
  hasGoals: boolean;
}) {
  const statusKey = !hasRealData ? 'no_goals' : (goal.status === 'no_goals' ? 'no_goals' : goal.status);
  const cfg = STATUS_CONFIG[statusKey] ?? NO_DATA_CFG;
  const pct = hasGoals && hasRealData ? Math.min(100, goal.progress_pct ?? 0) : 0;

  return (
    <div className="bg-gradient-to-r from-[#1a0a00] via-[#2d1200] to-[#1c1c1e] rounded-xl px-5 py-3.5 flex items-center gap-5 flex-wrap sm:flex-nowrap border-l-4 border-[#EA580C]">
      {/* Percentage + objetivo */}
      <div className="flex items-baseline gap-2 shrink-0">
        <span
          className="text-3xl font-black leading-none"
          style={{ color: hasGoals && hasRealData && pct > 0 ? '#EA580C' : undefined }}
        >
          <span className={hasGoals && hasRealData && pct > 0 ? '' : 'text-white/40'}>
            {pct}
          </span>
        </span>
        <span className="text-lg font-bold text-white/50">%</span>
      </div>

      {/* Bar + label */}
      <div className="flex-1 min-w-0">
        <p className="text-xs mb-1 truncate" style={{ color: '#ffffff' }}>
          {translateObjective(objective)}
        </p>
        {!hasGoals && (
          <Link to="/onboarding/metas" className="text-xs text-[#EA580C] underline">
            Configurar metas →
          </Link>
        )}
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mt-1.5">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${pct}%`,
              backgroundColor: cfg.bar,
              boxShadow: pct > 0 ? `0 0 8px ${cfg.bar}40` : undefined,
            }}
          />
        </div>
      </div>

      {/* Meta / projeção */}
      <div className="flex items-center gap-5 shrink-0 text-xs text-white">
        <span>
          <span className="text-white/70">Projeção:{' '}</span>
          <strong className="text-white/80 font-bold">
            {hasGoals && hasRealData
              ? `${(goal.projected_value ?? 0).toLocaleString('pt-BR')} ${goal.unit}`
              : '--'}
          </strong>
        </span>
        <span>{daysRemaining} dias restantes</span>
      </div>

      {/* Status badge */}
      <div className="flex items-center shrink-0">
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
          {cfg.label}
        </span>
      </div>
    </div>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

const PROGRESS_COLORS: Record<'on_track' | 'at_risk' | 'off_track' | 'no_goals', string> = {
  on_track:  '#2ea043',
  at_risk:   '#e8a317',
  off_track: '#da3633',
  no_goals:  '#d1d5db',
};

function MetricCard({
  icon: Icon,
  label,
  value,
  sparkline,
  hasRealData,
  hasGoals,
  progressPct,
  progressStatus,
  progressLabel,
  tooltip,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sparkline?: Sparkline;
  hasRealData?: boolean;
  hasGoals?: boolean;
  progressPct?: number;
  progressStatus?: 'on_track' | 'at_risk' | 'off_track' | 'no_goals';
  progressLabel?: string;
  tooltip?: string;
}) {
  const showSpark = hasRealData && sparkline && sparkline.length >= 2;
  const sparkColor =
    showSpark && sparkline![sparkline!.length - 1].value >= sparkline![0].value
      ? '#e8631a'
      : '#da3633';
  const showProgress = hasRealData && progressPct !== undefined && progressStatus !== undefined;
  const isNoGoals = progressStatus === 'no_goals' || !hasGoals;
  const barColor = showProgress && !isNoGoals ? PROGRESS_COLORS[progressStatus!] : '#d1d5db';
  const barWidth = showProgress ? Math.min(100, progressPct!) : 0;

  // no_goals: no border color, no dot, no icon color
  const statusColor = hasRealData && progressStatus && !isNoGoals ? PROGRESS_COLORS[progressStatus] : undefined;

  return (
    <div
      className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3 relative"
      style={statusColor ? { borderTopColor: statusColor, borderTopWidth: 2 } : undefined}
    >
      {statusColor && (
        <span
          className="absolute top-3 right-3 w-2 h-2 rounded-full"
          style={{ backgroundColor: statusColor }}
        />
      )}
      <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" style={{ color: statusColor ?? '#9ca3af' }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500 leading-tight flex items-center gap-1">
          {label}
          {tooltip && (
            <UiTooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </UiTooltip>
          )}
        </p>
        <p
          className="text-lg md:text-xl font-black leading-tight"
          style={{ color: hasRealData ? '#EA580C' : '#111827' }}
        >
          {value}
        </p>
        {showProgress && (
          <div className="mt-1.5 space-y-1">
            {isNoGoals ? (
              <Link to="/onboarding/metas" className="text-xs text-[#EA580C] underline cursor-pointer">
                Defina uma meta →
              </Link>
            ) : progressLabel ? (
              <p className="text-xs text-muted-foreground">{progressLabel}</p>
            ) : null}
            <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${barWidth}%`, backgroundColor: barColor }}
              />
            </div>
          </div>
        )}
        {showSpark && !showProgress && (
          <div style={{ height: 40 }} className="mt-1 -mx-1">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkline} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={sparkColor}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Weekly Performance Chart ─────────────────────────────────────────────────

type IdealLinePoint = { date: string; real: number; ideal: number };

function WeeklyChart({
  data,
  hasRealData,
  idealLine,
}: {
  data: DailyMetric[];
  hasRealData: boolean;
  idealLine?: IdealLinePoint[];
}) {
  const fmt = (d: string) => {
    const [, m, day] = d.split('-');
    return `${parseInt(day, 10)}/${m}`;
  };

  const isEmpty = !hasRealData || data.length === 0;
  const hasIdealLine = !isEmpty && idealLine && idealLine.length > 0;

  // When ideal_line data is available use it as source (fields: date, real, ideal)
  // Otherwise fall back to dailyData with field "conversions"
  const chartData: object[] = hasIdealLine
    ? idealLine!
    : isEmpty
      ? Array.from({ length: 7 }, (_, i) => ({ date: `dia ${i + 1}`, conversions: 0 }))
      : data;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4 h-full">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Desempenho da Semana</h3>
        <p className="text-xs text-gray-400 mt-0.5">Clientes conquistados nos últimos 7 dias</p>
      </div>

      <div className="relative" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 4, left: -24, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tickFormatter={isEmpty ? (v) => v : fmt}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            {!isEmpty && (
              <Tooltip
                contentStyle={{
                  background: '#1c1c1e',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 12,
                }}
                formatter={(val, name) => [
                  `${Number(val).toLocaleString('pt-BR')} clientes`,
                  name === 'ideal' ? 'Projeção ideal' : 'Realizado',
                ]}
                labelFormatter={(label) => fmt(String(label))}
              />
            )}
            <Line
              type="monotone"
              dataKey={hasIdealLine ? 'real' : 'conversions'}
              stroke={isEmpty ? '#e5e7eb' : '#e8631a'}
              strokeWidth={isEmpty ? 1.5 : 2.5}
              dot={isEmpty ? false : { r: 3, fill: '#e8631a', strokeWidth: 0 }}
              activeDot={isEmpty ? false : { r: 5, fill: '#e8631a', strokeWidth: 0 }}
              isAnimationActive={!isEmpty}
            />
            {hasIdealLine && (
              <Line
                type="monotone"
                dataKey="ideal"
                stroke="#d1d5db"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>

        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/90 border border-gray-200 rounded-lg px-4 py-2 shadow-sm text-center">
              <p className="text-xs font-semibold text-gray-400">Aguardando dados do Meta Ads</p>
            </div>
          </div>
        )}
      </div>

      {hasIdealLine && (
        <div className="flex items-center gap-4 pt-1">
          <span className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-3 h-0.5 rounded-full bg-[#e8631a] inline-block" />
            Realizado
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-3 border-t border-dashed border-gray-400 inline-block" />
            Projeção ideal
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Fury Alerts ─────────────────────────────────────────────────────────────

const ALERT_CONFIG: Record<FuryAlert['type'], { bg: string; icon: string }> = {
  cpa_high:  { bg: 'bg-orange-50', icon: 'text-orange-500' },
  roas_low:  { bg: 'bg-red-50',    icon: 'text-red-500'    },
  spend_low: { bg: 'bg-orange-50', icon: 'text-orange-500' },
};

function FuryAlerts({ alerts }: { alerts: FuryAlert[] }) {
  const items = alerts.slice(0, 5);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4 h-full">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Alertas do FURY</h3>
        <p className="text-xs text-gray-400 mt-0.5">Desvios detectados nas campanhas</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-400">Nenhum alerta ativo</p>
            <p className="text-xs text-gray-300 mt-0.5">
              Nenhum desvio detectado nas campanhas
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((alert) => {
            const cfg = ALERT_CONFIG[alert.type];
            const sign = alert.deviation_pct >= 0 ? '+' : '';
            const description = `${alert.metric} ${formatAlertValue(alert.type, alert.current_value)} · meta ${formatAlertValue(alert.type, alert.target_value)} · ${sign}${Math.round(alert.deviation_pct)}%`;
            return (
              <div key={`${alert.campaignId}-${alert.type}`} className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <AlertTriangle className={`w-3.5 h-3.5 ${cfg.icon}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 leading-snug truncate">
                    {alert.campaignName}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{description}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Active Campaigns Table ───────────────────────────────────────────────────

function fmtBRL(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtRoas(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v === 0) return '-';
  return `${v.toFixed(2)}x`;
}

function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return Math.round(v).toLocaleString('pt-BR');
}

function ActiveCampaignsTable({
  campaigns,
}: {
  campaigns: ActiveCampaign[];
}) {
  const sorted = [...campaigns]
    .sort((a, b) => (b.metrics.conversions ?? -1) - (a.metrics.conversions ?? -1))
    .slice(0, 10);

  const topId = sorted[0]?.id;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Campanhas Ativas</h3>
          <p className="text-xs text-gray-400 mt-0.5">Ordenadas por performance</p>
        </div>
        <Link to="/campanhas" className="text-xs text-[#EA580C] font-medium hover:underline">
          Ver todas →
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-400 mb-2">Nenhuma campanha ativa no momento</p>
          <Link to="/campanhas" className="text-xs text-[#EA580C] font-medium hover:underline">
            Criar campanha →
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="pb-2 text-left text-xs font-semibold text-gray-400">Campanha</th>
                <th className="pb-2 text-right text-xs font-semibold text-gray-400">Investido</th>
                <th className="pb-2 text-right text-xs font-semibold text-gray-400">Clientes</th>
                <th className="pb-2 text-right text-xs font-semibold text-gray-400">Custo/Cliente</th>
                <th className="pb-2 text-right text-xs font-semibold text-gray-400">Retorno</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const isTop = c.id === topId && (c.metrics.conversions ?? 0) > 0;
                return (
                  <tr
                    key={c.id}
                    className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors ${isTop ? 'bg-orange-50' : ''}`}
                  >
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="truncate max-w-[200px] block text-gray-800"
                          title={c.name}
                        >
                          {c.name}
                        </span>
                        {isTop && (
                          <span className="shrink-0 text-xs text-[#EA580C] font-semibold">⭐ Top</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-right text-gray-700">{fmtBRL(c.metrics.spend)}</td>
                    <td className="py-2.5 text-right text-gray-700">{fmtInt(c.metrics.conversions)}</td>
                    <td className="py-2.5 text-right text-gray-700">{fmtBRL(c.metrics.cpa)}</td>
                    <td className="py-2.5 text-right text-gray-700">{fmtRoas(c.metrics.roas)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const [period, setPeriod] = useState<Period>('this_month');
  const { startDate, endDate } = getPeriodDates(period);

  const { data: goalsData, isFetching: fetchingGoals, isLoading: loadingGoals } = useGoalsProgress(startDate, endDate);
  const queryClient = useQueryClient();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('connected') === 'true') {
      queryClient.invalidateQueries({ queryKey: ['meta-connections'] });
      queryClient.invalidateQueries({ queryKey: ['goals-progress-v2'] });
      queryClient.invalidateQueries({ queryKey: ['metrics-summary'] });
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [location.search, queryClient]);

  // Meta connection status
  const { data: metaConnections } = useQuery<{ id: string }[]>({
    queryKey: ['meta-connections'],
    queryFn: async () => {
      try {
        const res = await api.get<{ success: boolean; data: { id: string }[] }>('/meta/connections');
        return Array.isArray(res.data.data) ? res.data.data : (Array.isArray(res.data) ? res.data as { id: string }[] : []);
      } catch {
        return [];
      }
    },
    staleTime: 30 * 1000,
    refetchOnMount: true,
  });

  const isMetaConnected = (metaConnections?.length ?? 0) > 0;

  // Metrics summary
  const { data: summaryRaw } = useQuery<MetricsSummary | null>({
    queryKey: ['metrics-summary', startDate, endDate],
    queryFn: async () => {
      try {
        const res = await api.get<{ success: boolean; data: { summary: MetricsSummary } }>('/metrics/summary', {
          params: { startDate, endDate },
        });
        return res.data.data.summary ?? null;
      } catch {
        return null;
      }
    },
    refetchInterval: 5 * 60 * 1000,
    placeholderData: null,
  });

  // Active campaigns for dashboard table
  const { data: activeCampaigns = [] } = useQuery<ActiveCampaign[]>({
    queryKey: ['campaigns-active-dashboard', startDate, endDate],
    queryFn: async () => {
      try {
        const res = await api.get<{ success: boolean; data: { campaigns: ActiveCampaign[] } }>(
          '/metrics/campaigns',
          { params: { status: 'ACTIVE', startDate, endDate, limit: 10 } }
        );
        return res.data.data.campaigns ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: [],
  });

  // Daily metrics for chart
  const { data: dailyData = [] } = useQuery<DailyMetric[]>({
    queryKey: ['metrics-daily-week', startDate, endDate],
    queryFn: async () => {
      try {
        const res = await api.get<{ success: boolean; data: DailyMetric[] }>('/metrics/daily', {
          params: { startDate, endDate },
        });
        return res.data.data ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: [],
  });

  const g = goalsData;
  const primaryGoal = g?.primary_goal ?? g?.goals?.[0];
  const objective = g?.objective ?? 'gerar_leads';

  const hasRealData = (g?.goals ?? []).some((goal) => goal.current_value > 0);
  const hasGoals = g?.hasGoals ?? false;

  const s = summaryRaw ?? { spend: 0, roas: 0, cpa: 0, conversions: 0 };

  // Sparkline + progress per goal metric
  const goalConversions = g?.goals?.find((goal) => goal.metric === 'conversions');
  const goalBudget      = g?.goals?.find((goal) => goal.metric === 'spend');
  const goalRoas        = g?.goals?.find((goal) => goal.metric === 'roas');

  const sparkConversions = goalConversions?.sparkline;
  const sparkBudget      = goalBudget?.sparkline;
  const sparkRoas        = goalRoas?.sparkline;

  const alerts   = g?.alerts ?? [];
  const idealLine = g?.ideal_line;

  if (loadingGoals) {
    return (
      <AppLayout>
        <div className="space-y-5 pb-8 animate-pulse">
          <PageHeader title="Dashboard" description="Carregando…" />
          <div className="h-14 bg-gray-100 rounded-xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl" />
            ))}
          </div>
          <div className="h-64 bg-gray-100 rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <TooltipProvider>
      <div className="space-y-5 pb-8">
        <PageHeader
          title="Dashboard"
          description={
            g?.objective
              ? `Objetivo: ${translateObjective(g.objective)} · ${g.days_remaining} dias restantes no mês`
              : `${g?.days_remaining ?? '—'} dias restantes no mês`
          }
          actions={
            <div className="flex items-center gap-3">
              {fetchingGoals && (
                <span className="text-xs text-text-tertiary animate-pulse">Atualizando…</span>
              )}
              <PeriodSelector value={period} onChange={setPeriod} />
            </div>
          }
        />
        <p className="text-xs text-gray-400 -mt-3">{formatPeriodLabel(startDate, endDate)}</p>

        {/* ── Meta connection banner ───────────────────────────────────────── */}
        {!isMetaConnected && <MetaBanner />}

        {/* ── Hero strip ──────────────────────────────────────────────────── */}
        {primaryGoal && (
          <HeroStrip
            goal={primaryGoal}
            objective={objective}
            daysRemaining={g?.days_remaining ?? 0}
            hasRealData={hasRealData}
            hasGoals={hasGoals}
          />
        )}

        {/* ── Metrics grid ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={Users}
            label="Clientes"
            value={hasRealData ? s.conversions.toLocaleString('pt-BR') : '--'}
            sparkline={sparkConversions}
            hasRealData={hasRealData}
            hasGoals={hasGoals}
            progressPct={goalConversions?.progress_pct}
            progressStatus={goalConversions?.status}
            progressLabel={hasGoals && goalConversions ? `${Math.round(goalConversions.progress_pct)}% da meta mensal` : undefined}
            tooltip="Inclui resultados de campanhas ativas e pausadas no período selecionado"
          />
          <MetricCard
            icon={DollarSign}
            label="Investimento Total"
            value={
              hasRealData
                ? `R$ ${s.spend.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                : '--'
            }
            sparkline={sparkBudget}
            hasRealData={hasRealData}
            hasGoals={hasGoals}
            progressPct={goalBudget?.progress_pct}
            progressStatus={goalBudget?.status}
            progressLabel={hasGoals && goalBudget ? `${Math.round(goalBudget.progress_pct)}% do orçamento` : undefined}
          />
          <MetricCard
            icon={ShoppingBag}
            label="Custo por Cliente"
            value={
              hasRealData
                ? `R$ ${s.cpa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '--'
            }
          />
          <MetricCard
            icon={TrendingUp}
            label="Retorno do Investimento"
            value={hasRealData && s.roas > 0 ? `${s.roas.toFixed(1)}x` : '--'}
            sparkline={sparkRoas}
            hasRealData={hasRealData}
            hasGoals={hasGoals}
            progressPct={goalRoas?.progress_pct}
            progressStatus={goalRoas?.status}
            progressLabel={hasGoals && goalRoas && s.roas > 0 ? `${Math.round(goalRoas.progress_pct)}% da meta de retorno` : undefined}
          />
        </div>

        {/* ── Bottom section: chart + alerts ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Weekly performance chart (60% = 3 of 5 cols) */}
          <div className="lg:col-span-3">
            <WeeklyChart data={dailyData} hasRealData={hasRealData} idealLine={idealLine} />
          </div>

          {/* Fury alerts (40% = 2 of 5 cols) */}
          <div className="lg:col-span-2">
            <FuryAlerts alerts={alerts} />
          </div>
        </div>

        {/* ── Active campaigns table ────────────────────────────────────────── */}
        <div className="mt-5">
          <ActiveCampaignsTable campaigns={activeCampaigns} />
        </div>
      </div>
      </TooltipProvider>
    </AppLayout>
  );
}
