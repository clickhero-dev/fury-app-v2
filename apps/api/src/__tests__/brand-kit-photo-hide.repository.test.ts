import { describe, it, expect, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { BrandKitPhotoRepository } from '../repository/brand-kit-photo.repository.js';

describe('ocultação no painel por tenant', () => {
  it('atualiza apenas a imagem ativa do tenant e preserva a biblioteca', async () => {
    const returning = vi.fn().mockResolvedValue([{ id: 'foto' }]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const db = { update: vi.fn().mockReturnValue({ set }) };
    const repo = new BrandKitPhotoRepository('tenant-a', db as never);
    expect(await repo.hideFromReferencePanel('foto')).toEqual({ id: 'foto' });
    expect(set).toHaveBeenCalledWith({ hiddenFromReferencePanel: true });
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.params).toContain('tenant-a');
    expect(query.params).toContain('foto');
    expect(query.sql).toContain('deleted_at');
  });
});
