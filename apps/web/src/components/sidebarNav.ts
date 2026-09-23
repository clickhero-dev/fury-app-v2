/**
 * Regra de item ativo da sidebar (pura, testável):
 * - match exato no destino;
 * - prefix-match para sub-rotas (ex.: /campanhas/regras ativa Campanhas);
 * - caminhos alternativos explícitos (ex.: /planejador ativa Planejamento).
 */
export interface NavItemShape {
  to: string;
  alsoActive?: string[];
}

export function isNavItemActive(item: NavItemShape, pathname: string): boolean {
  const matches = (p: string) => pathname === p || pathname.startsWith(p + '/');
  return matches(item.to) || (item.alsoActive ?? []).some(matches);
}