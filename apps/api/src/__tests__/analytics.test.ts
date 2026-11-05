// =============================================================================
// BDD — T002: sanitização de telemetria (analytics)
//
/*
# Language: pt-BR

Funcionalidade: Erros enviados à telemetria não expõem segredos

  Cenário: access_token em URL é redigido
    Dado uma mensagem de erro contendo access_token=<token longo> na URL
    Quando redactSensitiveText é aplicado
    Então o valor é substituído por [REDACTED]

  Cenário: token Meta no stack trace é redigido
    Dado um stack trace com token EAA...
    Quando redactSensitiveText é aplicado
    Então o token não aparece

  Cenário: texto normal não é alterado
    Dado uma mensagem sem segredo
    Quando redactSensitiveText é aplicado
    Então o texto permanece igual
*/
// =============================================================================

import { describe, it, expect } from 'vitest';
import { redactSensitiveText } from '../lib/analytics.js';

describe('BDD: sanitização de telemetria (analytics)', () => {
  it('Cenário: access_token em URL não vaza em mensagem de erro', () => {
    const message =
      'Request failed GET https://graph.facebook.com/v20.0/act_1?access_token=EAAbr4xH9hG8MY0000SUPERLONGO_TOKEN_ABC123';

    const out = redactSensitiveText(message);

    expect(out).toContain('access_token=[REDACTED]');
    expect(out).not.toContain('SUPERLONGO_TOKEN');
  });

  it('Cenário: token Meta no stack trace é redigido', () => {
    const stack =
      'Error: boom\n    at fn (file.ts:1:1)\n    token=EAAbr4xH9hG8MY0000SUPERLONGO_TOKEN_ABC123';

    const out = redactSensitiveText(stack);

    expect(out).not.toMatch(/EAAbr4x/);
    expect(out).toContain('[REDACTED]');
  });

  it('Cenário: texto normal não é alterado', () => {
    const plain = 'erro de rate limit na API Meta (code 80004)';

    expect(redactSensitiveText(plain)).toBe(plain);
  });
});