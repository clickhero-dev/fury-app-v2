import { describe, expect, it } from 'vitest';
import { buildQuickActionPrompt, quickActions, quickActionSuggestions, normalizeQuickActionContext, directQuickActions, buildDirectQuickActionPrompt, contextualQuickActions } from './quick-actions';

describe('Funcionalidade: contexto confiável para ações rápidas', () => {
  it('preserva três pedidos diretos sem pergunta obrigatória e contextualiza opções sem autorizar execução',()=>{
    expect(directQuickActions.map(action=>action.label)).toEqual(['Não sei o que postar','Organizar minha semana','Usar uma foto minha']);
    for(const action of directQuickActions){
      const prompt=buildDirectQuickActionPrompt(action,{tenantName:'Flores',city:'Recife',businessContext:'Floricultura'});
      expect(prompt).toContain('Não faça perguntas opcionais');
      expect(prompt).toContain('Floricultura');
      expect(prompt).not.toContain('Qual é o tema');
      expect(prompt).toContain('não autoriza publicar, agendar, investir em mídia paga');
    }
    const alternatives=contextualQuickActions({tenantName:'Flores',city:'Recife'});
    expect(alternatives).toHaveLength(3);
    expect(alternatives[0].suggestion).toContain('Flores em Recife');
    expect(alternatives[1].suggestion).toContain('Flores');
    expect(alternatives[2].suggestion).toContain('foto de Flores');
  });
  it('contexto é dado delimitado e normalizado, sem credenciais nem pergunta automática',()=>{
    const prompt=buildDirectQuickActionPrompt(directQuickActions[0],{tenantName:'  Flores\nAna ',city:'Recife',businessContext:'Dado "citado"'});
    expect(prompt).toContain('"tenantName":"Flores Ana"');
    expect(prompt).toContain('Dado \\"citado\\"');
    expect(prompt).not.toContain('Qual é o tema');
    expect(prompt).not.toContain('uma pergunta por vez');
  });
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
    expect(prompt).not.toContain(quickActions[2].question);
    expect(buildQuickActionPrompt(quickActions[2], '   ', {})).toBe('');
  });
  it('Dado seis ações Então cada uma tem intenções pertinentes e sem repetições', () => {
    const all = quickActions.map(action => quickActionSuggestions(action, {}));
    all.forEach(options => { expect(options).toHaveLength(3); expect(new Set(options).size).toBe(3); });
    expect(new Set(all.flat()).size).toBeGreaterThan(10);
  });
});
