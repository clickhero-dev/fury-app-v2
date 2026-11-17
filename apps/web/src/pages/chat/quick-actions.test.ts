import { describe, expect, it } from 'vitest';
import { buildQuickActionPrompt, quickActions, quickActionSuggestions, normalizeQuickActionContext } from './quick-actions';

describe('Funcionalidade: contexto confiável para ações rápidas', () => {
  it('Dado dados inválidos Então ignora tipos incorretos e remove espaços e controles', () => {
    expect(normalizeQuickActionContext({tenantName:123,businessContext:[],audienceDefaults:{city:{}}})).toEqual({});
    expect(normalizeQuickActionContext(null)).toEqual({});
    expect(normalizeQuickActionContext({tenantName:'  Flores\nAna  ',audienceDefaults:{city:' Recife '}})).toEqual({tenantName:'Flores Ana',city:'Recife'});
    expect(normalizeQuickActionContext({tenantName:'a'.repeat(500)}).tenantName).toHaveLength(80);
  });
  it('Dado Reels e resposta livre Então envia intenção e salvaguardas sem autorizar execução', () => {
    const prompt = buildQuickActionPrompt(quickActions[2], 'Bastidores da loja', {tenantName:'Flores', businessContext:'Floricultura', city:'Recife'});
    expect(prompt).toContain('Reels para o Instagram em formato vertical');
    expect(prompt).toContain('Bastidores da loja'); expect(prompt).toContain('Floricultura');
    expect(prompt).toContain('confirmação explícita'); expect(prompt).toContain('Esta solicitação não autoriza executar essas ações.');
    expect(buildQuickActionPrompt(quickActions[2], '   ', {})).toBe('');
  });
  it('Dado seis ações Então cada uma tem intenções pertinentes e sem repetições', () => {
    const all = quickActions.map(action => quickActionSuggestions(action, {}));
    all.forEach(options => { expect(options).toHaveLength(3); expect(new Set(options).size).toBe(3); });
    expect(new Set(all.flat()).size).toBeGreaterThan(10);
  });
});
