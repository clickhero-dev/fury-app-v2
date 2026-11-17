/* # Language: pt-BR
Funcionalidade: reparar configuração demo legada com segurança
  Cenário: apenas tenant ativo com usuários exclusivamente demo é reparado
    Dado tenants legados demo, comercial, misto, vazio e excluído
    Quando a migração é executada duas vezes
    Então apenas o tenant comprovadamente demo é marcado sem duplicar registros
*/
import { it, expect } from 'vitest';
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

it('Cenário: reparação idempotente preserva tenants comerciais, mistos, vazios e excluídos', async () => {
  const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1 });
  try {
    await sql.begin(async tx => {
      await tx`CREATE TEMP TABLE tenants (id text, slug text, is_demo boolean DEFAULT false, deleted_at timestamp)`;
      await tx`CREATE TEMP TABLE users (id text, tenant_id text, role text, user_type text)`;
      await tx`INSERT INTO tenants (id,slug,deleted_at) VALUES ('demo','fashion-demo',null), ('commercial','fashion-demo',null), ('mixed','fashion-demo',null), ('empty','fashion-demo',null), ('deleted','fashion-demo',now()), ('other','other',null)`;
      await tx`INSERT INTO users VALUES ('a','demo','demo','demo'), ('b','commercial','owner','user'), ('c','mixed','demo','demo'), ('d','mixed','owner','user'), ('e','deleted','demo','demo'), ('f','other','demo','demo')`;
      const migration = readFileSync('packages/db/migrations/0075_repair_legacy_demo.sql', 'utf8');
      await tx.unsafe(migration);
      await tx.unsafe(migration);
      expect(await tx`SELECT id FROM tenants WHERE is_demo = true`).toEqual([{ id: 'demo' }]);
      expect((await tx`SELECT count(*)::int AS count FROM users`)[0].count).toBe(6);
    });
  } finally { await sql.end(); }
});

it('Cenário: reparação está registrada no runner de migrações do deploy', () => {
  const runner = readFileSync('packages/db/src/migrate.ts', 'utf8');
  expect(runner).toContain("{ tag: '0075_repair_legacy_demo' }");
  expect(runner.indexOf("{ tag: '0075_repair_legacy_demo' }")).toBeGreaterThan(runner.indexOf("{ tag: '0056_demo_tenant' }"));
});
