import { eq, desc, gte, and } from 'drizzle-orm';
import { db, campaigns, clientGoals, furyInsights } from '@fury/db';
import { claudeClient, CLAUDE_MODEL } from '../lib/claude.js';

interface CampaignMetrics {
  spend?: number;
  roas?: number;
  cpa?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
}

interface GoalData {
  value: number;
  mainProduct?: string;
  currentMonthlyRevenue?: number;
}

interface InsightPayload {
  type: 'budget_adjustment' | 'campaign_pause' | 'audience_expansion' | 'creative_refresh' | 'bid_strategy';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  expectedImpact: string;
  actionable: boolean;
}

interface FuryContext {
  goals: {
    objective: string;
    monthlyBudget: number;
    targetCpa: number;
    niche: string | null;
    mainProduct?: string;
    currentMonthlyRevenue?: number;
  };
  performance: {
    totalSpend: number;
    averageRoas: number;
    averageCpa: number;
    campaignCount: number;
    activeCampaigns: number;
    pausedCampaigns: number;
    topPerformerName: string | null;
    worstPerformerName: string | null;
    topPerformerId: string | null;
    worstPerformerId: string | null;
  };
  daysRemaining: number;
  previousInsightTypes: string[];
}

function buildContext(
  goal: typeof clientGoals.$inferSelect,
  allCampaigns: (typeof campaigns.$inferSelect)[],
  prevInsights: (typeof furyInsights.$inferSelect)[]
): FuryContext {
  const budgetData = (goal.monthlyBudget ?? {}) as GoalData;
  const cpaData = (goal.targetCpa ?? {}) as { value?: number };

  const activeCampaigns = allCampaigns.filter((c) => c.status === 'active');
  const pausedCampaigns = allCampaigns.filter((c) => c.status === 'paused');

  const getMetrics = (c: typeof campaigns.$inferSelect): CampaignMetrics =>
    (c.metrics ?? {}) as CampaignMetrics;

  const totalSpend = allCampaigns.reduce((sum, c) => sum + (getMetrics(c).spend ?? 0), 0);
  const roasValues = allCampaigns.map((c) => getMetrics(c).roas ?? 0).filter((v) => v > 0);
  const cpaValues = allCampaigns.map((c) => getMetrics(c).cpa ?? 0).filter((v) => v > 0);
  const averageRoas = roasValues.length ? roasValues.reduce((a, b) => a + b, 0) / roasValues.length : 0;
  const averageCpa = cpaValues.length ? cpaValues.reduce((a, b) => a + b, 0) / cpaValues.length : 0;

  const sorted = [...allCampaigns].sort((a, b) => (getMetrics(b).roas ?? 0) - (getMetrics(a).roas ?? 0));
  const topPerformer = sorted[0] ?? null;
  const worstPerformer = sorted[sorted.length - 1] ?? null;

  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysRemaining = Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    goals: {
      objective: goal.objective,
      monthlyBudget: budgetData.value ?? 0,
      targetCpa: cpaData.value ?? 0,
      niche: goal.niche,
      mainProduct: budgetData.mainProduct,
      currentMonthlyRevenue: budgetData.currentMonthlyRevenue,
    },
    performance: {
      totalSpend,
      averageRoas,
      averageCpa,
      campaignCount: allCampaigns.length,
      activeCampaigns: activeCampaigns.length,
      pausedCampaigns: pausedCampaigns.length,
      topPerformerName: topPerformer?.name ?? null,
      worstPerformerName: worstPerformer?.name ?? null,
      topPerformerId: topPerformer?.id ?? null,
      worstPerformerId: worstPerformer?.id ?? null,
    },
    daysRemaining,
    previousInsightTypes: prevInsights.map((i) => i.suggestionType),
  };
}

async function callClaude(context: FuryContext): Promise<InsightPayload[]> {
  const message = await claudeClient!.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: `Você é o Algoritmo FURY, um especialista em otimização de tráfego pago no Meta Ads.
Analise os dados de performance e metas do cliente e gere de 3 a 5 sugestões práticas e específicas.
Responda APENAS em JSON válido, sem texto adicional, no formato:
{
  "insights": [
    {
      "type": "budget_adjustment" | "campaign_pause" | "audience_expansion" | "creative_refresh" | "bid_strategy",
      "priority": "high" | "medium" | "low",
      "title": "título curto em português",
      "description": "explicação de 2-3 frases do que fazer e por quê",
      "expectedImpact": "impacto esperado em linguagem simples",
      "actionable": true | false
    }
  ]
}`,
    messages: [
      {
        role: 'user',
        content: `Analise os seguintes dados e gere insights:\n\n${JSON.stringify(context, null, 2)}`,
      },
    ],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  const parsed = JSON.parse(text);
  return parsed.insights as InsightPayload[];
}

function getMockInsights(context: FuryContext): InsightPayload[] {
  const budgetUsedPct = context.goals.monthlyBudget > 0
    ? (context.performance.totalSpend / context.goals.monthlyBudget) * 100
    : 0;
  const roasBelowTarget = context.performance.averageRoas < 2;

  return [
    {
      type: 'creative_refresh',
      priority: 'high',
      title: `Renovar criativos — ${context.goals.niche ?? 'seu nicho'}`,
      description: `ROAS médio de ${context.performance.averageRoas.toFixed(2)}x está abaixo da meta. Criativos com mais de 14 dias tendem a sofrer fadiga de audiência. Teste novos ângulos focados em ${context.goals.mainProduct ?? 'seu produto principal'}.`,
      expectedImpact: 'Melhoria de 15-30% no ROAS nas primeiras 72h após troca dos criativos.',
      actionable: true,
    },
    {
      type: budgetUsedPct > 80 ? 'budget_adjustment' : 'campaign_pause',
      priority: roasBelowTarget ? 'high' : 'medium',
      title: roasBelowTarget ? 'Redistribuir orçamento para campanhas rentáveis' : 'Pausar campanhas de baixo desempenho',
      description: `Com ${context.daysRemaining} dias restantes no mês e ${budgetUsedPct.toFixed(0)}% do orçamento consumido, concentre o budget na campanha de maior ROAS. Elimine desperdício nas campanhas com CPA acima de R$${(context.goals.targetCpa * 1.5).toFixed(0)}.`,
      expectedImpact: `Redução de até 20% no CPA médio mantendo o volume de conversões.`,
      actionable: true,
    },
    {
      type: 'audience_expansion',
      priority: 'medium',
      title: 'Expandir para lookalike 3-5% baseado em compradores',
      description: `O público atual de ${context.goals.niche ?? 'seu nicho'} pode estar saturado. Criar um lookalike de 3-5% dos melhores compradores dos últimos 30 dias pode descobrir novos segmentos qualificados. Use o público atual como controle.`,
      expectedImpact: 'Volume de leads/conversões pode crescer 25-40% sem degradar o CPA.',
      actionable: true,
    },
    {
      type: 'bid_strategy',
      priority: 'low',
      title: 'Testar estratégia de lances Cost Cap',
      description: `Com CPA médio de R$${context.performance.averageCpa.toFixed(2)} e meta de R$${context.goals.targetCpa}, mudar de Lowest Cost para Cost Cap em R$${(context.goals.targetCpa * 0.9).toFixed(0)} pode melhorar a consistência. Implemente apenas em campanhas com histórico > 50 conversões.`,
      expectedImpact: 'CPA mais previsível e dentro da meta em 7-10 dias de aprendizado.',
      actionable: context.performance.activeCampaigns > 0,
    },
  ];
}

export async function furyAnalyze(tenantId: string): Promise<(typeof furyInsights.$inferSelect)[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [goal, allCampaigns, prevInsights] = await Promise.all([
    db.query.clientGoals.findFirst({ where: eq(clientGoals.tenantId, tenantId) }),
    db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.tenantId, tenantId), gte(campaigns.createdAt, sevenDaysAgo))),
    db
      .select()
      .from(furyInsights)
      .where(eq(furyInsights.tenantId, tenantId))
      .orderBy(desc(furyInsights.createdAt))
      .limit(10),
  ]);

  if (!goal) {
    return [];
  }

  const context = buildContext(goal, allCampaigns, prevInsights);

  let rawInsights: InsightPayload[];
  try {
    rawInsights = claudeClient ? await callClaude(context) : getMockInsights(context);
  } catch (err) {
    console.warn('[FURY] Claude API error, falling back to mock:', (err as Error).message);
    rawInsights = getMockInsights(context);
  }

  if (allCampaigns.length === 0) {
    // No campaigns yet — return in-memory insights without persisting
    return rawInsights.map((insight, idx) => ({
      id: `mock-${idx}`,
      tenantId,
      campaignId: 'none',
      suggestionType: insight.type,
      suggestionData: insight as unknown as Record<string, unknown>,
      appliedAt: null,
      createdAt: new Date(),
    }));
  }

  const saved = await Promise.all(
    rawInsights.map(async (insight) => {
      // Associate with most relevant campaign based on insight type
      const campaignId =
        insight.type === 'campaign_pause' || insight.type === 'bid_strategy'
          ? (context.performance.worstPerformerId ?? allCampaigns[0].id)
          : (context.performance.topPerformerId ?? allCampaigns[0].id);

      const [row] = await db
        .insert(furyInsights)
        .values({
          tenantId,
          campaignId,
          suggestionType: insight.type,
          suggestionData: insight as unknown as Record<string, unknown>,
        })
        .returning();

      return row;
    })
  );

  return saved;
}
