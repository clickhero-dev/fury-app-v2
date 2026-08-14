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
import { ArrowLeft, Loader2, ImageIcon, FilmIcon, X } from 'lucide-react';
import {
  useCampaignInsights,
  type InsightsDateRange,
  type DailyInsight,
  type CampaignCreative,
} from '@/hooks/useCampaignInsights';

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
  return { spend, clicks, impressions, conversions, ctr };
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const cfg =
    s === 'ACTIVE'
      ? { label: 'Ativa', cls: 'bg-success-light text-success border border-success/20' }
      : s === 'PAUSED'
      ? { label: 'Pausada', cls: 'bg-warning-light text-warning border border-warning/20' }
      : { label: 'Arquivada', cls: 'bg-surface-secondary text-text-tertiary border border-border' };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface px-5 py-4 space-y-1">
      <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">{label}</p>
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
    <div className="bg-surface border border-border-light rounded-xl shadow-2xl px-4 py-3 text-sm space-y-1.5 min-w-[160px]">
      <p className="font-semibold text-text-primary mb-2 text-xs border-b border-border pb-1">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            {entry.name}
          </span>
          <span className="font-semibold text-xs text-text-primary">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Image/Video modal ─────────────────────────────────────────────────────────

function MediaModal({ creative, onClose }: { creative: CampaignCreative; onClose: () => void }) {
  const imgSrc = creative.imageUrl || creative.thumbnailUrl;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -right-3 z-10 bg-surface border border-border-light rounded-full p-1.5 text-text-primary shadow-xl hover:bg-surface-secondary transition-colors"
        >
          <X className="w-5 h-5 text-text-primary" />
        </button>
        {creative.isVideo && creative.videoUrl ? (
          <video
            src={creative.videoUrl}
            poster={imgSrc}
            controls
            autoPlay
            className="max-w-full max-h-[85vh] rounded-2xl border border-border-light shadow-2xl"
          />
        ) : imgSrc ? (
          <img
            src={imgSrc}
            alt={creative.name}
            className="max-w-full max-h-[85vh] rounded-2xl border border-border-light shadow-2xl object-contain"
          />
        ) : (
          <div className="bg-surface rounded-2xl border border-border-light p-12 flex items-center justify-center">
            <ImageIcon className="w-16 h-16 text-text-tertiary" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Creative card ─────────────────────────────────────────────────────────────

function CreativeCard({ creative, onSelect }: { creative: CampaignCreative; onSelect: () => void }) {
  const imgSrc = creative.imageUrl || creative.thumbnailUrl;
  return (
    <div
      className="rounded-2xl border border-border bg-surface overflow-hidden hover:border-border-light transition-all cursor-pointer group"
      onClick={onSelect}
    >
      <div className="relative aspect-square bg-surface-secondary flex items-center justify-center overflow-hidden">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={creative.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <ImageIcon className="w-10 h-10 text-text-tertiary" />
        )}
        {creative.isVideo && (
          <span className="absolute top-2.5 right-2.5 bg-black/70 backdrop-blur-md text-text-primary rounded-full px-2 py-0.5 text-[11px] font-semibold flex items-center gap-1 border border-border-light">
            <FilmIcon className="w-3 h-3" />
            Vídeo
          </span>
        )}
        <span
          className={`absolute top-2.5 left-2.5 w-2.5 h-2.5 rounded-full border-2 border-surface ${
            creative.status === 'ACTIVE'
              ? 'bg-success'
              : creative.status === 'PAUSED'
              ? 'bg-warning'
              : 'bg-text-tertiary'
          }`}
        />
      </div>

      <div className="px-4 py-3.5 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-brand/20 text-brand flex items-center justify-center text-[10px] font-bold shrink-0">
            {creative.name.charAt(0).toUpperCase()}
          </span>
          <p className="text-[13px] font-semibold text-text-primary truncate">{creative.name}</p>
        </div>
        {creative.headline && (
          <p className="text-xs font-medium text-text-primary line-clamp-1">{creative.headline}</p>
        )}
        {creative.primaryText && (
          <p className="text-[11px] text-text-tertiary leading-relaxed line-clamp-2">{creative.primaryText}</p>
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function InsightsCampanha() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<InsightsDateRange>('last_7d');
  const [selectedCreative, setSelectedCreative] = useState<CampaignCreative | null>(null);

  const { data, isLoading, isError } = useCampaignInsights(id, dateRange);

  const totals = data ? aggregate(data.timeseries) : null;

  const chartData = (data?.timeseries ?? []).map((d) => ({
    date: fmtDate(d.date),
    'Investimento (R$)': parseFloat(d.spend.toFixed(2)),
    Cliques: d.clicks,
  }));

  return (
    <div className="space-y-6">
      {/* Dynamic Navigation Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/campanhas')}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>
        {data && (
          <>
            <span className="text-text-tertiary/40">·</span>
            <h2 className="text-lg font-bold text-text-primary truncate max-w-md">
              {data.campaign.name}
            </h2>
            <StatusBadge status={data.campaign.status} />
          </>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-brand" />
        </div>
      )}

      {/* Error State */}
      {isError && !isLoading && (
        <div className="rounded-2xl border border-error/20 bg-error-light px-5 py-4 text-sm text-error">
          Não foi possível carregar os dados desta campanha. Tente novamente.
        </div>
      )}

      {/* Main Content */}
      {data && totals && (
        <>
          {/* Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Card label="Investimento" value={fmtBRL(totals.spend)} />
            <Card label="Pessoas" value={fmtInt(totals.conversions)} />
            <Card label="Cliques" value={fmtInt(totals.clicks)} />
          </div>

          {/* Chart Section */}
          <div className="rounded-2xl border border-border bg-surface p-6 space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-sm font-semibold text-text-primary">Desempenho ao longo do tempo</h3>
              <div className="inline-flex rounded-full border border-border bg-surface-secondary p-1 gap-1">
                {DATE_RANGES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDateRange(opt.value)}
                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
                      dateRange === opt.value
                        ? 'bg-brand text-text-primary shadow-sm'
                        : 'text-text-tertiary hover:text-text-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {chartData.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-sm text-text-tertiary">
                Nenhum dado disponível para o período selecionado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1E88A8" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#1E88A8" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCliques" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#CF6F03" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#CF6F03" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(236,237,239,0.08)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#8E939D' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    yAxisId="spend"
                    orientation="left"
                    tick={{ fontSize: 11, fill: '#8E939D' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `R$${v}`}
                  />
                  <YAxis
                    yAxisId="clicks"
                    orientation="right"
                    tick={{ fontSize: 11, fill: '#8E939D' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16, color: '#8E939D' }} />
                  <Area
                    yAxisId="spend"
                    type="monotone"
                    dataKey="Investimento (R$)"
                    stroke="#1E88A8"
                    strokeWidth={2}
                    fill="url(#colorSpend)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#1E88A8' }}
                  />
                  <Area
                    yAxisId="clicks"
                    type="monotone"
                    dataKey="Cliques"
                    stroke="#CF6F03"
                    strokeWidth={2}
                    fill="url(#colorCliques)"
                    dot={false}
                    activeDot={{ r: 4, fill: '#CF6F03' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Creatives Grid */}
          {data.creatives.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-text-primary">
                Criativos ({data.creatives.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {data.creatives.map((c) => (
                  <CreativeCard key={c.id} creative={c} onSelect={() => setSelectedCreative(c)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal View */}
      {selectedCreative && (
        <MediaModal creative={selectedCreative} onClose={() => setSelectedCreative(null)} />
      )}
    </div>
  );
}