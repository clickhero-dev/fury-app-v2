/**
 * Formatação/normalização de telefone de atendimento (Brand Kit → wizard de leads).
 *
 * Fontes de verdade:
 * - Brand Kit salva SOMENTE dígitos (`brand_kits.whatsapp_number`), com ou sem DDI.
 * - A Meta exige `thank_you_page.business_phone_number` em dígitos, com DDI.
 *
 * REGRAS DE PARSE (a ordem importa!):
 * 1. 10 ou 11 dígitos = SEMPRE DDD + número nacional. DDD 55 EXISTE (RS) — nunca
 *    interpretar um número de 10/11 dígitos como tendo DDI (caso real:
 *    55981286344 é (55) 98128-6344, Porto Alegre).
 * 2. 12 ou 13 dígitos começando com 55 = DDI 55 + DDD + número (o DDI 55 não
 *    colide porque com DDI o total mínimo é 12).
 * 3. Qualquer outro comprimento/DDI → inválido.
 */

/** Formata para exibição no input do wizard. */
export function formatPhoneDisplay(raw: string): string {
  const d = (raw ?? '').replace(/\D/g, '');

  // 12/13 com DDI 55: "+55 (DD) NNNN-NNNN" ou "+55 (DD) NNNNN-NNNN"
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) {
    const dd = d.slice(2, 4);
    const local = d.slice(4); // 8 ou 9 dígitos
    const left = local.slice(0, local.length - 4);
    const right = local.slice(local.length - 4);
    return `+55 (${dd}) ${left}-${right}`;
  }

  // 10/11 nacional: "(DD) NNNN-NNNN" ou "(DD) NNNNN-NNNN"
  if (d.length === 10 || d.length === 11) {
    const dd = d.slice(0, 2);
    const local = d.slice(2);
    const left = local.slice(0, local.length - 4);
    const right = local.slice(local.length - 4);
    return `(${dd}) ${left}-${right}`;
  }

  return d;
}

/**
 * Normaliza para o formato da Meta (só dígitos, com DDI 55).
 * 10/11 dígitos (nacional, DDI 55 inclusive) ganham prefixo 55;
 * 12/13 já com 55 passam direto.
 */
export function normalizePhoneToMeta(raw: string): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

/** Validação leve do wizard: nacional (10/11) ou completo com DDI 55 (12/13). */
export function isValidBusinessPhone(raw: string): boolean {
  const d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return true;
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return true;
  return false;
}
