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
  ShoppingBag,
  Radio,
  Info,
  MessageCircle,
  Bookmark,
  ArrowRight,
} from 'lucide-react';
import { AppLayout, PageHeader } from '@/components';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import api from '@/lib/api';
import { useGoalsProgress, translateObjective } from '@/hooks/useGoalsProgress';
import { type Period, getPeriodDates, formatPeriodLabel } from '@/lib/period-utils';
import { PeriodSelector } from '@/components/PeriodSelector';

// ─── Design tokens (ady) ──────────────────────────────────────────────────────

const C = {
  bg: '#0C0D0A',
  card: '#161814',
  cardAlt: '#1F211D',
  border: '#262824',
  text: '#ECEDEF',
  muted: '#9A9D96',
  faint: '#8A8D86',
  primary: '#1E88A8',
  spark: '#CF6F03',
  danger: '#da3633',
} as const;

// Casca de card do Painel: claro/escuro já embutidos, autocontida — basta usar `${SURFACE}`
// num card novo que ele já nasce correto nos dois temas. ady-decor escapa do bloco CSS
// genérico (index.css) que senão forçaria fundo/texto de modo claro aqui por cima do dark:.
// O conteúdo DE DENTRO do card (texto, ícones, etc.) ainda precisa do próprio par dark:/claro.
const SURFACE =
  'ady-decor rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_40px_-24px_rgba(15,23,42,0.12)] dark:border-[#262824] dark:bg-[#161814] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_18px_40px_-24px_rgba(0,0,0,0.7)]';

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

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  on_track: { label: 'No caminho', bg: 'bg-[#1E88A8]/15', text: 'text-[#1E88A8]', bar: C.primary },
  at_risk: { label: 'Em risco', bg: 'bg-[#CF6F03]/15', text: 'text-[#CF6F03]', bar: C.spark },
  off_track: { label: 'Fora da meta', bg: 'bg-[#da3633]/15', text: 'text-[#da3633]', bar: C.danger },
  no_goals: { label: 'Sem metas', bg: 'bg-[#1F211D]', text: 'text-[#9A9D96]', bar: C.border },
} as const;

const NO_DATA_CFG = { label: 'Sem dados', bg: 'bg-[#1F211D]', text: 'text-[#9A9D96]', bar: C.border };

function computeProgressPercent(current: number, target: number): number {
  return target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
}

function statusFromProgress(progressPercent: number): 'on_track' | 'at_risk' | 'off_track' {
  if (progressPercent >= 90) return 'on_track';
  if (progressPercent >= 60) return 'at_risk';
  return 'off_track';
}

// ─── Meta Banner ──────────────────────────────────────────────────────────────

function MetaBanner() {
  return (
    <div className="ady-decor flex flex-col gap-4 rounded-2xl border border-[#CF6F03]/30 bg-[#CF6F03]/[0.07] p-5 sm:flex-row sm:items-center">
      <span className="ady-decor grid size-10 shrink-0 place-items-center rounded-full bg-[#CF6F03]/15 text-[#CF6F03]">
        <Radio className="size-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">
          Conecte sua conta Meta Ads para ver seus dados reais
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          Os valores abaixo refletem apenas as metas configuradas — sem métricas reais ainda.
        </p>
      </div>

      <Link
        to="/integracoes"
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#CF6F03]/40 px-4 py-2 text-sm font-semibold text-[#9A4F02] dark:text-[#E08A2E] transition-colors hover:bg-[#CF6F03]/10"
      >
        Conectar agora <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

// ─── Compact Hero Strip (Modo Claro + Escuro Ajustados) ─────────────────────

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
  const pct =
    hasGoals && hasRealData ? computeProgressPercent(goal.current_value, goal.target_value) : 0;
  
  const statusKey = !hasGoals || !hasRealData ? 'no_goals' : statusFromProgress(pct);
  const cfg = STATUS_CONFIG[statusKey] ?? NO_DATA_CFG;

  return (
    <section className={`${SURFACE} p-6`}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-5 sm:flex sm:flex-wrap sm:justify-between">
        <div className="flex min-w-0 items-center gap-6">
          
          {/* Círculo com formato mantido em 100% arredondado nos dois modos */}
          <div 
          className="icon-meta-circle flex h-20 w-20 shrink-0 items-center justify-center border border-[#1E88A8]/40 bg-[#1E88A8]/10 text-xl font-bold tabular-nums text-[#17708A] dark:text-[#1E88A8] dark:bg-[#1E88A8]/20"
          style={{ borderRadius: '50%' }}
        >
            {pct}%
          </div>

          {/* Textos da Meta */}
          <div className="flex flex-col min-w-0 gap-1">
            <p className="truncate text-base font-bold text-slate-800 dark:text-[#ECEDEF]">
              <span className="text-sm font-semibold text-slate-500 dark:text-[#8A8D86]">Objetivo: </span>
              {translateObjective(objective)}
            </p>

            <p className="text-sm font-medium text-slate-600 dark:text-[#9A9D96]">
              {hasGoals ? (
                <>
                  Meta: {goal.target_value.toLocaleString('pt-BR')}{' '}
                  {goal.metric === 'conversions' ? 'pessoas' : goal.unit}
                </>
              ) : (
                'Sem meta definida'
              )}
            </p>

            <Link
              to="/configuracoes?tab=metas"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#17708A] dark:text-[#2A9BC0] transition-colors hover:underline"
            >
              Configurar metas <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>

        {/* Projeção e Status */}
        <div className="col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-[#9A9D96] sm:col-auto">
          <span>
            Projeção:{' '}
            <span className="font-semibold text-slate-800 dark:text-[#ECEDEF]">
              {hasGoals && hasRealData
                ? `${(goal.projected_value ?? 0).toLocaleString('pt-BR')} ${
                    goal.metric === 'conversions' ? 'pessoas' : goal.unit
                  }`
                : '—'}
            </span>
          </span>
          <span>{daysRemaining} dias restantes</span>

          {/* Badge de Status adaptável */}
          <span className="ady-decor rounded-full border border-[#1E88A8]/30 bg-[#1E88A8]/15 px-3 py-1 text-xs font-semibold text-[#0F4C5C] dark:text-[#2A9BC0]">
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Trilho e Barra de Progresso adaptados para Modo Claro e Escuro */}
      <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-[#262824]">
        <div
          className="progress-fill-bar h-full rounded-full bg-[#1E88A8] transition-all duration-500"
          style={{
            width: `${Math.max(pct, 3)}%`,
          }}
        />
      </div>
    </section>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

const PROGRESS_COLORS: Record<'on_track' | 'at_risk' | 'off_track' | 'no_goals', string> = {
  on_track: C.primary,
  at_risk: C.spark,
  off_track: C.danger,
  no_goals: C.border,
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
      ? C.primary
      : C.danger;
  const showProgress = hasRealData && progressPct !== undefined && progressStatus !== undefined;
  const isNoGoals = progressStatus === 'no_goals' || !hasGoals;
  const barColor = showProgress && !isNoGoals ? PROGRESS_COLORS[progressStatus!] : C.border;
  const barWidth = showProgress ? Math.min(100, progressPct!) : 0;

  return (
    <div className={`${SURFACE} p-5`}>
      <div className="flex items-center gap-2.5">
        <Icon className="size-[18px] shrink-0 text-[#17708A] dark:text-[#1E88A8]" />
        <p className="min-w-0 truncate text-sm text-slate-600 dark:text-[#9A9D96]">{label}</p>
        {tooltip && (
          <TooltipProvider>
            <UiTooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Sobre ${label}`}
                  className="text-slate-400 transition-colors hover:text-slate-800 dark:text-[#8A8D86] dark:hover:text-[#ECEDEF]"
                >
                  <Info className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-xs">
                {tooltip}
              </TooltipContent>
            </UiTooltip>
          </TooltipProvider>
        )}
      </div>

      <p className="mt-4 text-3xl font-semibold tabular-nums text-slate-900 dark:text-[#ECEDEF]">{value}</p>

      {showProgress ? (
        <div className="mt-3 space-y-2">
          {isNoGoals ? (
            <Link
              to="/configuracoes"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#17708A] dark:text-[#2A9BC0] hover:underline"
            >
              Defina uma meta <ArrowRight className="size-3" />
            </Link>
          ) : progressLabel ? (
            <p className="text-xs text-slate-600 dark:text-[#9A9D96]">{progressLabel}</p>
          ) : null}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-[#1F211D]">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: `${Math.max(barWidth, 2)}%`, backgroundColor: barColor }}
            />
          </div>
        </div>
      ) : showSpark ? (
        <div className="mt-3 h-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkline}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={sparkColor}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-500 dark:text-[#8A8D86]">
          {hasRealData ? 'No período' : 'Aguardando dados'}
        </p>
      )}
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

  const chartData: object[] = hasIdealLine
    ? idealLine!
    : isEmpty
      ? Array.from({ length: 7 }, (_, i) => ({ date: `dia ${i + 1}`, conversions: 0 }))
      : data;

  return (
    <section className={`${SURFACE} p-6`}>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-[#ECEDEF]">Desempenho da semana</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-[#9A9D96]">Pessoas alcançadas nos últimos 7 dias</p>

      <div className="relative mt-6 h-56">
        <div aria-hidden={isEmpty} className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={isEmpty && !hasIdealLine ? (v) => String(v) : fmt}
              tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
              tickLine={false}
              axisLine={false}
              width={44}
            />
            {!isEmpty && (
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-surface-secondary)',
                  border: '1px solid var(--color-border-light)',
                  borderRadius: 12,
                  fontSize: 12,
                  color: 'var(--color-text-primary)',
                }}
                labelStyle={{ color: 'var(--color-text-tertiary)' }}
                formatter={(val: number, name: string) => [
                  `${Number(val).toLocaleString('pt-BR')} pessoas`,
                  name === 'ideal' ? 'Projeção ideal' : 'Realizado',
                ]}
                labelFormatter={(label) => fmt(String(label))}
              />
            )}
            <Line
              type="monotone"
              dataKey={hasIdealLine ? 'real' : 'conversions'}
              stroke={C.primary}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: C.primary }}
            />
            {hasIdealLine && (
              <Line
                type="monotone"
                dataKey="ideal"
                stroke={C.spark}
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
        </div>

        {isEmpty && (
          <div className="absolute inset-0 grid place-items-center rounded-lg border border-dashed border-slate-200 bg-white/70 dark:border-[#262824] dark:bg-[#161814]/70">
            <p className="rounded-full bg-slate-100 px-4 py-1.5 text-xs text-slate-600 dark:bg-[#1F211D] dark:text-[#9A9D96]">
              Aguardando dados da sua conta de anúncios
            </p>
          </div>
        )}
      </div>

      {hasIdealLine && (
        <div className="mt-5 flex flex-wrap items-center gap-5 text-xs text-slate-600 dark:text-[#9A9D96]">
          <span className="inline-flex items-center gap-2">
            <span className="h-0.5 w-5 rounded-full bg-[#1E88A8]" />
            Realizado
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-0.5 w-5 rounded-full bg-[#CF6F03]" />
            Projeção ideal
          </span>
        </div>
      )}
    </section>
  );
}

// ─── Active Campaigns Table ───────────────────────────────────────────────────

function fmtBRL(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return Math.round(v).toLocaleString('pt-BR');
}

function ActiveCampaignsTable({ campaigns }: { campaigns: ActiveCampaign[] }) {
  const sorted = [...campaigns]
    .sort((a, b) => (b.metrics.conversions ?? -1) - (a.metrics.conversions ?? -1))
    .slice(0, 10);

  const topId = sorted[0]?.id;

  return (
    <section className={`${SURFACE} p-6`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-[#ECEDEF]">Campanhas ativas</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-[#9A9D96]">Ordenadas por resultado</p>
        </div>
        <Link
          to="/campanhas"
          className="shrink-0 text-sm font-medium text-[#17708A] dark:text-[#2A9BC0] hover:underline"
        >
          Ver todas
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 dark:border-[#262824] px-6 py-12 text-center">
          <p className="text-sm text-slate-600 dark:text-[#9A9D96]">Nenhuma campanha ativa agora</p>
          <Link
            to="/campanhas"
            className="text-sm font-medium text-[#17708A] dark:text-[#2A9BC0] hover:underline"
          >
            Criar campanha
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#262824] text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-[#8A8D86]">
                <th className="pb-3 pr-4 font-semibold">Campanha</th>
                <th className="pb-3 pr-4 text-right font-semibold">Investido</th>
                <th className="pb-3 pr-4 text-right font-semibold">Pessoas</th>
                <th className="pb-3 text-right font-semibold">Custo/Pessoa</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const isTop = c.id === topId && (c.metrics.conversions ?? 0) > 0;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 dark:border-[#262824]/70 transition-colors last:border-0 hover:bg-slate-50 dark:hover:bg-[#1F211D]/60"
                  >
                    <td className="py-3.5 pr-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-slate-900 dark:text-[#ECEDEF]">{c.name}</span>
                        {isTop && (
                          <span className="shrink-0 rounded-full bg-[#CF6F03]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9A4F02] dark:text-[#E08A2E]">
                            Top
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 pr-4 text-right tabular-nums text-slate-600 dark:text-[#9A9D96]">
                      {fmtBRL(c.metrics.spend)}
                    </td>
                    <td className="py-3.5 pr-4 text-right tabular-nums text-slate-900 dark:text-[#ECEDEF]">
                      {fmtInt(c.metrics.conversions)}
                    </td>
                    <td className="py-3.5 text-right tabular-nums text-slate-600 dark:text-[#9A9D96]">
                      {fmtBRL(c.metrics.cpa)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Instagram Engagement ──────────────────────────────────────────────────────

interface InstagramInsights {
  comments: number;
  saves: number;
  followers: number;
  period: { from: string; to: string };
}

function InstagramMetricCard({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`${SURFACE} p-5`}>
      <div className="flex items-center gap-2.5">
        <Icon className="size-[18px] shrink-0 text-[#17708A] dark:text-[#1E88A8]" />
        <p className="min-w-0 truncate text-sm text-slate-600 dark:text-[#9A9D96]">{label}</p>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function FollowersValue({ value }: { value: number }) {
  if (value > 0) {
    return (
      <p className="text-3xl font-semibold tabular-nums text-[#17708A] dark:text-[#1E88A8]">
        +{value.toLocaleString('pt-BR')}
      </p>
    );
  }
  if (value < 0) {
    return (
      <p className="text-3xl font-semibold tabular-nums text-[#da3633] dark:text-[#e8534f]">
        {value.toLocaleString('pt-BR')}
      </p>
    );
  }
  return <p className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-[#ECEDEF]">0</p>;
}

function InstagramEngagementSection({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['instagram-insights', startDate, endDate],
    queryFn: async () => {
      try {
        const res = await api.get<{ success: boolean; data: InstagramInsights | null }>(
          '/dashboard/instagram-insights',
          { params: { date_from: startDate, date_to: endDate } }
        );
        return res.data.data ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-[#ECEDEF]">Engajamento no Instagram</h2>
        <p className="mt-1 text-sm text-[#9A9D96]">Métricas orgânicas no período selecionado</p>
      </div>

      {!isLoading && data == null ? (
        <div
          className={`${SURFACE} flex flex-col items-center justify-center gap-2 px-6 py-14 text-center`}
        >
          <p className="text-sm text-slate-600 dark:text-[#9A9D96]">Conecte seu Instagram para ver as métricas</p>
          <Link
            to="/integracoes"
            className="inline-flex items-center gap-1 text-sm font-medium text-[#17708A] dark:text-[#2A9BC0] hover:underline"
          >
            Ir para integrações <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <InstagramMetricCard icon={MessageCircle} label="Comentários">
            <p className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-[#ECEDEF]">
              {(data?.comments ?? 0).toLocaleString('pt-BR')}
            </p>
          </InstagramMetricCard>
          <InstagramMetricCard icon={Bookmark} label="Salvamentos">
            <p className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-[#ECEDEF]">
              {(data?.saves ?? 0).toLocaleString('pt-BR')}
            </p>
          </InstagramMetricCard>
          <InstagramMetricCard icon={Users} label="Novos seguidores">
            <FollowersValue value={data?.followers ?? 0} />
          </InstagramMetricCard>
        </div>
      )}
    </section>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const [period, setPeriod] = useState<Period>('this_month');
  const { startDate, endDate } = getPeriodDates(period);

  const {
    data: goalsData,
    isFetching: fetchingGoals,
    isLoading: loadingGoals,
  } = useGoalsProgress(startDate, endDate);
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

  const { data: metaConnections } = useQuery<{ id: string }[]>({
    queryKey: ['meta-connections'],
    queryFn: async () => {
      try {
        const res = await api.get<{ success: boolean; data: { id: string }[] }>('/meta/connections');
        return Array.isArray(res.data.data)
          ? res.data.data
          : Array.isArray(res.data)
            ? (res.data as { id: string }[])
            : [];
      } catch {
        return [];
      }
    },
    staleTime: 30 * 1000,
    refetchOnMount: true,
  });

  const isMetaConnected = (metaConnections?.length ?? 0) > 0;

  const { data: summaryRaw } = useQuery({
    queryKey: ['metrics-summary', startDate, endDate],
    queryFn: async () => {
      try {
        const res = await api.get<{ success: boolean; data: { summary: MetricsSummary } }>(
          '/metrics/summary',
          { params: { startDate, endDate } }
        );
        return res.data.data.summary ?? null;
      } catch {
        return null;
      }
    },
    refetchInterval: 5 * 60 * 1000,
    placeholderData: null,
  });

  const { data: activeCampaigns = [] } = useQuery({
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

  const { data: dailyData = [] } = useQuery({
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

  const goalConversions = g?.goals?.find((goal) => goal.metric === 'conversions');
  const goalBudget = g?.goals?.find((goal) => goal.metric === 'spend');

  const conversionsProgressPct = goalConversions
    ? computeProgressPercent(goalConversions.current_value, goalConversions.target_value)
    : undefined;
  const conversionsStatus = !hasGoals
    ? 'no_goals'
    : conversionsProgressPct !== undefined
      ? statusFromProgress(conversionsProgressPct)
      : undefined;

  const sparkConversions = goalConversions?.sparkline;
  const sparkBudget = goalBudget?.sparkline;
  const idealLine = g?.ideal_line;

  const daysRemaining = Math.max(
    0,
    Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000)
  );

  if (loadingGoals) {
    return (
      <AppLayout>
        <div className="mx-auto w-full max-w-5xl space-y-10 px-6 py-10 sm:px-10 lg:py-14">
          <div className="h-9 w-48 animate-pulse rounded-lg bg-gray-200 dark:bg-[#1F211D]" />
          <div className="h-28 animate-pulse rounded-2xl bg-gray-200 dark:bg-[#1F211D]" />
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-200 dark:bg-[#1F211D]" />
            ))}
          </div>
          <div className="h-72 animate-pulse rounded-2xl bg-gray-200 dark:bg-[#1F211D]" />
        </div>
      </AppLayout>
    );
  }

  return (
  <AppLayout>
    <ErrorBoundary>
      {/* pt-2 reduz o topo ao mínimo, removendo a folga excessiva */}
      <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pt-2 pb-8 text-[#ECEDEF] sm:px-10">
        
        {/* Cabeçalho */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-[#ECEDEF]">Painel</h1>

          <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-[#8A8D86]">
            {formatPeriodLabel(startDate, endDate)}
          </span>

          <div className="flex shrink-0 items-center gap-3">
            {fetchingGoals && (
              <span className="text-xs text-[#8A8D86]">Atualizando…</span>
            )}
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>
        </div>

        {!isMetaConnected && <MetaBanner />}

        {primaryGoal && (
          <HeroStrip
            goal={primaryGoal}
            objective={objective}
            daysRemaining={daysRemaining}
            hasRealData={hasRealData}
            hasGoals={hasGoals}
          />
        )}

          <section className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              icon={Users}
              label="Clientes alcançados"
              value={hasRealData ? fmtInt(s.conversions) : '—'}
              sparkline={sparkConversions}
              hasRealData={hasRealData}
              hasGoals={hasGoals}
              progressPct={conversionsProgressPct}
              progressStatus={conversionsStatus}
              progressLabel={
                goalConversions
                  ? `${fmtInt(goalConversions.current_value)} de ${fmtInt(goalConversions.target_value)}`
                  : undefined
              }
              tooltip="Pessoas que realizaram a ação principal da sua campanha no período."
            />
            <MetricCard
              icon={DollarSign}
              label="Investimento total"
              value={hasRealData ? fmtBRL(s.spend) : '—'}
              sparkline={sparkBudget}
              hasRealData={hasRealData}
              hasGoals={hasGoals}
              tooltip="Total investido em anúncios no período selecionado."
            />
            <MetricCard
              icon={ShoppingBag}
              label="Custo por cliente"
              value={hasRealData ? fmtBRL(s.cpa) : '—'}
              hasRealData={hasRealData}
              hasGoals={hasGoals}
              tooltip="Quanto você gastou, em média, para conquistar cada cliente."
            />
          </section>

          <InstagramEngagementSection startDate={startDate} endDate={endDate} />

          <WeeklyChart data={dailyData} hasRealData={hasRealData} idealLine={idealLine} />

          <ActiveCampaignsTable campaigns={activeCampaigns} />
        </div>
      </ErrorBoundary>
    </AppLayout>
  );
}
