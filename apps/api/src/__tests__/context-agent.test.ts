import { describe, it, expect, vi, beforeEach } from 'vitest';

const dbMock = vi.hoisted(() => ({
  query: {
    tenants: { findFirst: vi.fn() },
    brandKits: { findFirst: vi.fn() },
    clientGoals: { findFirst: vi.fn() },
  },
}));

vi.mock('@fury/db', () => ({
  db: dbMock,
  tenants: { id: 'id' },
  brandKits: { tenantId: 'tenantId' },
  clientGoals: { tenantId: 'tenantId' },
}));

import { contextAgent } from '../agents/context.agent.js';

describe('contextAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('monta o contexto com tenant, brandKit e goals', async () => {
    dbMock.query.tenants.findFirst.mockResolvedValue({
      id: 't-1', name: 'Acme', businessContext: 'E-commerce', slug: 'acme',
    });
    dbMock.query.brandKits.findFirst.mockResolvedValue({
      tenantId: 't-1', voiceTone: 'amigavel', primaryColor: '#000', secondaryColor: '#fff',
    });
    dbMock.query.clientGoals.findFirst.mockResolvedValue({
      tenantId: 't-1', objective: 'Vendas', niche: 'Moda', mainProduct: 'Camisetas', targetAudience: { idade: '18-35' },
    });

    const result = await contextAgent('t-1');

    expect(result.tenantId).toBe('t-1');
    expect(result.tenant).toEqual({ name: 'Acme', businessContext: 'E-commerce', slug: 'acme' });
    expect(result.brandKit?.voiceTone).toBe('amigavel');
    expect(result.goals?.objective).toBe('Vendas');
    expect(result.goals?.targetAudience).toEqual({ idade: '18-35' });
  });

  it('retorna campos opcionais indefinidos quando brand/goals ausentes', async () => {
    dbMock.query.tenants.findFirst.mockResolvedValue({
      id: 't-1', name: 'Acme', slug: 'acme',
    });
    dbMock.query.brandKits.findFirst.mockResolvedValue(null);
    dbMock.query.clientGoals.findFirst.mockResolvedValue(null);

    const result = await contextAgent('t-1');

    expect(result.brandKit).toBeUndefined();
    expect(result.goals).toBeUndefined();
    expect(result.tenant.businessContext).toBeUndefined();
  });

  it('lança erro quando o tenant não existe', async () => {
    dbMock.query.tenants.findFirst.mockResolvedValue(null);

    await expect(contextAgent('missing')).rejects.toThrow('Tenant não encontrado');
  });
});
