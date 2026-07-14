/**
 * Formata um valor monetário em reais (BRL) para exibição.
 * Retorna '-' para valores nulos, indefinidos ou não finitos.
 *
 * @param value - Valor numérico em reais
 * @returns String formatada (ex: 'R$ 1.234,56') ou '-'
 *
 * @example
 * formatInvestidoBRL(1234.56) // → 'R$ 1.234,56'
 * formatInvestidoBRL(null)    // → '-'
 * formatInvestidoBRL(0)       // → 'R$ 0,00'
 */
export function formatInvestidoBRL(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Formata um valor de ROAS para exibição com sufixo 'x'.
 * Retorna '-' para valores nulos, indefinidos, não finitos ou zero.
 *
 * @param value - Valor numérico do ROAS
 * @returns String formatada (ex: '4.20x') ou '-'
 *
 * @example
 * formatRoas(4.2)  // → '4.20x'
 * formatRoas(0)    // → '-'
 * formatRoas(null) // → '-'
 */
export function formatRoas(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return '-';
  return `${value.toFixed(2)}x`;
}

/**
 * Formata um número de conversões para exibição com separador de milhar.
 * Retorna '-' para valores nulos, indefinidos ou não finitos.
 *
 * @param value - Número de conversões
 * @returns String formatada (ex: '1.234') ou '-'
 *
 * @example
 * formatConversions(1234)  // → '1.234'
 * formatConversions(50.7)  // → '51' (arredonda)
 * formatConversions(null)  // → '-'
 */
export function formatConversions(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return Math.round(value).toLocaleString('pt-BR');
}