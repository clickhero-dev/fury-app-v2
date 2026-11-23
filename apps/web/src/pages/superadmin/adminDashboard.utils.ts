import type { DashboardPeriod } from '../../types/admin';

/** Formata centavos em moeda pt-BR (ex.: 38240 → "R$ 382,40"). */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const PLAN_COLORS: Record<string, string> = { Starter: '#7E8480', Pro: '#1E88A8', Enterprise: '#CF6F03' };
const PALETTE = ['#1E88A8', '#CF6F03', '#22C55E', '#7E8480', '#C0392B'];

/** Cor do plano: fixa para os planos conhecidos, paleta por índice para o resto. */
export function planColor(planName: string, index: number): string {
  return PLAN_COLORS[planName] ?? PALETTE[index % PALETTE.length];
}

export function periodDays(period: DashboardPeriod): number {
  return { '7d': 7, '30d': 30, '90d': 90 }[period];
}
/** Converte valor digitado em reais ("5.000,00", "5000", "49,9") para centavos; null se inválido. */
export function parseBRLToCents(input: string): number | null {
  const clean = input.replace(/R\$|\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(clean)) return null;
  const [int, dec = ''] = clean.replace(/\./g, '').split(',');
  return Number(int) * 100 + Number(dec.padEnd(2, '0'));
}

/** "2026-11-10" → "10/11/2026" (sem fuso: é só a data). */
export function formatYMD(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}
