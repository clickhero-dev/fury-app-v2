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

/**
 * Destino ATUAL exato (para aria-current): apenas o caminho literalmente
 * ativo vira "página atual" — sem prefix-match. O prefix-match (que ativa o
 * estilo visual do parent) fica com isNavItemActive; usar os dois ao mesmo
 * tempo faria um parent e seu child anunciarem 2 páginas atuais ao leitor.
 */
export function isNavItemCurrent(item: NavItemShape, pathname: string): boolean {
  const exact = (p: string) => pathname === p;
  return exact(item.to) || (item.alsoActive ?? []).some(exact);
}