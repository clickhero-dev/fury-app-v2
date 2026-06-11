import { getSaoPauloYMD, formatYMD, addDaysToYMD } from '@/lib/date-sao-paulo';

// ─── Period ───────────────────────────────────────────────────────────────────

export type Period = 'today' | 'last_7d' | 'this_month' | 'last_month';

export const PERIOD_LABELS: Record<Period, string> = {
  today:      'Hoje',
  last_7d:    '7 dias',
  this_month: 'Este mês',
  last_month: 'Mês anterior',
};

export function getPeriodDates(period: Period): { startDate: string; endDate: string } {
  const now = getSaoPauloYMD();
  const today = formatYMD(now);
  const yesterday = formatYMD(addDaysToYMD(now, -1));

  if (period === 'today') {
    return { startDate: today, endDate: today };
  }
  if (period === 'last_7d') {
    // D-7 a D-1 (ontem): exclui o dia atual, cujos dados ainda estao parciais.
    const start = addDaysToYMD(now, -7);
    return { startDate: formatYMD(start), endDate: yesterday };
  }
  if (period === 'last_month') {
    const lastOfLastMonth = addDaysToYMD({ year: now.year, month: now.month, day: 1 }, -1);
    const firstOfLastMonth = { year: lastOfLastMonth.year, month: lastOfLastMonth.month, day: 1 };
    return { startDate: formatYMD(firstOfLastMonth), endDate: formatYMD(lastOfLastMonth) };
  }
  // this_month: do dia 1 do mes atual ate hoje.
  return { startDate: formatYMD({ year: now.year, month: now.month, day: 1 }), endDate: today };
}

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
