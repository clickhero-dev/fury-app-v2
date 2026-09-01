import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveTenantId } from '../index.js';

// Mock mínimo de @fury/db (mesmo padrão de campaigns-service.test.ts). O
// resolveTenantId usa dynamic import dentro do index.ts.
vi.mock('@fury/db', () => ({
  db: { query: { tenants: { findFirst: vi.fn(), findMany: vi.fn() } } },
  tenants: {},
  eq: vi.fn(),
}));

describe('resolveTenantId (LP pública)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolve por slug do tenant (sem consultar findMany)', async () => {
    const mockDb = await import('@fury/db');
    (mockDb.db.query.tenants.findFirst as any).mockResolvedValue({
      id: 't1', name: 'Petróleo Ferreira', slug: 'legado-1', codigo: null,
    });

    await expect(resolveTenantId('legado-1')).resolves.toBe('t1');
    expect(mockDb.db.query.tenants.findFirst).toHaveBeenCalledTimes(1);
    expect(mockDb.db.query.tenants.findMany).not.toHaveBeenCalled();
  });

  it('resolve pelo NOME DA ORGANIZAÇÃO (slugified) quando slug/codigo não batem', async () => {
    const mockDb = await import('@fury/db');
    (mockDb.db.query.tenants.findFirst as any).mockResolvedValue(null); // miss por slug/codigo
    (mockDb.db.query.tenants.findMany as any).mockResolvedValue([
      { id: 't1', name: 'Petróleo Ferreira' },
      { id: 't2', name: 'Outra Coisa' },
    ]);

    await expect(resolveTenantId('petroleo-ferreira')).resolves.toBe('t1');
    expect(mockDb.db.query.tenants.findMany).toHaveBeenCalledTimes(1);
  });

  it('resolve UUID direto por id', async () => {
    const mockDb = await import('@fury/db');
    (mockDb.db.query.tenants.findFirst as any).mockResolvedValue({ id: 't1' });

    await expect(resolveTenantId('550e8400-e29b-41d4-a716-446655440000')).resolves.toBe('t1');
  });

  it('retorna null quando nada resolve', async () => {
    const mockDb = await import('@fury/db');
    (mockDb.db.query.tenants.findFirst as any).mockResolvedValue(null);
    (mockDb.db.query.tenants.findMany as any).mockResolvedValue([]);

    await expect(resolveTenantId('nao-existe')).resolves.toBeNull();
  });
});