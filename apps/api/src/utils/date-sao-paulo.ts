const TIMEZONE = 'America/Sao_Paulo';

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

interface YMD {
  year: number;
  month: number;
  day: number;
}

function getSaoPauloYMD(date: Date = new Date()): YMD {
  const parts = ymdFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

function formatYMD({ year, month, day }: YMD): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Data atual (YYYY-MM-DD) no horario de Brasilia, independente do TZ do servidor. */
export function todaySaoPauloYMD(): string {
  return formatYMD(getSaoPauloYMD());
}

/** Data (YYYY-MM-DD) `daysAgo` dias antes de hoje, calculada no horario de Brasilia. */
export function daysAgoSaoPauloYMD(daysAgo: number): string {
  const { year, month, day } = getSaoPauloYMD();
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return formatYMD({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}
