/*
Funcionalidade: catálogo técnico de trial para o cadastro manual

Cenário: banco novo ou já migrado sem o plano técnico
  Dado que o migrador executa suas etapas registradas
  Quando a etapa de seed do trial é aplicada
  Então insere trial_new_signup ativo, gratuito e com quota 5

Cenário: catálogo já administrado
  Dado que trial_new_signup ou public_trial_signup já existem
  Quando a etapa é repetida
  Então não altera nem duplica nenhum plano existente
*/
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dbRoot = path.resolve(import.meta.dirname, '../..');

describe('migration 0059_seed_trial_new_signup', () => {
  it('registra uma seed idempotente e restrita ao trial de cadastro manual', () => {
    const sql = fs.readFileSync(path.join(dbRoot, 'migrations/0059_seed_trial_new_signup.sql'), 'utf8');
    const runner = fs.readFileSync(path.join(dbRoot, 'src/migrate.ts'), 'utf8');

    expect(runner).toContain("{ tag: '0059_seed_trial_new_signup' }");
    expect(sql).toMatch(/'trial_new_signup'/);
    expect(sql).toMatch(/'Trial 7 dias'/);
    expect(sql).toMatch(/\b0\b/);
    expect(sql).toMatch(/'monthly'/);
    expect(sql).toMatch(/"creativesPerMonth"\s*:\s*5/);
    expect(sql).toMatch(/ON CONFLICT\s*\("technical_key"\)[\s\S]*DO NOTHING/i);
    expect(sql).not.toMatch(/DO UPDATE/i);
    expect(sql).not.toMatch(/public_trial_signup/);
  });
});
