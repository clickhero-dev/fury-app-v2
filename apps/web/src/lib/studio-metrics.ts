/** Formata duração em ms para exibição (pt-BR): 3200 → "3,2s", 500 → "500ms". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1).replace('.', ',')}s`;
}

/** Formata custo em USD para exibição (pt-BR): 0.04 → "US$ 0,04". */
export function formatCost(usd: number): string {
  // toLocaleString do Node usa NBSP (U+00A0) antes do código — normaliza para espaço simples
  return usd.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' }).replace(/\u00A0/g, ' ');
}