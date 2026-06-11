import type { MetaInsightsAction, MetaInsightsData } from '../lib/meta-api.js';
import { calculateCPA, roundToDecimals } from './metrics-formatter.js';
import { getConversionsFromActions } from './meta-conversion-events.js';

const ROAS_ACTION_TYPES = ['omni_purchase', 'purchase'] as const;
const CPA_ACTION_TYPES = ['purchase', 'omni_purchase'] as const;

function pickActionValue(
  entries: MetaInsightsAction[] | undefined,
  preferredTypes: readonly string[]
): number | null {
  if (!entries || entries.length === 0) return null;

  for (const type of preferredTypes) {
    const entry = entries.find((a) => a.action_type === type);
    if (entry) {
      const value = parseFloat(String(entry.value));
      return Number.isFinite(value) ? value : null;
    }
  }

  const first = entries[0];
  const value = parseFloat(String(first?.value));
  return Number.isFinite(value) ? value : null;
}

export function parseConversionsFromActions(
  actions: MetaInsightsAction[] | undefined,
  objective?: string | null,
  uniqueActions?: MetaInsightsAction[] | undefined
): number | null {
  return getConversionsFromActions(actions, objective, uniqueActions);
}

export function parseRoasFromPurchaseRoas(
  purchaseRoas: MetaInsightsAction[] | undefined
): number | null {
  const value = pickActionValue(purchaseRoas, ROAS_ACTION_TYPES);
  return value === null ? null : roundToDecimals(value, 2);
}

export function parseCpaFromCostPerAction(
  costPerAction: MetaInsightsAction[] | undefined
): number | null {
  const value = pickActionValue(costPerAction, CPA_ACTION_TYPES);
  return value === null ? null : roundToDecimals(value, 2);
}

export function extractCampaignMetricsFromInsight(
  insight: MetaInsightsData,
  spendInReais: number,
  objective?: string | null
): {
  roas: number | null;
  cpa: number | null;
  conversions: number | null;
} {
  const conversions = getConversionsFromActions(insight.actions, objective, insight.unique_actions);
  const roasFromMeta = parseRoasFromPurchaseRoas(insight.purchase_roas);
  const cpaFromMeta = parseCpaFromCostPerAction(insight.cost_per_action_type);

  const roas =
    roasFromMeta ??
    (spendInReais > 0
      ? (() => {
          const revenue = (insight.action_values || [])
            .filter(
              (a) =>
                a.action_type === 'purchase' ||
                a.action_type === 'offsite_conversion.value'
            )
            .reduce((sum, a) => sum + parseFloat(String(a.value)), 0);
          return revenue > 0 ? roundToDecimals(revenue / spendInReais, 2) : null;
        })()
      : null);

  // CPA deve refletir o numero de conversoes exibido na tabela (spend /
  // conversions). O cost_per_action_type da Meta pode se referir a um
  // action_type diferente do escolhido como "conversao" para o objetivo
  // da campanha, gerando valores incoerentes com a coluna Conversoes.
  const cpa =
    (conversions !== null && conversions > 0
      ? calculateCPA(spendInReais, conversions)
      : null) ?? cpaFromMeta;

  return { roas, cpa, conversions };
}
