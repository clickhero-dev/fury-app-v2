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