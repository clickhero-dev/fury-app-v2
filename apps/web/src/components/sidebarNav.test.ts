import { describe, it, expect } from 'vitest';
import { isNavItemActive, isNavItemCurrent } from './sidebarNav';

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

describe('isNavItemCurrent — destino ATUAL exato (aria-current)', () => {
  it('marca apenas o destino exato como current', () => {
    expect(isNavItemCurrent({ to: '/configuracoes' }, '/configuracoes')).toBe(true);
    expect(isNavItemCurrent({ to: '/configuracoes' }, '/configuracoes/integracoes')).toBe(false);
  });

  it('não usa prefix-match: sub-rota de outro item não vira current', () => {
    expect(isNavItemCurrent({ to: '/campanhas' }, '/campanhas/regras')).toBe(false);
  });

  it('respeita alsoActive por match exato (e não por prefixo)', () => {
    const item = { to: '/calendario', alsoActive: ['/planejador'] };
    expect(isNavItemCurrent(item, '/planejador')).toBe(true);
    expect(isNavItemCurrent(item, '/planejador/algum-id')).toBe(false);
    expect(isNavItemCurrent(item, '/calendario')).toBe(true);
  });

  it('mantém inativo para rotas de outra área', () => {
    expect(isNavItemCurrent({ to: '/configuracoes' }, '/leads')).toBe(false);
  });
});