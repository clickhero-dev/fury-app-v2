import { describe, it, expect, afterEach } from 'vitest';
import { canAccessAdmin, getStoredPlatformRole, hasLifetimeAccess, isBillingPath, platformRoleOf } from './platform-role';

afterEach(() => localStorage.clear());

describe('platformRoleOf', () => {
  it('usa o platformRole quando vem da API', () => {
    expect(platformRoleOf({ role: 'owner', platformRole: 'admin_partner' })).toBe('admin_partner');
  });

  it('sessão antiga: role superadmin vira super_admin', () => {
    expect(platformRoleOf({ role: 'superadmin' })).toBe('super_admin');
    expect(platformRoleOf({ role: 'owner' })).toBe('user');
    expect(platformRoleOf(null)).toBe('user');
  });
});

describe('getStoredPlatformRole', () => {
  it('lê do usuário salvo e tolera JSON inválido', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'owner', platformRole: 'super_admin' }));
    expect(getStoredPlatformRole()).toBe('super_admin');
    localStorage.setItem('user', '{quebrado');
    expect(getStoredPlatformRole()).toBe('user');
  });
});

describe('canAccessAdmin', () => {
  it('só super_admin e admin_partner', () => {
    expect(canAccessAdmin('super_admin')).toBe(true);
    expect(canAccessAdmin('admin_partner')).toBe(true);
    expect(canAccessAdmin('user_partner')).toBe(false);
    expect(canAccessAdmin('user')).toBe(false);
  });
});

describe('conta vitalícia (parceiro)', () => {
  it('só o admin_partner não tem plano', () => {
    expect(hasLifetimeAccess('admin_partner')).toBe(true);
    for (const role of ['super_admin', 'user_partner', 'user'] as const) expect(hasLifetimeAccess(role)).toBe(false);
  });

  it('telas de cobrança: /planos e /assinatura (por segmento)', () => {
    expect(isBillingPath('/planos')).toBe(true);
    expect(isBillingPath('/assinatura')).toBe(true);
    expect(isBillingPath('/assinatura-vencida')).toBe(false);
    expect(isBillingPath('/dashboard')).toBe(false);
  });
});

describe('membro e integrações', () => {
  it('reconhece só o cargo member', async () => {
    const { isMemberAccount } = await import('./platform-role');
    localStorage.setItem('user', JSON.stringify({ role: 'member' }));
    expect(isMemberAccount()).toBe(true);
    localStorage.setItem('user', JSON.stringify({ role: 'owner' }));
    expect(isMemberAccount()).toBe(false);
    localStorage.removeItem('user');
    expect(isMemberAccount()).toBe(false);
  });
  it('identifica a rota de integrações', async () => {
    const { isIntegrationsPath } = await import('./platform-role');
    expect(isIntegrationsPath('/configuracoes/integracoes')).toBe(true);
    expect(isIntegrationsPath('/configuracoes')).toBe(false);
  });
});

describe('nomes e cores dos cargos', () => {
  it('nomes para a tela', async () => {
    const { roleLabel } = await import('./platform-role');
    expect(roleLabel({ role: 'owner', platformRole: 'super_admin' })).toBe('Super Administrador');
    expect(roleLabel({ role: 'admin', platformRole: 'admin_partner' })).toBe('Parceiro');
    expect(roleLabel({ role: 'owner', platformRole: 'user_partner' })).toBe('Usuário Titular');
    expect(roleLabel({ role: 'member', platformRole: 'user' })).toBe('Usuário');
  });
  it('laranja para parceiro; azul para ady', async () => {
    const { roleBadgeClass } = await import('./platform-role');
    for (const platformRole of ['admin_partner', 'user_partner']) expect(roleBadgeClass({ role: 'owner', platformRole })).toContain('bg-spark');
    for (const platformRole of ['super_admin', 'user']) expect(roleBadgeClass({ role: 'owner', platformRole })).toContain('bg-brand');
  });
});
