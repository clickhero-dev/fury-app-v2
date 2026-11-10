/*
Funcionalidade: persistência do WhatsApp da marca
Cenário: banco migrado permite consultar o WhatsApp da marca
Dado um banco PostgreSQL com as migrações aplicadas
Quando a aplicação consulta os campos do kit de marca
Então a coluna de WhatsApp declarada no schema está disponível
*/
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

const url = process.env.TEST_CHAT_DATABASE_URL;
describe.skipIf(!url)('migração do WhatsApp do kit de marca', () => {
  const sql = postgres(url!, { max: 1 });
  afterAll(() => sql.end());
  it('expõe a coluna que o schema da aplicação consulta', async () => {
    const result = await sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'brand_kits' and column_name = 'whatsapp_number'`;
    expect(result).toHaveLength(1);
    await expect(sql`select whatsapp_number from brand_kits limit 1`).resolves.toBeDefined();
  });
});
