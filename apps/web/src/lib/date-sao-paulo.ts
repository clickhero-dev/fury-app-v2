/** Fuso horário de Brasília usado em todos os cálculos de data da plataforma. */
const TIMEZONE = 'America/Sao_Paulo';

/**
 * Formatter para extrair componentes de data (ano, mês, dia) no horário de Brasília.
 * Usa `en-CA` para obter formato YYYY-MM-DD consistente nos parts.
 */
const ymdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Representação de uma data como componentes separados (ano, mês, dia). */
export interface YMD {
  year: number;
  month: number;
  day: number;
}

/**
 * Retorna os componentes ano/mês/dia de uma data no horário de Brasília,
 * independentemente do fuso horário do dispositivo do usuário.
 *
 * @param date - Data a ser convertida. Padrão: `new Date()` (agora).
 * @returns Objeto YMD com os componentes da data em horário de Brasília
 *
 * @example
 * getSaoPauloYMD() // → { year: 2026, month: 6, day: 21 }
 * getSaoPauloYMD(new Date('2026-01-01T02:00:00Z')) // pode retornar dia 31/12 se o device estiver em UTC-3
 */
export function getSaoPauloYMD(date: Date = new Date()): YMD {
  const parts = ymdFormatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return { year: Number(map.year), month: Number(map.month), day: Number(map.day) };
}

/**
 * Converte um objeto YMD para string no formato YYYY-MM-DD.
 *
 * @param ymd - Componentes da data
 * @returns String no formato ISO 8601 (ex: '2026-06-21')
 *
 * @example
 * formatYMD({ year: 2026, month: 6, day: 21 }) // → '2026-06-21'
 * formatYMD({ year: 2026, month: 1, day: 5 })  // → '2026-01-05'
 */
export function formatYMD({ year, month, day }: YMD): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Retorna a data atual no formato YYYY-MM-DD no horário de Brasília.
 *
 * @returns Data de hoje em Brasília como string ISO
 *
 * @example
 * todaySaoPauloYMD() // → '2026-06-21'
 */
export function todaySaoPauloYMD(): string {
  return formatYMD(getSaoPauloYMD());
}

/**
 * Soma (ou subtrai) dias a um YMD, retornando um novo YMD normalizado.
 * Usa UTC internamente para evitar bugs de DST (horário de verão).
 *
 * @param ymd - Data base
 * @param deltaDays - Número de dias a somar (negativo para subtrair)
 * @returns Novo YMD com os dias somados
 *
 * @example
 * addDaysToYMD({ year: 2026, month: 6, day: 21 }, -7)
 * // → { year: 2026, month: 6, day: 14 }
 *
 * addDaysToYMD({ year: 2026, month: 1, day: 1 }, -1)
 * // → { year: 2025, month: 12, day: 31 }
 */
export function addDaysToYMD({ year, month, day }: YMD, deltaDays: number): YMD {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}