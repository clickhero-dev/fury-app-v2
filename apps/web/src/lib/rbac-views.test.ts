import { describe, it, expect } from 'vitest';
import { viewKeyForPath } from './rbac-views';

describe('viewKeyForPath', () => {
  it('usa o prefixo mais longo', () => {
    expect(viewKeyForPath('/estudio')).toBe('studio');
    expect(viewKeyForPath('/estudio/imagem')).toBe('studio.image');
    expect(viewKeyForPath('/campanhas/regras')).toBe('campaigns.rules');
    expect(viewKeyForPath('/campanhas/abc/insights')).toBe('campaigns');
    expect(viewKeyForPath('/admin/tenants/abc/campaigns')).toBe('admin.tenants');
  });

  it('casa por segmento, não por texto', () => {
    expect(viewKeyForPath('/assinatura')).toBe('subscription');
    expect(viewKeyForPath('/assinatura-vencida')).toBeNull();
  });

  it('rota fora do catálogo não tem tela', () => {
    expect(viewKeyForPath('/onboarding/metas')).toBeNull();
    expect(viewKeyForPath('/politica')).toBeNull();
  });
});
