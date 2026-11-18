/* Funcionalidade: persistência idempotente de avaliações.
 * Dado banco isolado com a migration real, quando insiro/atualizo avaliações,
 * então preserva identidade, isolamento e constraints.
 * Dado schema incompleto, então distingue relação ausente de conflito inválido. */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { db, tenants, users, creativeAssets, creativeAssetRatings } from '@fury/db';
import { StudioRepository } from '../repository/studio.repository.js';
import { validateRatingConstraint } from '../../../../packages/db/src/migrate.js';

describe.skipIf(!process.env.TEST_RATING_DATABASE)('repository de avaliações com PostgreSQL', () => {
  const tenant = randomUUID(), otherTenant = randomUUID();
  const user = randomUUID(), secondUser = randomUUID(), otherUser = randomUUID();
  const asset = randomUUID(), otherAsset = randomUUID();
  const repo = new StudioRepository(tenant);
  const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
  const ddl = readFileSync(new URL('../../../../packages/db/migrations/0059_creative_asset_ratings.sql', import.meta.url), 'utf8');
  beforeAll(async () => {
    await db.insert(tenants).values([tenant, otherTenant].map(id => ({ id, name: 'Rating repository test', slug: id })));
    await db.insert(users).values([[user, tenant], [secondUser, tenant], [otherUser, otherTenant]].map(([id, tenantId]) => ({ id, tenantId, email: `${id}@example.invalid` })));
    await db.insert(creativeAssets).values([[asset, tenant], [otherAsset, otherTenant]].map(([id, tenantId]) => ({ id, tenantId, type: 'image' as const, url: 'https://example.invalid/image' })));
  });
  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenant));
    await db.delete(tenants).where(eq(tenants.id, otherTenant));
    await sql.end();
  });
  it('Dado catálogo migrado, então o arbiter real permite iniciar a API', async () => {
    await expect(validateRatingConstraint()).resolves.toBeUndefined();
  });
  it('Dado mesma chave, quando insere e atualiza, então preserva uma linha e createdAt', async () => {
    const first = await repo.upsertAssetRating(user, asset, 1);
    const second = await repo.upsertAssetRating(user, asset, 5);
    expect(second).toMatchObject({ id: first.id, tenantId: tenant, userId: user, creativeAssetId: asset, rating: 5, createdAt: first.createdAt });
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
    const rows = await db.select().from(creativeAssetRatings).where(eq(creativeAssetRatings.creativeAssetId, asset));
    expect(rows).toHaveLength(1);
  });
  it('Dado dois usuários e tenants, então não sobrescreve avaliações e isola lookup', async () => {
    const first = await repo.upsertAssetRating(user, asset, 2);
    const second = await repo.upsertAssetRating(secondUser, asset, 4);
    const otherRepo = new StudioRepository(otherTenant);
    const third = await otherRepo.upsertAssetRating(otherUser, otherAsset, 3);
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    expect(await repo.findAssetById(otherAsset)).toBeUndefined();
    expect(await repo.findUserById(otherUser)).toBeUndefined();
    expect((await repo.upsertAssetRating(user, asset, 2)).rating).toBe(2);
    expect((await repo.upsertAssetRating(secondUser, asset, 4)).id).toBe(second.id);
  });
  it('Dado asset inexistente, então FK rejeita sem inserir', async () => {
    await expect(repo.upsertAssetRating(user, randomUUID(), 3)).rejects.toMatchObject({ cause: { code: '23503' } });
  });
  it.each([[0, '23514'], [6, '23514'], [1.5, '22P02']] as const)('Dado nota inválida %s, então banco rejeita sem alterar nota anterior', async (rating, code) => {
    const before = await repo.upsertAssetRating(user, asset, 3);
    await expect(repo.upsertAssetRating(user, asset, rating)).rejects.toMatchObject({ cause: { code } });
    const [after] = await db.select().from(creativeAssetRatings).where(eq(creativeAssetRatings.id, before.id));
    expect(after.rating).toBe(3);
  });
  it.each([false, true])('Dado schema isolado com tabela=%s sem arbiter, então identifica SQLSTATE exato', async withTable => {
    const schema = `rating_${randomUUID().replaceAll('-', '')}`;
    await expect(sql.begin(async tx => {
      await tx.unsafe(`CREATE SCHEMA ${schema}`);
      await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
      if (withTable) await tx.unsafe('CREATE TABLE creative_asset_ratings (tenant_id uuid, user_id uuid, creative_asset_id uuid, rating integer)');
      await tx.unsafe('INSERT INTO creative_asset_ratings (tenant_id,user_id,creative_asset_id,rating) VALUES ($1,$2,$3,3) ON CONFLICT (tenant_id,user_id,creative_asset_id) DO UPDATE SET rating=EXCLUDED.rating', [tenant, user, asset]);
    })).rejects.toMatchObject({ code: withTable ? '42P10' : '42P01' });
    // Failed transaction rolls the schema back, without touching public tables.
  });
  it('Dado tabela ausente, quando aplica DDL real, então constraint suporta upsert', async () => {
    const rollback = new Error('rollback test schema');
    await expect(sql.begin(async tx => {
      const schema = `rating_${randomUUID().replaceAll('-', '')}`;
      await tx.unsafe(`CREATE SCHEMA ${schema}`);
      await tx.unsafe(`SET LOCAL search_path TO ${schema}`);
      for (const table of ['tenants', 'users', 'creative_assets']) await tx.unsafe(`CREATE TABLE ${table} (id uuid PRIMARY KEY)`);
      await tx.unsafe('INSERT INTO tenants VALUES ($1)', [tenant]);
      await tx.unsafe('INSERT INTO users VALUES ($1)', [user]);
      await tx.unsafe('INSERT INTO creative_assets VALUES ($1)', [asset]);
      await tx.unsafe(ddl);
      const upsert = 'INSERT INTO creative_asset_ratings (tenant_id,user_id,creative_asset_id,rating) VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id,user_id,creative_asset_id) DO UPDATE SET rating=EXCLUDED.rating RETURNING id,created_at,rating';
      const [first] = await tx.unsafe(upsert, [tenant, user, asset, 1]);
      const [second] = await tx.unsafe(upsert, [tenant, user, asset, 5]);
      expect(second).toMatchObject({ id: first.id, created_at: first.created_at, rating: 5 });
      throw rollback;
    })).rejects.toBe(rollback);
  });
});
