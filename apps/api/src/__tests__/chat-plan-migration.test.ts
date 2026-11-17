/*
 * Funcionalidade: migrar o estado persistente dos planos do chat
 * Cenário: a API registra a migration aditiva depois dos anexos
 * Dado que a migration de anexos ocupa a tag 0070
 * Quando o runner carrega seu registro
 * Então a migration de planos 0071 é aplicada depois dela.
 */
import { readFile } from 'node:fs/promises';
import { it, expect } from 'vitest';

it('registra chat_plans depois de chat_attachments', async () => {
  const registry = await readFile(new URL('../../../../packages/db/src/migrate.ts', import.meta.url), 'utf8');
  const attachment = registry.indexOf("{ tag: '0070_chat_attachments' }");
  const plans = registry.indexOf("{ tag: '0071_chat_plans' }");
  expect(attachment).toBeGreaterThanOrEqual(0);
  expect(plans).toBeGreaterThan(attachment);
});
