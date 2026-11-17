/* Funcionalidade: disponibilizar avaliações no boot da API.
 * Dado banco sem avaliações, quando migra, então cria a tabela uma única vez.
 * Dado schema incompleto ou falha na DDL, então o boot deve falhar. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ applied: new Set<string>(), statements: [] as string[], tables: [] as string[], failRatings: false }));
vi.mock('postgres', () => ({
  default: () => Object.assign(async (strings: TemplateStringsArray) => {
    const query = strings.join('?');
    if (query.includes('information_schema.tables')) return state.tables.map(table_name => ({ table_name }));
    if (query.includes('SELECT hash')) return [...state.applied].map(hash => ({ hash }));
    return [];
  }, {
    unsafe: vi.fn(async (query: string, params?: unknown[]) => {
      state.statements.push(query);
      if (state.failRatings && query.includes('CREATE TABLE IF NOT EXISTS creative_asset_ratings')) throw new Error('DDL failed');
      if (query.includes('INSERT INTO "__drizzle_migrations"')) state.applied.add(params![0] as string);
      return [];
    }),
    end: vi.fn(),
  }),
}));
import { REQUIRED_TABLES, runMigrations, runMigrationsAndValidate, validateRequiredTables } from '../../../../packages/db/src/migrate.js';
const tag = '0059_creative_asset_ratings';

describe('migração de avaliações no executor real', () => {
  beforeEach(() => {
    state.applied.clear(); state.statements = []; state.tables = []; state.failRatings = false;
  });
  it('Dado banco sem avaliações, quando migra duas vezes, então executa e registra a DDL uma vez', async () => {
    await runMigrations();
    expect(state.applied.has(tag)).toBe(true);
    expect(state.statements.filter(sql => sql.includes('CREATE TABLE IF NOT EXISTS creative_asset_ratings'))).toHaveLength(1);
    await runMigrations();
    expect(state.statements.filter(sql => sql.includes('CREATE TABLE IF NOT EXISTS creative_asset_ratings'))).toHaveLength(1);
  });
  it('Dado falha na DDL, quando migra, então rejeita sem registrar sucesso', async () => {
    state.failRatings = true;
    await expect(runMigrations()).rejects.toThrow('DDL failed');
    expect(state.applied.has(tag)).toBe(false);
  });
  it('Dado tabela ausente, quando valida, então impede boot incompleto', async () => {
    state.tables = REQUIRED_TABLES.filter(table => table !== 'creative_asset_ratings');
    await expect(validateRequiredTables()).resolves.toEqual({ ok: false, missing: ['creative_asset_ratings'] });
    await expect(runMigrationsAndValidate()).rejects.toThrow('missing tables creative_asset_ratings');
  });
  it('Dado schema completo, quando valida, então permite inicialização', async () => {
    state.tables = [...REQUIRED_TABLES];
    await expect(runMigrationsAndValidate()).resolves.toBeUndefined();
  });
});
