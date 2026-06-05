import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components';
import { useCampaignInsights, type InsightsDateRange, type DailyInsight } from '@/hooks/useCampaignInsights';

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}


function fmtInt(value: number): string {
  return value.toLocaleString('pt-BR');
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

// ── Aggregation ───────────────────────────────────────────────────────────────

function aggregate(ts: DailyInsight[]) {
  const spend = ts.reduce((s, d) => s + d.spend, 0);
  const clicks = ts.reduce((s, d) => s + d.clicks, 0);
  const impressions = ts.reduce((s, d) => s + d.impressions, 0);
  const conversions = ts.reduce((s, d) => s + d.conversions, 0);
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpa = conversions > 0 ? spend / conversions : null;
  return { spend, clicks, impressions, conversions, ctr, cpa };
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cfg =
    s === 'ACTIVE'
      ? { label: 'Ativa', cls: 'bg-green-100 text-green-700' }
      : s === 'PAUSED'
      ? { label: 'Pausada', cls: 'bg-yellow-100 text-yellow-700' }
      : { label: 'Arquivada', cls: 'bg-gray-100 text-gray-500' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded-xl border border-border px-5 py-4 space-y-1">
      <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-black text-text-primary">{value}</p>
    </div>
  );
}

// ── Date range tabs ───────────────────────────────────────────────────────────

const DATE_RANGES: { value: InsightsDateRange; label: string }[] = [
  { value: 'last_7d', label: '7 dias' },
  { value: 'last_30d', label: '30 dias' },
  { value: 'last_90d', label: '90 dias' },
];

// ── Custom tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-xl shadow-lg px-4 py-3 text-sm space-y-1 min-w-[160px]">
      <p className="font-semibold text-text-primary mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-text-secondary">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            {entry.name}
          </span>
          <span className="font-semibold text-text-primary">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function InsightsCampanha() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<InsightsDateRange>('last_7d');

  const { data, isLoading, isError } = useCampaignInsights(id, dateRange);

  const totals = data ? aggregate(data.timeseries) : null;

  const chartData = (data?.timeseries ?? []).map((d) => ({
    date: fmtDate(d.date),
    'Investimento (R$)': parseFloat(d.spend.toFixed(2)),
    Cliques: d.clicks,
  }));

  return (
    <AppLayout
      header={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/campanhas')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          {data && (
            <>
              <span className="text-border">·</span>
              <h2 className="text-lg font-bold text-text-primary truncate max-w-[320px]">
                {data.campaign.name}
              </h2>
              <StatusBadge status={data.campaign.status} />
            </>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            Não foi possível carregar os dados desta campanha. Tente novamente.
          </div>
        )}

        {/* Content */}
        {data && totals && (
          <>
            {/* Metric cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Card label="Investimento" value={fmtBRL(totals.spend)} />
              <Card label="Retorno sobre Investimento" value="--" />
              <Card label="Custo por Resultado" value={totals.cpa != null ? fmtBRL(totals.cpa) : '--'} />
              <Card label="Resultados" value={fmtInt(totals.conversions)} />
              <Card label="Cliques" value={fmtInt(totals.clicks)} />
            </div>

            {/* Date range selector + chart */}
            <div className="bg-surface rounded-xl border border-border p-6 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="text-sm font-semibold text-text-primary">Desempenho ao longo do tempo</h3>
                <div className="inline-flex rounded-lg border border-border bg-surface-secondary p-0.5 gap-0.5">
                  {DATE_RANGES.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDateRange(opt.value)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                        dateRange === opt.value
                          ? 'bg-white text-text-primary shadow-sm'
                          : 'text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {chartData.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-sm text-text-secondary">
                  Nenhum dado disponível para o período selecionado
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EA580C" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#EA580C" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorCliques" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.12} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#9CA3AF' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="spend"
                      orientation="left"
                      tick={{ fontSize: 11, fill: '#9CA3AF' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `R$${v}`}
                    />
                    <YAxis
                      yAxisId="clicks"
                      orientation="right"
                      tick={{ fontSize: 11, fill: '#9CA3AF' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                    />
                    <Area
                      yAxisId="spend"
                      type="monotone"
                      dataKey="Investimento (R$)"
                      stroke="#EA580C"
                      strokeWidth={2}
                      fill="url(#colorSpend)"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                    <Area
                      yAxisId="clicks"
                      type="monotone"
                      dataKey="Cliques"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      fill="url(#colorCliques)"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
