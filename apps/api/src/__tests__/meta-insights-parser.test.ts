import { describe, it, expect } from 'vitest';
import {
  parseConversionsFromActions,
  parseRoasFromPurchaseRoas,
  parseCpaFromCostPerAction,
  extractCampaignMetricsFromInsight,
} from '../utils/meta-insights-parser.js';

const leadAction = { action_type: 'lead', value: '5' };
const purchaseAction = { action_type: 'purchase', value: '100' };
const roasAction = { action_type: 'purchase', value: '3.5' };
const cpaAction = { action_type: 'purchase', value: '20.00' };

describe('meta-insights-parser', () => {
  describe('parseConversionsFromActions', () => {
    it('returns null for empty actions', () => {
      expect(parseConversionsFromActions(undefined)).toBeNull();
      expect(parseConversionsFromActions([])).toBeNull();
    });

    it('parses conversion count', () => {
      expect(parseConversionsFromActions([leadAction], 'OUTCOME_LEADS')).toBe(5);
    });
  });

  describe('parseRoasFromPurchaseRoas', () => {
    it('returns null for undefined', () => {
      expect(parseRoasFromPurchaseRoas(undefined)).toBeNull();
    });

    it('returns rounded ROAS value', () => {
      expect(parseRoasFromPurchaseRoas([roasAction])).toBe(3.5);
    });

    it('falls back to first entry when preferred type not found', () => {
      const actions = [{ action_type: 'custom_roas', value: '2.1234' }];
      expect(parseRoasFromPurchaseRoas(actions)).toBe(2.12);
    });
  });

  describe('parseCpaFromCostPerAction', () => {
    it('returns null for undefined', () => {
      expect(parseCpaFromCostPerAction(undefined)).toBeNull();
    });

    it('returns rounded CPA value', () => {
      expect(parseCpaFromCostPerAction([cpaAction])).toBe(20);
    });
  });

  describe('extractCampaignMetricsFromInsight', () => {
    const baseInsight = {
      actions: [leadAction],
      unique_actions: undefined,
      purchase_roas: undefined,
      cost_per_action_type: undefined,
      action_values: [],
    };

    it('extracts conversions from actions', () => {
      const result = extractCampaignMetricsFromInsight(baseInsight, 100, 'OUTCOME_LEADS');
      expect(result.conversions).toBe(5);
      expect(result.roas).toBeNull();
      expect(result.cpa).toBe(20);
    });

    it('computes CPA from spend/conversions', () => {
      const result = extractCampaignMetricsFromInsight(baseInsight, 100, 'OUTCOME_LEADS');
      // conversions=5, spend=100 → CPA = 100/5 = 20
      expect(result.cpa).toBe(20);
    });

    it('computes ROAS from purchase_roas', () => {
      const insight = { ...baseInsight, purchase_roas: [roasAction] };
      const result = extractCampaignMetricsFromInsight(insight, 100, 'OUTCOME_SALES');
      expect(result.roas).toBe(3.5);
    });

    it('computes ROAS fallback from action_values', () => {
      const insight = {
        ...baseInsight,
        actions: [purchaseAction],
        purchase_roas: undefined,
        action_values: [{ action_type: 'purchase', value: '300' }],
      };
      const result = extractCampaignMetricsFromInsight(insight, 100, 'OUTCOME_SALES');
      // 300 / 100 = 3
      expect(result.roas).toBe(3);
    });

    it('returns null ROAS when no data and spend is 0', () => {
      const result = extractCampaignMetricsFromInsight(baseInsight, 0, 'OUTCOME_LEADS');
      expect(result.roas).toBeNull();
    });
  });
});
