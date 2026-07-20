import type { MetaInsightsAction } from '../lib/meta-api.js';

export const CONVERSION_ACTION_TYPES: readonly string[] = [
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_purchase',
  'offsite_conversion.fb_pixel_complete_registration',
  'onsite_conversion.lead',
  'onsite_conversion.lead_grouped',
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
  'lead',
  'omni_purchase',
  'omni_complete_registration',
  'contact',
  'start_trial',
  'submit_application',
] as const;

const CONVERSION_SET = new Set(CONVERSION_ACTION_TYPES);

export function isConversionEvent(actionType: string): boolean {
  return CONVERSION_SET.has(actionType);
}

// Acoes "de vaidade": medem engajamento, nao conversao real, e nunca devem
// entrar no fallback generico de conversoes.
const VANITY_ACTION_TYPES = new Set([
  'post_engagement',
  'page_engagement',
  'video_view',
  'post_reaction',
  'like',
  'comment',
  'post',
]);

// Conversas iniciadas no Messenger/Instagram Direct/WhatsApp — objetivo
// OUTCOME_ENGAGEMENT com destination_type MESSENGER/WHATSAPP/INSTAGRAM_DIRECT
// (campanhas de "Mensagens"). Em ordem de prioridade: o resultado principal
// exibido pelo Meta Ads Manager para esse objetivo e
// "messaging_conversation_started_7d".
export const MESSAGING_CONVERSION_ACTION_TYPES: readonly string[] = [
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
] as const;

// Campanhas de geracao de cadastros (OUTCOME_LEADS).
export const LEAD_CONVERSION_ACTION_TYPES: readonly string[] = [
  'lead',
  'onsite_conversion.lead_grouped',
  'onsite_conversion.lead',
  'offsite_conversion.fb_pixel_lead',
] as const;

// Campanhas de vendas/conversao (OUTCOME_SALES). `omni_purchase` ja agrega
// compras onsite/offsite/app — somar junto com `offsite_conversion.fb_pixel_purchase`
// ou `purchase` conta a mesma compra duas vezes.
export const PURCHASE_CONVERSION_ACTION_TYPES: readonly string[] = [
  'omni_purchase',
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
] as const;

// Campanhas de cadastro/registro.
export const REGISTRATION_CONVERSION_ACTION_TYPES: readonly string[] = [
  'omni_complete_registration',
  'offsite_conversion.fb_pixel_complete_registration',
  'onsite_conversion.complete_registration',
] as const;

// Campanhas de trafego (OUTCOME_TRAFFIC) sem pixel/evento de conversao
// configurado: usar visualizacoes de pagina de destino ou cliques no link.
export const TRAFFIC_CONVERSION_ACTION_TYPES: readonly string[] = [
  'landing_page_view',
  'link_click',
] as const;

/**
 * Retorna, em ordem de prioridade, os action_types que representam a
 * "conversao" principal para o objetivo da campanha. Apenas o PRIMEIRO
 * tipo encontrado nas actions e usado — somar varios tipos da mesma
 * familia conta a mesma conversao mais de uma vez (ex.: omni_purchase +
 * offsite_conversion.fb_pixel_purchase).
 */
export function getConversionActionTypesForObjective(objective?: string | null): readonly string[] {
  const obj = (objective || '').toUpperCase();

  // OUTCOME_LEADS cobre tanto formularios de cadastro quanto campanhas de
  // mensagens/conversas (optimization_goal CONVERSATIONS, destination_type
  // MESSENGER/WHATSAPP/INSTAGRAM_DIRECT). Lead primeiro porque uma campanha
  // de leads no site pode ter acoes de mensageria acidentais (ex.: alguem
  // que clicou em "Enviar mensagem" na pagina) — se messageria viesse antes,
  // essas acoes esconderiam o resultado real de leads.
  if (obj.includes('MESSAGE') || obj.includes('LEAD')) {
    return [...LEAD_CONVERSION_ACTION_TYPES, ...MESSAGING_CONVERSION_ACTION_TYPES];
  }
  if (obj.includes('SALES')) {
    return PURCHASE_CONVERSION_ACTION_TYPES;
  }
  if (obj.includes('TRAFFIC')) {
    return TRAFFIC_CONVERSION_ACTION_TYPES;
  }

  // Objetivo desconhecido: tenta as familias mais comuns.
  // ponytail: traffic primeiro (landing_page_view, link_click) porque o
  // ecossistema FURY é focado em tráfego externo — visitas/cliques devem
  // ser a métrica padrão de conversão. Se houver campanhas de mensagens
  // no futuro e o fallback for insuficiente, passar objective
  // explicitamente nos callers da função.
  return [
    ...TRAFFIC_CONVERSION_ACTION_TYPES,
    ...MESSAGING_CONVERSION_ACTION_TYPES,
    ...LEAD_CONVERSION_ACTION_TYPES,
    ...PURCHASE_CONVERSION_ACTION_TYPES,
    ...REGISTRATION_CONVERSION_ACTION_TYPES,
  ];
}

/**
 * Calcula o numero de conversoes a partir das `actions` retornadas pela
 * Meta Insights API, escolhendo o(s) action_type(s) corretos conforme o
 * objetivo da campanha (ver `getConversionActionTypesForObjective`).
 *
 * Retorna `null` quando nao ha `actions` (insight sem dados).
 */
export function getConversionsFromActions(
  actions: MetaInsightsAction[] | undefined,
  objective?: string | null,
  uniqueActions?: MetaInsightsAction[] | undefined
): number | null {
  if (!actions || actions.length === 0) return null;

  const candidateTypes = getConversionActionTypesForObjective(objective);

  for (const type of candidateTypes) {
    const entry = actions.find((a) => a.action_type === type);
    if (entry) {
      // O Meta Ads Manager exibe "Resultados" com base em pessoas unicas
      // (unique_actions), nao no total de eventos (actions) — a mesma
      // pessoa pode gerar mais de um evento do mesmo tipo no periodo.
      const uniqueEntry = uniqueActions?.find((a) => a.action_type === type);
      const source = uniqueEntry ?? entry;
      const value = parseInt(String(source.value), 10);
      if (Number.isFinite(value)) return value;
    }
  }

  // Nenhum action_type conhecido encontrado: soma tudo que nao seja
  // engajamento de vaidade, como ultimo recurso.
  const fallbackSum = actions
    .filter((a) => !VANITY_ACTION_TYPES.has(a.action_type))
    .reduce((sum, a) => sum + (parseInt(String(a.value), 10) || 0), 0);

  return fallbackSum;
}
