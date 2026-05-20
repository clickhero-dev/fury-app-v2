import Anthropic from '@anthropic-ai/sdk';
import { and, eq, gte } from 'drizzle-orm';
import { db, clientGoals, campaigns, furyInsights, performanceRules, performanceScores, ruleExecutions } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';

export type CampaignMetrics = {
  spend?: number;
  roas?: number;
  cpa?: number;
  ctr?: number;
  cpc?: number;
  impressions?: number;
  conversions?: number;
  budget?: number;
};

type MoneyJson = { amount?: number };

function centavosToReais(centavos: number): number {
  return centavos / 100;
}

function parseMoneyJson(json: unknown): number {
  const obj = json as MoneyJson | null | undefined;
  const amount = obj?.amount;
  if (amount === undefined || amount === null || Number.isNaN(Number(amount))) return 0;
  return centavosToReais(Math.round(Number(amount)));
}

function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function buildFallbackInsights() {
  return [
    {
      type: 'budget_optimization',
      title: 'Otimize seu orçamento',
      description: 'Concentre o orçamento nas campanhas com melhor ROAS para maximizar retorno.',
      priority: 'high',
    },
    {
      type: 'audience_expansion',
      title: 'Expanda seu público',
      description: 'Teste públicos semelhantes (Lookalike) aos seus melhores compradores.',
      priority: 'medium',
    },
    {
      type: 'creative_refresh',
      title: 'Renove seus criativos',
      description: 'Criativos com mais de 2 semanas tendem a sofrer fadiga de anúncio.',
      priority: 'medium',
    },
  ];
}

async function callClaudeForInsights(prompt: string): Promise<{ type: string; title: string; description: string; priority: string }[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('[FURY] ANTHROPIC_API_KEY não configurada — usando insights de fallback');
    return buildFallbackInsights();
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `Você é o FURY, um especialista em otimização de tráfego pago para Meta Ads.
Responda SEMPRE com um JSON válido no formato:
{
  "insights": [
    { "type": "string", "title": "string", "description": "string", "priority": "high|medium|low" }
  ]
}
Sem texto adicional fora do JSON.`,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Resposta da Claude sem JSON válido');

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.insights)) throw new Error('Campo insights ausente no JSON');

    return parsed.insights;
  } catch (err) {
    console.error('[FURY] Erro na Claude API:', err);
    return buildFallbackInsights();
  }
}

export async function furyAnalyze(tenantId: string) {
  // 1. Buscar metas reais
  const goals = await db.query.clientGoals.findFirst({
    where: eq(clientGoals.tenantId, tenantId),
  });

  if (!goals) {
    throw new AppError(400, 'GOALS_NOT_CONFIGURED', 'Configure suas metas antes de analisar');
  }

  const targetCpa = parseMoneyJson(goals.targetCpa);
  const monthlyBudget = parseMoneyJson(goals.monthlyBudget);

  // 2. Buscar campanhas dos últimos 7 dias
  const recentCampaigns = await db.query.campaigns.findMany({
    where: and(
      eq(campaigns.tenantId, tenantId),
      gte(campaigns.lastSyncedAt, subDays(new Date(), 7))
    ),
  });

  // 3. Calcular performance real
  const activeCampaigns = recentCampaigns.filter((c) => c.status === 'active');
  const totalSpend = activeCampaigns.reduce((sum, c) => sum + ((c.metrics as CampaignMetrics)?.spend || 0), 0);
  const averageRoas = activeCampaigns.length
    ? activeCampaigns.reduce((sum, c) => sum + ((c.metrics as CampaignMetrics)?.roas || 0), 0) / activeCampaigns.length
    : 0;
  const averageCpa = activeCampaigns.length
    ? activeCampaigns.reduce((sum, c) => sum + ((c.metrics as CampaignMetrics)?.cpa || 0), 0) / activeCampaigns.length
    : 0;

  const sortedByRoas = [...activeCampaigns].sort(
    (a, b) => ((b.metrics as CampaignMetrics)?.roas || 0) - ((a.metrics as CampaignMetrics)?.roas || 0)
  );
  const topPerformer = sortedByRoas[0];
  const worstPerformer = sortedByRoas[sortedByRoas.length - 1];

  // 4. Buscar insights anteriores para evitar repetição
  const previousInsights = await db.query.furyInsights.findMany({
    where: and(
      eq(furyInsights.tenantId, tenantId),
      gte(furyInsights.createdAt, subDays(new Date(), 3))
    ),
    limit: 5,
  });
  const previousTypes = previousInsights.map((i) => i.suggestionType);

  // 5. Montar prompt e chamar Claude
  let prompt: string;

  if (activeCampaigns.length === 0) {
    prompt = `Este cliente está no início de operação — ainda não há campanhas ativas nos últimos 7 dias.

Metas do cliente:
- Objetivo: ${goals.objective}
- Orçamento mensal: R$ ${monthlyBudget.toFixed(2)}
- CPA alvo: R$ ${targetCpa.toFixed(2)}
- Nicho: ${goals.niche || 'Não informado'}

Gere 3 insights iniciais estratégicos para quem está começando com tráfego pago no Meta Ads.
${previousTypes.length > 0 ? `NÃO repita estes tipos de insight já usados: ${previousTypes.join(', ')}` : ''}`;
  } else {
    prompt = `Análise de performance de campanhas Meta Ads:

Metas do cliente:
- Objetivo: ${goals.objective}
- Orçamento mensal: R$ ${monthlyBudget.toFixed(2)}
- CPA alvo: R$ ${targetCpa.toFixed(2)}
- Nicho: ${goals.niche || 'Não informado'}

Performance atual (últimos 7 dias):
- Campanhas ativas: ${activeCampaigns.length}
- Gasto total: R$ ${totalSpend.toFixed(2)}
- ROAS médio: ${averageRoas.toFixed(2)}
- CPA médio: R$ ${averageCpa.toFixed(2)}
- Melhor campanha: ${topPerformer ? `"${topPerformer.name}" (ROAS ${((topPerformer.metrics as CampaignMetrics)?.roas || 0).toFixed(2)})` : 'N/A'}
- Pior campanha: ${worstPerformer && worstPerformer !== topPerformer ? `"${worstPerformer.name}" (CPA R$ ${((worstPerformer.metrics as CampaignMetrics)?.cpa || 0).toFixed(2)})` : 'N/A'}

Gere 3 insights de otimização priorizando o que terá maior impacto nos resultados.
${previousTypes.length > 0 ? `NÃO repita estes tipos de insight já usados: ${previousTypes.join(', ')}` : ''}`;
  }

  const rawInsights = await callClaudeForInsights(prompt);

  // 6. Salvar insights no banco (só se houver campanhas, pois campaignId é NOT NULL)
  const savedInsights: typeof rawInsights = [];

  if (activeCampaigns.length > 0 && topPerformer) {
    for (const insight of rawInsights) {
      try {
        await db.insert(furyInsights).values({
          tenantId,
          campaignId: topPerformer.id,
          suggestionType: insight.type,
          suggestionData: {
            title: insight.title,
            description: insight.description,
            priority: insight.priority,
          },
        });
        savedInsights.push(insight);
      } catch (err) {
        console.error('[FURY] Erro ao salvar insight:', err);
        savedInsights.push(insight);
      }
    }
  }

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    hasCampaigns: activeCampaigns.length > 0,
    summary: {
      activeCampaigns: activeCampaigns.length,
      totalSpend,
      averageRoas,
      averageCpa,
      targetCpa,
      monthlyBudget,
    },
    insights: rawInsights,
  };
}

// ==================== Performance Scoring ====================

export function calculateScore(metrics: CampaignMetrics): number {
  const roas = metrics.roas ?? 0;
  const ctr = metrics.ctr ?? 0;
  const cpa = metrics.cpa ?? 0;
  const spend = metrics.spend ?? 0;
  const budget = metrics.budget ?? 0;

  // ROAS: 40 pts (ROAS 4.0 = full score)
  const roasScore = Math.min(roas / 4.0, 1) * 40;

  // CTR: 30 pts (CTR 3.0% = full score)
  const ctrScore = Math.min(ctr / 3.0, 1) * 30;

  // CPA: 20 pts (lower is better; CPA ≤ R$50 = full score)
  const cpaScore = cpa > 0 ? Math.max(0, Math.min(50 / cpa, 1)) * 20 : 0;

  // Budget utilization: 10 pts (70–90% = full score)
  let utilizationScore = 0;
  if (budget > 0 && spend > 0) {
    const utilization = spend / budget;
    if (utilization >= 0.7 && utilization <= 0.9) {
      utilizationScore = 10;
    } else if (utilization > 0.5) {
      utilizationScore = 5;
    }
  }

  return Math.round(roasScore + ctrScore + cpaScore + utilizationScore);
}

export function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

// ==================== Rule Evaluation ====================

type RuleCondition = typeof performanceRules.$inferSelect;

function evaluateCondition(field: string, operator: string, threshold: number, metrics: CampaignMetrics): boolean {
  const value = metrics[field as keyof CampaignMetrics] ?? 0;
  if (operator === 'gt') return (value as number) > threshold;
  if (operator === 'lt') return (value as number) < threshold;
  if (operator === 'eq') return (value as number) === threshold;
  return false;
}

export async function evaluateRules(tenantId: string, campaignId: string, metrics: CampaignMetrics): Promise<void> {
  const rules = await db.query.performanceRules.findMany({
    where: and(
      eq(performanceRules.tenantId, tenantId),
      eq(performanceRules.isActive, true)
    ),
  });

  for (const rule of rules) {
    const threshold = parseFloat(rule.conditionValue.toString());
    const triggered = evaluateCondition(rule.conditionField, rule.conditionOperator, threshold, metrics);

    if (!triggered) continue;

    const actionValue = rule.actionValue ? parseFloat(rule.actionValue.toString()) : null;

    await db.insert(ruleExecutions).values({
      ruleId: rule.id,
      campaignId,
      actionTaken: rule.action,
      result: {
        conditionField: rule.conditionField,
        conditionOperator: rule.conditionOperator,
        conditionValue: threshold,
        metricValue: metrics[rule.conditionField as keyof CampaignMetrics],
        actionValue,
        metricsSnapshot: metrics,
        triggeredAt: new Date().toISOString(),
      },
    });
  }
}

// ==================== Score Persistence ====================

export async function computeAndSaveScore(tenantId: string, campaignId: string, metrics: CampaignMetrics): Promise<{ score: number; grade: 'A' | 'B' | 'C' | 'D' | 'F' }> {
  const score = calculateScore(metrics);
  const grade = getGrade(score);

  await db.insert(performanceScores).values({
    tenantId,
    campaignId,
    score,
    grade,
    metricsSnapshot: metrics as Record<string, unknown>,
  });

  return { score, grade };
}
