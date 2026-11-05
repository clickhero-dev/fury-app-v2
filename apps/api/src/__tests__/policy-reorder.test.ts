import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Política v1.1 (card ClickUp 86e3a8rjy): o bloco de reembolso deixa de ser a
 * Seção 1 (destaque na caixa de aceite) e vai para o final do documento.
 *
 * Guard de regressão: garante que a ordem das seções permanece correta tanto na
 * migration (o que efetivamente é seedado no banco) quanto no docs .txt (fonte
 * de revisão humana).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const MIGRATION_PATH = resolve(REPO_ROOT, 'packages/db/migrations/0040_policy_reorder_reembolso.sql');
const DOCS_PATH = resolve(REPO_ROOT, 'docs/politicas-de-uso-ady.txt');

function sectionIndex(text: string, header: string): number {
  return text.indexOf(header);
}

describe('Política v1.1 — reembolso no final do documento', () => {
  it('a migration 0040 existe e seeda a versão 1.1', () => {
    const migration = readFileSync(MIGRATION_PATH, 'utf8');
    expect(migration).toContain("'1.1'");
  });

  it('reembolso vem DEPOIS das demais seções e ANTES do CONTATO (não é mais a 1ª)', () => {
    const migration = readFileSync(MIGRATION_PATH, 'utf8');

    const telemetria = sectionIndex(migration, 'TELEMETRIA E LOGS ANÔNIMOS');
    const alteracoes = sectionIndex(migration, 'ALTERAÇÕES DESTAS POLÍTICAS');
    const reembolso = sectionIndex(migration, 'REEMBOLSO E CANCELAMENTO');
    // 'CONTATO' também aparece no comentário do topo da migration — busca a
    // partir do bloco de reembolso para pegar o header da seção, não o comentário.
    const contato = migration.indexOf('CONTATO', reembolso);

    // telemetria é a primeira seção numerada
    expect(telemetria).toBeGreaterThan(-1);
    // reembolso fica após todas as seções principais
    expect(reembolso).toBeGreaterThan(alteracoes);
    expect(alteracoes).toBeGreaterThan(telemetria);
    // e imediatamente antes do bloco CONTATO
    expect(reembolso).toBeLessThan(contato);
  });

  it('docs .txt espelha a mesma ordem (reembolso após alterações)', () => {
    const doc = readFileSync(DOCS_PATH, 'utf8');
    const alteracoes = sectionIndex(doc, 'ALTERAÇÕES DESTAS POLÍTICAS');
    const reembolso = sectionIndex(doc, 'REEMBOLSO E CANCELAMENTO');
    expect(alteracoes).toBeGreaterThan(-1);
    expect(reembolso).toBeGreaterThan(alteracoes);
  });
});
