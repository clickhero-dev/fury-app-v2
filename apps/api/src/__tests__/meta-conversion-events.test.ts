import { describe, it, expect } from 'vitest';
import { isConversionEvent, getConversionActionTypesForObjective, getConversionsFromActions } from '../utils/meta-conversion-events.js';

describe('meta-conversion-events', () => {
  describe('isConversionEvent', () => {
    it('returns true for known conversion types', () => {
      expect(isConversionEvent('lead')).toBe(true);
      expect(isConversionEvent('offsite_conversion.fb_pixel_purchase')).toBe(true);
      expect(isConversionEvent('omni_purchase')).toBe(true);
    });

    it('returns false for vanity types', () => {
      expect(isConversionEvent('post_engagement')).toBe(false);
      expect(isConversionEvent('video_view')).toBe(false);
      expect(isConversionEvent('like')).toBe(false);
    });

    it('returns false for unknown types', () => {
      expect(isConversionEvent('unknown_type')).toBe(false);
    });
  });

  describe('getConversionActionTypesForObjective', () => {
    it('returns messaging + lead for MESSAGE objective', () => {
      const result = getConversionActionTypesForObjective('MESSAGE');
      expect(result).toContain('onsite_conversion.messaging_conversation_started_7d');
      expect(result).toContain('lead');
    });

    it('returns messaging + lead for LEAD objective', () => {
      const result = getConversionActionTypesForObjective('OUTCOME_LEADS');
      expect(result).toContain('lead');
      expect(result).toContain('onsite_conversion.messaging_conversation_started_7d');
    });

    it('returns purchase types for SALES', () => {
      const result = getConversionActionTypesForObjective('OUTCOME_SALES');
      expect(result).toContain('omni_purchase');
      expect(result).toContain('purchase');
    });

    it('returns traffic types for TRAFFIC', () => {
      const result = getConversionActionTypesForObjective('OUTCOME_TRAFFIC');
      expect(result).toContain('landing_page_view');
      expect(result).toContain('link_click');
    });

    it('returns fallback for unknown objective', () => {
      const result = getConversionActionTypesForObjective('UNKNOWN');
      expect(result).toBeInstanceOf(Array);
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles null/undefined objective', () => {
      expect(getConversionActionTypesForObjective(null)).toBeInstanceOf(Array);
      expect(getConversionActionTypesForObjective(undefined)).toBeInstanceOf(Array);
    });
  });

  describe('getConversionsFromActions', () => {
    it('returns null for empty actions', () => {
      expect(getConversionsFromActions(undefined)).toBeNull();
      expect(getConversionsFromActions([])).toBeNull();
    });

    it('finds matching conversion type', () => {
      const actions = [{ action_type: 'lead', value: '5' }];
      expect(getConversionsFromActions(actions, 'OUTCOME_LEADS')).toBe(5);
    });

    it('prefers unique_actions over actions', () => {
      const actions = [{ action_type: 'lead', value: '10' }];
      const uniqueActions = [{ action_type: 'lead', value: '3' }];
      expect(getConversionsFromActions(actions, 'OUTCOME_LEADS', uniqueActions)).toBe(3);
    });

    it('falls back to non-vanity sum when no known type matches', () => {
      const actions = [
        { action_type: 'custom_event', value: '5' },
        { action_type: 'post_engagement', value: '100' },
      ];
      // custom_event is not vanity, post_engagement is — only custom counts
      expect(getConversionsFromActions(actions, 'UNKNOWN')).toBe(5);
    });

    it('filters out vanity types in fallback', () => {
      const actions = [
        { action_type: 'post_engagement', value: '100' },
        { action_type: 'like', value: '50' },
      ];
      expect(getConversionsFromActions(actions, 'UNKNOWN')).toBe(0);
    });

    // Regressão do caso Elaine (30/09): campanha de FORMULÁRIO sem nenhum envio
    // exibia "3 clientes" porque o fallback genérico somava `link_click`.
    it('não conta clique/engajamento como cliente em campanha de formulário (OUTCOME_LEADS)', () => {
      const actions = [
        { action_type: 'link_click', value: '3' },
        { action_type: 'post_engagement', value: '3' },
        { action_type: 'page_engagement', value: '3' },
      ];
      const uniqueActions = [{ action_type: 'link_click', value: '2' }];
      expect(getConversionsFromActions(actions, 'OUTCOME_LEADS', uniqueActions)).toBe(0);
    });

    it('não conta clique como cliente em objetivo de mensagem', () => {
      const actions = [{ action_type: 'link_click', value: '7' }];
      expect(getConversionsFromActions(actions, 'OUTCOME_ENGAGEMENT')).toBe(0);
    });

    // Fluxos ISOLADOS: a regra de MENSAGEM (conversas iniciadas) e a de
    // FORMULÁRIO (envios) são independentes — mexer numa não pode alterar a outra.
    it('campanha de MENSAGEM conta conversas iniciadas e ignora tipo de lead', () => {
      const actions = [
        { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '5' },
        { action_type: 'onsite_conversion.messaging_first_reply', value: '3' },
        { action_type: 'link_click', value: '40' },
      ];
      expect(getConversionsFromActions(actions, 'OUTCOME_ENGAGEMENT')).toBe(5);
      // 'lead' não é métrica de mensagem
      expect(getConversionsFromActions([{ action_type: 'lead', value: '9' }], 'OUTCOME_ENGAGEMENT')).toBe(0);
    });

    it('campanha de FORMULÁRIO conta envios e ignora conversa iniciada', () => {
      expect(getConversionsFromActions([{ action_type: 'lead', value: '4' }], 'OUTCOME_LEADS')).toBe(4);
      // conversa iniciada não é envio de formulário
      const conversation = [{ action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '7' }];
      expect(getConversionsFromActions(conversation, 'OUTCOME_LEADS')).toBe(0);
    });

    it('conta envios de formulário reais (lead / lead_grouped)', () => {
      const actions = [{ action_type: 'onsite_conversion.lead_grouped', value: '4' }];
      expect(getConversionsFromActions(actions, 'OUTCOME_LEADS')).toBe(4);
      expect(getConversionsFromActions([{ action_type: 'lead', value: '4' }], 'OUTCOME_LEADS')).toBe(4);
    });
  });
});
