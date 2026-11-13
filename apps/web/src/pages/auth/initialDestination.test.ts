/*
# Language: pt-BR
Funcionalidade: destino inicial após autenticação
  Cenário: Trial ativo acessa o chat
  Cenário: assinaturas não Trial ou expiradas mantêm o destino anterior
  Cenário: falha ou dados inválidos não comprovam Trial ativo
*/
import { describe, expect, it } from 'vitest';
import { initialDestination } from './initialDestination';

describe('destino inicial', () => {
  it('leva Trial ativo ao chat', () => {
    expect(initialDestination({ status: 'trial', trialEndsAt: '2100-01-01T00:00:00Z' })).toBe('/chat');
    expect(initialDestination({ status: 'trial', trialEndsAt: null })).toBe('/chat');
  });
  it('preserva dashboard para plano pago, expirado, ausente ou inválido', () => {
    expect(initialDestination({ status: 'active', trialEndsAt: null })).toBe('/dashboard');
    expect(initialDestination({ status: 'trial', trialEndsAt: '2000-01-01T00:00:00Z' })).toBe('/dashboard');
    expect(initialDestination({ status: 'trial', trialEndsAt: 'inválida' })).toBe('/dashboard');
    expect(initialDestination(null)).toBe('/dashboard');
  });
});
