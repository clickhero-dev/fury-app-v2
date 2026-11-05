import { describe, it, expect } from 'vitest';
import {
  formatPhoneDisplay,
  normalizePhoneToMeta,
  isValidBusinessPhone,
} from './phone-format';

describe('formatPhoneDisplay', () => {
  it('número nacional 11 dígitos (DDD 55 = Rio Grande do Sul!) — caso real do bug', () => {
    // BUG: antes assumia DDI 55 e mostrava "+55 (98) 12863-44".
    // DDD 55 EXISTE (RS) — 10/11 dígitos são SEMPRE DDD + número.
    expect(formatPhoneDisplay('55981286344')).toBe('(55) 98128-6344');
  });

  it('número nacional sem DDI (10 dígitos: fixo)', () => {
    expect(formatPhoneDisplay('4733334444')).toBe('(47) 3333-4444');
  });

  it('número nacional sem DDI (11 dígitos: celular)', () => {
    expect(formatPhoneDisplay('11932734241')).toBe('(11) 93273-4241');
  });

  it('número completo com DDI (13 dígitos: 55 + DDD + celular)', () => {
    expect(formatPhoneDisplay('5511999999999')).toBe('+55 (11) 99999-9999');
  });

  it('número completo com DDI (12 dígitos: 55 + DDD + fixo)', () => {
    expect(formatPhoneDisplay('551133334444')).toBe('+55 (11) 3333-4444');
  });

  it('ignora caracteres não numéricos', () => {
    expect(formatPhoneDisplay('(55) 98128-6344')).toBe('(55) 98128-6344');
  });

  it('entrada vazia / curta não quebra', () => {
    expect(formatPhoneDisplay('')).toBe('');
    expect(formatPhoneDisplay('11')).toBe('11');
  });
});

describe('normalizePhoneToMeta', () => {
  it('mantém somente dígitos e completa DDI 55 em número nacional (DDD 55 incluso)', () => {
    // (55) 98128-6344 → DDI 55 + DDD 55 + número = 5555981286344
    expect(normalizePhoneToMeta('55981286344')).toBe('5555981286344');
    expect(normalizePhoneToMeta('(11) 99999-9999')).toBe('5511999999999');
    expect(normalizePhoneToMeta('47984001471')).toBe('5547984001471');
  });

  it('não duplica DDI quando o número já tem 12/13 dígitos com 55', () => {
    expect(normalizePhoneToMeta('5511999999999')).toBe('5511999999999');
    expect(normalizePhoneToMeta('551133334444')).toBe('551133334444');
  });
});

describe('isValidBusinessPhone', () => {
  it('aceita nacional 10/11 dígitos e completo 12/13 com DDI 55', () => {
    expect(isValidBusinessPhone('47984001471')).toBe(true); // 11, DDD 47
    expect(isValidBusinessPhone('55981286344')).toBe(true); // 11, DDD 55 (RS)
    expect(isValidBusinessPhone('551133334444')).toBe(true); // 12 com DDI
    expect(isValidBusinessPhone('5511999999999')).toBe(true); // 13 com DDI
  });

  it('rejeita vazio, curto e 12/13 sem DDI 55', () => {
    expect(isValidBusinessPhone('')).toBe(false);
    expect(isValidBusinessPhone('119')).toBe(false);
    expect(isValidBusinessPhone('981286344')).toBe(false); // 9 dígitos
    expect(isValidBusinessPhone('9911987654321')).toBe(false); // 13 sem DDI 55
  });
});
