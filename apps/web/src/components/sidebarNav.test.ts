import { describe, it, expect } from 'vitest';
import { isNavItemActive } from './sidebarNav';

describe('isNavItemActive', () => {
  it('ativa o item quando o pathname é exatamente o destino', () => {
    expect(isNavItemActive({ to: '/campanhas' }, '/campanhas')).toBe(true);
  });

  it('ativa o item para sub-rotas (prefix-match)', () => {
    expect(isNavItemActive({ to: '/campanhas' }, '/campanhas/regras')).toBe(true);
    expect(isNavItemActive({ to: '/configuracoes' }, '/configuracoes/integracoes')).toBe(true);
  });

  it('mantém o item inativo para rotas de outra área', () => {
    expect(isNavItemActive({ to: '/campanhas' }, '/leads')).toBe(false);
    expect(isNavItemActive({ to: '/dashboard' }, '/dashboard/metas')).toBe(true); // sub-rota do painel
  });

  it('ativa também nos caminhos alternativos (alsoActive)', () => {
    const item = { to: '/calendario', alsoActive: ['/planejador'] };
    expect(isNavItemActive(item, '/planejador')).toBe(true);
    expect(isNavItemActive(item, '/planejador/algum-id')).toBe(true);
    expect(isNavItemActive(item, '/calendario')).toBe(true);
    expect(isNavItemActive(item, '/dashboard')).toBe(false);
  });
});