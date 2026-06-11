const TIMEZONE = 'America/Sao_Paulo';

const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export interface YMD {
  year: number;
  month: number;
  day: number;
}

/** Componentes ano/mes/dia da data informada no horario de Brasilia (independente do TZ do dispositivo). */
export function getSaoPauloYMD(date: Date = new Date()): YMD {
  const parts = ymdFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

export function formatYMD({ year, month, day }: YMD): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Data atual (YYYY-MM-DD) no horario de Brasilia. */
export function todaySaoPauloYMD(): string {
  return formatYMD(getSaoPauloYMD());
}

/** Soma (ou subtrai) dias a partir de um YMD, retornando um novo YMD normalizado. */
export function addDaysToYMD({ year, month, day }: YMD, deltaDays: number): YMD {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}
