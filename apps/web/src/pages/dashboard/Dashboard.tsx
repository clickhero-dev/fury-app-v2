import { useQuery } from '@tanstack/react-query';
import { Brain, TrendingUp, DollarSign, Target, ShoppingCart } from 'lucide-react';
import {
  AppLayout,
  MetricCard,
  PageHeader,
  LoadingSpinner,
  EmptyState,
  InsightCard,
  ProgressGoal,
  StatusBadge,
} from '@/components';
import api from '@/lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetricsSummary {
  spend: number;
  roas: number;
  cpa: number;
  conversions: number;
  impressions: number;
  clicks: number;
}

interface GoalsProgress {
  goal: { objective: string; monthlyBudget: number; targetCpa: number };
  current: { spend: number; roas: number; cpa: number };
  progressPercent: number;
  onTrack: boolean;
}

interface Insight {
  type: string;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  expectedImpact?: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  metrics: { roas?: number; cpa?: number; spend?: number };
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

const MOCK_SUMMARY: MetricsSummary = {
  spend: 4850,
  roas: 3.2,
  cpa: 48.5,
  conversions: 100,
  impressions: 145200,
  clicks: 3840,
};

const MOCK_PROGRESS: GoalsProgress = {
  goal: { objective: 'aumentar_vendas', monthlyBudget: 8000, targetCpa: 50 },
  current: { spend: 4850, roas: 3.2, cpa: 48.5 },
  progressPercent: 61,
  onTrack: true,
};

const MOCK_INSIGHTS: Insight[] = [
  {
    type: 'budget_adjustment',
    priority: 'high',
    title: 'Aumentar orçamento da campanha top',
    description: 'Sua melhor campanha tem ROAS de 5.8x e ainda tem espaço para escalar.',
    expectedImpact: 'Potencial de +30% em conversões',
  },
  {
    type: 'campaign_pause',
    priority: 'medium',
    title: 'Pausar campanha com CPA alto',
    description: 'A campanha Prospecção Fria está com CPA 77% acima da meta.',
    expectedImpact: 'Redução de R$ 120/dia em desperdício',
  },
];

const MOCK_CAMPAIGNS: Campaign[] = [
  { id: '1', name: 'Campanha Verão 2026', status: 'active', metrics: { roas: 5.8, cpa: 32.5, spend: 1800 } },
  { id: '2', name: 'Prospecção Fria', status: 'active', metrics: { roas: 1.2, cpa: 86.2, spend: 1200 } },
  { id: '3', name: 'Retargeting DPA', status: 'paused', metrics: { roas: 3.5, cpa: 45.8, spend: 600 } },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OBJECTIVES: Record<string, string> = {
  aumentar_vendas: 'Aumentar Vendas',
  gerar_leads: 'Gerar Leads',
  aumentar_awareness: 'Aumentar Awareness',
  maximizar_roas: 'Maximizar ROAS',
  reduzir_cpa: 'Reduzir CPA',
};

function translateObjective(key?: string) {
  return (key && OBJECTIVES[key]) ?? key ?? 'Objetivo';
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useQuery<MetricsSummary>({
    queryKey: ['metrics-summary'],
    queryFn: async () => {
      try {
        return await api.get('/metrics/summary').then((r) => r.data);
      } catch {
        return MOCK_SUMMARY;
      }
    },
    refetchInterval: 30000,
    placeholderData: MOCK_SUMMARY,
  });

  const { data: progress } = useQuery<GoalsProgress>({
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

  const { data: insightsData } = useQuery<{ insights?: Insight[] } | Insight[]>({
    queryKey: ['fury-insights'],
    queryFn: async () => {
      try {
        return await api.get('/fury/insights').then((r) => r.data);
      } catch {
        return { insights: MOCK_INSIGHTS };
      }
    },
    placeholderData: { insights: MOCK_INSIGHTS },
  });

  const { data: campaignsData } = useQuery<Campaign[]>({
    queryKey: ['campaigns-top'],
    queryFn: async () => {
      try {
        return await api.get('/metrics/campaigns?limit=3').then((r) => r.data);
      } catch {
        return MOCK_CAMPAIGNS;
      }
    },
    placeholderData: MOCK_CAMPAIGNS,
  });

  const s = summary ?? MOCK_SUMMARY;
  const p = progress ?? MOCK_PROGRESS;

  const insights: Insight[] = Array.isArray(insightsData)
    ? insightsData
    : (insightsData as { insights?: Insight[] })?.insights ?? MOCK_INSIGHTS;

  const campaigns = campaignsData ?? MOCK_CAMPAIGNS;

  const objectiveLabel = translateObjective(p.goal?.objective);

  return (
    <AppLayout>
      <div className="space-y-8">
        <PageHeader
          title="Dashboard"
          description={`Objetivo atual: ${objectiveLabel}`}
        />

        {/* ── Metric Cards ─────────────────────────────────────────────── */}
        {loadingSummary ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="ROAS"
              value={`${s.roas.toFixed(1)}x`}
              change={12}
              changeLabel="vs. semana passada"
              icon={<TrendingUp className="w-5 h-5" />}
              trend="up"
            />
            <MetricCard
              label="CPA"
              value={`R$ ${fmt(s.cpa)}`}
              change={-8}
              changeLabel="vs. semana passada"
              icon={<Target className="w-5 h-5" />}
              trend="down"
            />
            <MetricCard
              label="Investido"
              value={`R$ ${s.spend.toLocaleString('pt-BR')}`}
              icon={<DollarSign className="w-5 h-5" />}
            />
            <MetricCard
              label="Conversões"
              value={s.conversions.toLocaleString('pt-BR')}
              icon={<ShoppingCart className="w-5 h-5" />}
            />
          </div>
        )}

        {/* ── Progress Goal ─────────────────────────────────────────────── */}
        <ProgressGoal
          label={`Meta do mês: ${objectiveLabel}`}
          progressPercent={p.progressPercent}
          onTrack={p.onTrack}
          currentLabel={`R$ ${(p.current?.spend ?? 0).toLocaleString('pt-BR')}`}
          targetLabel={`R$ ${(p.goal?.monthlyBudget ?? 0).toLocaleString('pt-BR')}`}
        />

        {/* ── FURY Insights ─────────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#FEF0E7] flex items-center justify-center">
              <Brain className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">Insights do FURY</h3>
              <p className="text-xs text-text-secondary">Sugestões geradas pela IA com base na sua performance</p>
            </div>
          </div>

          {insights.length === 0 ? (
            <div className="border border-border rounded-xl">
              <EmptyState
                title="A IA ainda está analisando suas campanhas"
                description="Os insights aparecerão aqui assim que houver dados suficientes para análise."
              />
            </div>
          ) : (
            <div className="space-y-3">
              {insights.slice(0, 3).map((insight, i) => (
                <InsightCard key={`${insight.type}-${i}`} {...insight} />
              ))}
            </div>
          )}
        </section>

        {/* ── Top Campanhas ─────────────────────────────────────────────── */}
        <section className="space-y-4">
          <h3 className="text-base font-bold text-text-primary">Top Campanhas</h3>

          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Nome
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    ROAS
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    CPA
                  </th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    Investido
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-secondary transition-colors">
                    <td className="px-5 py-3.5 font-medium text-text-primary">{c.name}</td>
                    <td className="px-5 py-3.5">
                      <StatusBadge
                        status={
                          c.status === 'active' || c.status === 'paused'
                            ? (c.status as 'active' | 'paused')
                            : 'pending'
                        }
                      />
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-text-primary">
                      {(c.metrics?.roas ?? 0).toFixed(1)}x
                    </td>
                    <td className="px-5 py-3.5 text-right text-text-secondary">
                      R$ {fmt(c.metrics?.cpa ?? 0)}
                    </td>
                    <td className="px-5 py-3.5 text-right text-text-secondary">
                      R$ {(c.metrics?.spend ?? 0).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
