import { describe, it, expect } from 'vitest';
import { isMetaPermissionDenied, sanitizeMetaReason, metaErrorCode } from '../lib/meta-error.js';
import { AppError } from '../middleware/errorHandler.js';

/**
 * AC2.1–AC2.3 — classificação de permissão do erro Meta.
 * `#200/OAuthException` é GENÉRICO: só vira permissão com evidência no texto.
 * A mensagem (`reason`) nunca expõe token/payload/stack.
 */

describe('isMetaPermissionDenied', () => {
  it('NO é permissão quando o erro é um #200 genérico (sem evidência no texto)', () => {
    const err = { metaCode: 200, type: 'OAuthException', message: '(#200) unknown' };
    expect(isMetaPermissionDenied(err)).toBe(false);
  });

  it('SIM é permissão quando o texto do Meta menciona permissão/scope', () => {
    const err = { metaCode: 200, type: 'OAuthException', message: 'Permission denied, pages_manage_ads missing' };
    expect(isMetaPermissionDenied(err)).toBe(true);
  });

  it('SIM é permissão quando error_user_msg menciona permissão (payload do erro)', () => {
    const err = {
      metaCode: 200,
      type: 'OAuthException',
      message: '(#200) OAuthException',
      metaError: { error: { message: '(#200)', error_user_msg: 'You do not have permission' } },
    };
    expect(isMetaPermissionDenied(err)).toBe(true);
  });

  it('token expirado (190) NÃO é falta de permissão', () => {
    const err = { metaCode: 190, message: 'Session has expired' };
    expect(isMetaPermissionDenied(err)).toBe(false);
  });
});

describe('sanitizeMetaReason', () => {
  it('remove aparência de token/secreta e limita o comprimento (AC2.3)', () => {
    const raw = 'OAuthException access_token=EAAWqX3xLongSecretValue123 abc + ' + 'secret=supersecreta; '.repeat(20);
    const reason = sanitizeMetaReason({ message: raw } as Error);
    expect(reason).not.toContain('EAAWqX3xLongSecretValue123');
    expect(reason).not.toContain('supersecreta');
    expect(reason.length).toBeLessThanOrEqual(220);
  });

  it('retorna fallback quando não há mensagem', () => {
    expect(sanitizeMetaReason(undefined, 'fallback')).toBe('fallback');
  });
});

describe('metaErrorCode', () => {
  it('usa o code do AppError', () => {
    expect(metaErrorCode(new AppError(403, 'META_INTEGRATION_ERROR', 'x'))).toBe('META_INTEGRATION_ERROR');
  });
  it('genérico para erro não-AppError', () => {
    expect(metaErrorCode(new Error('boom'))).toBe('META_INTEGRATION_ERROR');
  });
});
