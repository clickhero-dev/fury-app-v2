import { getSaoPauloYMD, formatYMD, addDaysToYMD } from '@/lib/date-sao-paulo';

/** Períodos disponíveis para filtros de data na plataforma. */
export type Period = 'today' | 'last_7d' | 'this_month' | 'last_month';

/** Labels em português para exibição no `PeriodSelector`. */
export const PERIOD_LABELS: Record<Period, string> = {
  today:      'Hoje',
  last_7d:    '7 dias',
  this_month: 'Este mês',
  last_month: 'Mês anterior',
};

/**
 * Calcula as datas de início e fim para um período pré-definido,
 * sempre no horário de Brasília.
 *
 * Regras:
 * - `today`: início e fim são ontem (dado de hoje é parcial na Meta).
 * - `last_7d`: D-7 até D-1 (exclui o dia atual, cujos dados ainda são parciais).
 * - `last_month`: do primeiro ao último dia do mês anterior.
 * - `this_month`: do dia 1 até ontem (dados de hoje ainda parciais).
 *
 * @param period - Período desejado
 * @returns Objeto com `startDate` e `endDate` no formato YYYY-MM-DD
 *
 * @example
 * getPeriodDates('last_7d') // → { startDate: '2026-06-14', endDate: '2026-06-20' }
 */
export function getPeriodDates(period: Period): { startDate: string; endDate: string } {
  const now = getSaoPauloYMD();
  const yesterday = formatYMD(addDaysToYMD(now, -1));

  if (period === 'today') {
    return { startDate: yesterday, endDate: yesterday };
  }
  if (period === 'last_7d') {
    const start = addDaysToYMD(now, -7);
    return { startDate: formatYMD(start), endDate: yesterday };
  }
  if (period === 'last_month') {
    const lastOfLastMonth = addDaysToYMD({ year: now.year, month: now.month, day: 1 }, -1);
    const firstOfLastMonth = { year: lastOfLastMonth.year, month: lastOfLastMonth.month, day: 1 };
    return { startDate: formatYMD(firstOfLastMonth), endDate: formatYMD(lastOfLastMonth) };
  }
  // this_month: do dia 1 do mês atual até ontem
  return { startDate: formatYMD({ year: now.year, month: now.month, day: 1 }), endDate: yesterday };
}

/**
 * Formata um intervalo de datas em texto legível em português.
 * Omite informações redundantes (mês/ano) quando início e fim estão no mesmo período.
 *
 * @param startDate - Data inicial no formato YYYY-MM-DD
 * @param endDate - Data final no formato YYYY-MM-DD
 * @returns Label formatado (ex: "1 · 21 de junho de 2026" ou "21 de junho de 2026")
 *
 * @example
 * formatPeriodLabel('2026-06-01', '2026-06-21') // → '1 · 21 de junho de 2026'
 * formatPeriodLabel('2026-06-21', '2026-06-21') // → '21 de junho de 2026'
 */
export function formatPeriodLabel(startDate: string, endDate: string): string {
  const fmt = (iso: string) =>
    new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  if (startDate === endDate) return fmt(startDate);
  const s = new Date(startDate + 'T12:00:00');
  const e = new Date(endDate + 'T12:00:00');
  const sameYear  = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  const sDay = s.toLocaleDateString('pt-BR', { day: 'numeric', month: sameMonth ? undefined : 'long' });
  const eDay = e.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${sDay} · ${eDay}`;
}