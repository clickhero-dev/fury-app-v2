export function formatInvestidoBRL(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatRoas(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return '-';
  return `${value.toFixed(2)}x`;
}

export function formatCpaBRL(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatConversions(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return Math.round(value).toLocaleString('pt-BR');
}
