import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/postgres-js';
import { publicTrialMagicLinks } from '@fury/db';
import { PublicTrialRepository } from '../repository/public-trial.repository.js';

const databaseUrl = process.env.TRIAL_LINK_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('limite de usos do link de trial no PostgreSQL', () => {
  const client = postgres(databaseUrl!, { max: 10 });
  const db = drizzle(client);
  const subscriptionUpdate = vi.fn();
  const repository = new PublicTrialRepository({
    update: (table: unknown) => table === publicTrialMagicLinks ? db.update(publicTrialMagicLinks) : { set: () => ({ where: subscriptionUpdate }) },
    query: { publicTrialAccounts: { findFirst: async () => ({ tenantId: 'tenant', userId: 'user' }) }, users: { findFirst: async () => ({ id: 'user' }) } },
  } as any);
  beforeAll(async () => { await client.unsafe('CREATE TABLE IF NOT EXISTS public_trial_magic_links (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL, token_hash varchar(64) NOT NULL UNIQUE, expires_at timestamptz NOT NULL, consumed_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())'); await client.unsafe('ALTER TABLE public_trial_magic_links ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0'); });
  beforeEach(async () => { await client.unsafe('TRUNCATE public_trial_magic_links'); subscriptionUpdate.mockClear(); });
  afterAll(async () => { await client.end(); });
  async function insert(token: string, expires: string, revoked = false) {
    await client`INSERT INTO public_trial_magic_links (account_id, token_hash, expires_at, revoked_at) VALUES ('00000000-0000-0000-0000-000000000001', ${token}, ${expires}::timestamptz, ${revoked ? new Date().toISOString() : null})`;
  }
  it('permite três usos simultâneos e rejeita os demais', async () => {
    await insert('valid', '2099-01-01');
    const results = await Promise.all(Array.from({ length: 8 }, () => repository.consumeMagicLink('valid')));
    expect(results.filter(Boolean)).toHaveLength(3);
    expect(subscriptionUpdate).toHaveBeenCalledTimes(3);
    const [row] = await client`SELECT use_count, consumed_at FROM public_trial_magic_links WHERE token_hash = 'valid'`;
    expect(row.use_count).toBe(3);
    expect(row.consumed_at).not.toBeNull();
  });
  it('não reativa links já consumidos antes da migração', async () => {
    await insert('old', '2099-01-01');
    await client`UPDATE public_trial_magic_links SET consumed_at = now() WHERE token_hash = 'old'`;
    await client.unsafe(await readFile('packages/db/migrations/0062_public_trial_link_uses.sql', 'utf8'));
    expect(await repository.consumeMagicLink('old')).toBeNull();
    const [row] = await client`SELECT use_count FROM public_trial_magic_links WHERE token_hash = 'old'`;
    expect(row.use_count).toBe(3);
  });
  it('rejeita links expirados e revogados', async () => {
    await insert('expired', '2000-01-01');
    await insert('revoked', '2099-01-01', true);
    expect(await repository.consumeMagicLink('expired')).toBeNull();
    expect(await repository.consumeMagicLink('revoked')).toBeNull();
  });
});
