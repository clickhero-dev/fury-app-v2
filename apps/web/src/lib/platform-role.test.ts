import { describe, it, expect, afterEach } from 'vitest';
import { canAccessAdmin, getStoredPlatformRole, platformRoleOf } from './platform-role';

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
