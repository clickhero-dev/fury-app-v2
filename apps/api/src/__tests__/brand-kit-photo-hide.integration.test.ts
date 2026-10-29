import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray } from 'drizzle-orm';
import * as schema from '@fury/db';
import { BrandKitPhotoRepository } from '../repository/brand-kit-photo.repository.js';

describe('ocultação da biblioteca no PostgreSQL', () => {
  const ids: string[] = [];
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let tenantA: string;
  let tenantB: string;
  let photoA: string;
  let photoB: string;
  let deleted: string;

  beforeAll(async () => {
    // Fail closed: never use DATABASE_URL, a remote server, or a non-test DB.
    const raw = process.env.TEST_DATABASE_URL;
    if (!raw) throw new Error('TEST_DATABASE_URL local para fury_test é obrigatório');
    const url = new URL(raw);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/fury_test') {
      throw new Error('Teste permitido somente em fury_test local');
    }
    client = postgres(raw, { max: 1, prepare: false });
    db = drizzle(client, { schema });
    const [identity] = await client`select current_database() as name`;
    if (identity.name !== 'fury_test') throw new Error('Banco conectado não é fury_test');
    for (const suffix of ['a', 'b']) {
      const [tenant] = await db.insert(schema.tenants).values({ name: 'hide-integration', slug: `hide-${suffix}-${randomUUID()}` }).returning();
      ids.push(tenant.id);
      const [kit] = await client`insert into brand_kits (tenant_id) values (${tenant.id}) returning id`;
      const [photo] = await db.insert(schema.brandKitPhotos).values({ tenantId: tenant.id, brandKitId: kit.id, kind: 'produto', url: `https://example.invalid/${randomUUID()}.png` }).returning();
      if (suffix === 'a') {
        tenantA = tenant.id;
        photoA = photo.id;
        const [removed] = await db.insert(schema.brandKitPhotos).values({ tenantId: tenant.id, brandKitId: kit.id, kind: 'modelo', url: 'https://example.invalid/deleted.png', deletedAt: new Date() }).returning();
        deleted = removed.id;
      } else {
        tenantB = tenant.id;
        photoB = photo.id;
      }
    }
  });

  afterAll(async () => {
    try {
      if (db && ids.length) await db.delete(schema.tenants).where(inArray(schema.tenants.id, ids));
    } finally {
      if (client) await client.end();
    }
  });

  it('isola tenants e mantém a foto oculta na biblioteca após nova instância', async () => {
    const a = new BrandKitPhotoRepository(tenantA, db);
    const b = new BrandKitPhotoRepository(tenantB, db);
    const original = await a.findById(photoA);
    expect(original?.hiddenFromReferencePanel).toBe(false);
    expect(await b.hideFromReferencePanel(photoA)).toBeUndefined();
    expect((await a.findById(photoA))?.hiddenFromReferencePanel).toBe(false);
    expect(await a.hideFromReferencePanel(randomUUID())).toBeUndefined();
    expect(await a.hideFromReferencePanel(deleted)).toBeUndefined();
    expect((await a.hideFromReferencePanel(photoA))?.hiddenFromReferencePanel).toBe(true);
    const fresh = new BrandKitPhotoRepository(tenantA, db);
    expect(await fresh.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: photoA, url: original?.url, deletedAt: null, hiddenFromReferencePanel: true })]));
    expect((await fresh.findByIds([photoA])).map(p => p.id)).toEqual([photoA]);
    expect((await b.findById(photoB))?.hiddenFromReferencePanel).toBe(false);
    expect(await b.findById(photoA)).toBeUndefined();
    const [stored] = await db.select().from(schema.brandKitPhotos).where(eq(schema.brandKitPhotos.id, photoA));
    expect(stored).toMatchObject({ tenantId: tenantA, url: original?.url, deletedAt: null, hiddenFromReferencePanel: true });
  });
});
