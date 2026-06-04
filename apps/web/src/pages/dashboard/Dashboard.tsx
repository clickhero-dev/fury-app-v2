import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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
  Wifi,
  WifiOff,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { AppLayout, PageHeader } from '@/components';
import api from '@/lib/api';
import { useGoalsProgress, translateObjective, type FuryAlert } from '@/hooks/useGoalsProgress';
import { useFurySSE } from '@/hooks/useFurySSE';

// ─── Types ────────────────────────────────────────────────────────────────────

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

function isoDateRange(daysBack: number): { startDate: string; endDate: string } {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - daysBack);
  return {
    startDate: start.toISOString().split('T')[0],
    endDate: today.toISOString().split('T')[0],
  };
}

function formatAlertValue(type: FuryAlert['type'], value: number) {
  if (type === 'roas_low') return `${value.toFixed(1)}x`;
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  on_track: { label: 'No caminho', bg: 'bg-[#dff3e4]', text: 'text-[#2ea043]', bar: '#2ea043' },
  at_risk:  { label: 'Em risco',   bg: 'bg-[#fff4d6]', text: 'text-[#e8a317]', bar: '#e8a317' },
  off_track: { label: 'Fora da meta', bg: 'bg-[#fde8e7]', text: 'text-[#da3633]', bar: '#da3633' },
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
  isConnected,
  hasRealData,
}: {
  goal: NonNullable<ReturnType<typeof useGoalsProgress>['data']>['primary_goal'];
  objective: string;
  daysRemaining: number;
  isConnected: boolean;
  hasRealData: boolean;
}) {
  const cfg = hasRealData ? STATUS_CONFIG[goal.status] : NO_DATA_CFG;
  const pct = hasRealData ? Math.min(100, goal.progress_pct ?? 0) : 0;

  return (
    <div className="bg-gradient-to-r from-[#1c1c1e] to-[#2a2a2e] rounded-xl px-5 py-3.5 flex items-center gap-5 flex-wrap sm:flex-nowrap">
      {/* Percentage + objetivo */}
      <div className="flex items-baseline gap-2 shrink-0">
        <span className="text-3xl font-black text-white leading-none">
          {hasRealData ? pct : <span className="text-white/40">--</span>}
        </span>
        <span className="text-lg font-bold text-white/50">%</span>
      </div>

      {/* Bar + label */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white/50 mb-1.5 truncate">
          {translateObjective(objective)}
        </p>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${pct}%`, backgroundColor: cfg.bar }}
          />
        </div>
      </div>

      {/* Meta / projeção */}
      <div className="flex items-center gap-5 shrink-0 text-xs text-white/50">
        <span>
          Projeção:{' '}
          <strong className="text-white/80 font-bold">
            {hasRealData
              ? `${(goal.projected_value ?? 0).toLocaleString('pt-BR')} ${goal.unit}`
              : '--'}
          </strong>
        </span>
        <span>{daysRemaining} dias restantes</span>
      </div>

      {/* Status badge + conexão */}
      <div className="flex items-center gap-3 shrink-0">
        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
          {cfg.label}
        </span>
        {isConnected ? (
          <span title="SSE ativo" className="flex items-center gap-1 text-[#2ea043] text-xs">
            <Wifi className="w-3.5 h-3.5" />
          </span>
        ) : (
          <span title="Atualiza a cada 5 min" className="text-white/30">
            <WifiOff className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  sparkline,
  hasRealData,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sparkline?: Sparkline;
  hasRealData?: boolean;
}) {
  const showSpark = hasRealData && sparkline && sparkline.length >= 2;
  const sparkColor =
    showSpark && sparkline![sparkline!.length - 1].value >= sparkline![0].value
      ? '#e8631a'
      : '#da3633';

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-gray-400" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
        <p className="text-xl font-black text-gray-900 leading-tight">{value}</p>
        {showSpark && (
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

function WeeklyChart({
  data,
  hasRealData,
}: {
  data: DailyMetric[];
  hasRealData: boolean;
}) {
  const fmt = (d: string) => {
    const [, m, day] = d.split('-');
    return `${parseInt(day, 10)}/${m}`;
  };

  const isEmpty = !hasRealData || data.length === 0;

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm space-y-4 h-full">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Desempenho da Semana</h3>
        <p className="text-xs text-gray-400 mt-0.5">Clientes conquistados nos últimos 7 dias</p>
      </div>

      <div className="relative" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={isEmpty ? Array.from({ length: 7 }, (_, i) => ({ date: `dia ${i + 1}`, conversions: 0 })) : data}
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
                formatter={(val) => [`${Number(val).toLocaleString('pt-BR')} clientes`, 'Clientes']}
                labelFormatter={(label) => fmt(String(label))}
              />
            )}
            <Line
              type="monotone"
              dataKey="conversions"
              stroke={isEmpty ? '#e5e7eb' : '#e8631a'}
              strokeWidth={isEmpty ? 1.5 : 2.5}
              dot={isEmpty ? false : { r: 3, fill: '#e8631a', strokeWidth: 0 }}
              activeDot={isEmpty ? false : { r: 5, fill: '#e8631a', strokeWidth: 0 }}
              isAnimationActive={!isEmpty}
            />
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
              Todas as campanhas estão dentro das metas
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

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { data: goalsData, isFetching: fetchingGoals, isLoading: loadingGoals } = useGoalsProgress();
  const { isConnected } = useFurySSE();

  // Metrics summary
  const { data: summaryRaw } = useQuery<MetricsSummary | null>({
    queryKey: ['metrics-summary'],
    queryFn: async () => {
      try {
        const res = await api.get<{ success: boolean; data: { summary: MetricsSummary } }>('/metrics/summary');
        return res.data.data.summary ?? null;
      } catch {
        return null;
      }
    },
    refetchInterval: 5 * 60 * 1000,
    placeholderData: null,
  });

  // Daily metrics for weekly chart
  const { startDate, endDate } = isoDateRange(6);
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

  const s = summaryRaw ?? { spend: 0, roas: 0, cpa: 0, conversions: 0 };

  // Sparkline data per goal metric
  const sparkConversions = g?.goals?.find((goal) => goal.metric === 'conversions')?.sparkline;
  const sparkBudget      = g?.goals?.find((goal) => goal.metric === 'spend')?.sparkline;
  const sparkRoas        = g?.goals?.find((goal) => goal.metric === 'roas')?.sparkline;

  const alerts = g?.alerts ?? [];

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
      <div className="space-y-5 pb-8">
        <PageHeader
          title="Dashboard"
          description={
            g?.objective
              ? `Objetivo: ${translateObjective(g.objective)} · ${g.days_remaining} dias restantes no mês`
              : `${g?.days_remaining ?? '—'} dias restantes no mês`
          }
          actions={
            fetchingGoals
              ? <span className="text-xs text-text-tertiary animate-pulse">Atualizando…</span>
              : undefined
          }
        />

        {/* ── Meta connection banner ───────────────────────────────────────── */}
        {!hasRealData && <MetaBanner />}

        {/* ── Hero strip ──────────────────────────────────────────────────── */}
        {primaryGoal && (
          <HeroStrip
            goal={primaryGoal}
            objective={objective}
            daysRemaining={g?.days_remaining ?? 0}
            isConnected={isConnected}
            hasRealData={hasRealData}
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
          />
          <MetricCard
            icon={ShoppingBag}
            label="Custo por Venda"
            value={
              hasRealData
                ? `R$ ${s.cpa.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '--'
            }
          />
          <MetricCard
            icon={TrendingUp}
            label="Retorno do Investimento"
            value={hasRealData ? `${s.roas.toFixed(1)}x` : '--'}
            sparkline={sparkRoas}
            hasRealData={hasRealData}
          />
        </div>

        {/* ── Bottom section: chart + alerts ───────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Weekly performance chart (60% = 3 of 5 cols) */}
          <div className="lg:col-span-3">
            <WeeklyChart data={dailyData} hasRealData={hasRealData} />
          </div>

          {/* Fury alerts (40% = 2 of 5 cols) */}
          <div className="lg:col-span-2">
            <FuryAlerts alerts={alerts} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
