/**
 * Normalização de telefone de atendimento para a Meta (business_phone_number do
 * thank_you_page de lead forms).
 *
 * REGRAS DE PARSE (a ordem importa!):
 * 1. 10 ou 11 dígitos = SEMPRE DDD + número nacional. DDD 55 EXISTE (RS) — nunca
 *    interpretar um número de 10/11 dígitos como tendo DDI (caso real:
 *    55981286344 é (55) 98128-6344, Porto Alegre, e NÃO "+55 (98)...").
 * 2. 12 ou 13 dígitos começando com 55 = já tem DDI (o DDI 55 não colide porque
 *    com DDI o total mínimo é 12).
 * 3. Qualquer outro comprimento → devolve como veio (a Meta valida e o
 *    mapWizardMetaError traduz o erro 192).
 */

/**
 * Normaliza para o formato da Meta: somente dígitos, com DDI 55.
 * `55981286344` (nacional, DDD 55) → `5555981286344`; `981286344` → `55981286344`.
 */
export function normalizePhoneToMetaE164(raw: string): string {
  const d = (raw ?? '').replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return d;
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}
