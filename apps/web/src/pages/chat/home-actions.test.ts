/* # language: pt-BR
Funcionalidade: quatro caminhos simples na Home
  Cenário: cada ação começa com uma pergunta e alternativas pertinentes
  Cenário: entrada desconhecida não seleciona fluxo
  Cenário: ausência de contexto e resposta vazia não inventam dados
*/
import { describe, expect, it } from 'vitest';
import { homeActions, homeActionForId, quickActionSuggestions, buildQuickActionPrompt } from './quick-actions';
describe('ações da Home', () => {
  it('valida ids e mantém quatro caminhos na ordem especificada', () => {
    expect(homeActions.map(action => action.id)).toEqual(['orientacao','conteudo','semana','clientes']);
    expect(homeActionForId('invalido')).toBeNull();
    expect(homeActionForId(null)).toBeNull();
    expect(homeActionForId('toString')).toBeNull();
  });
  it.each(['orientacao','conteudo','semana','clientes'])('inicia %s com alternativas, contexto e confirmação', id => {
    const action = homeActionForId(id)!;
    expect(action.question.match(/\?/g)).toHaveLength(1);
    expect(quickActionSuggestions(action, {})).toHaveLength(3);
    const prompt = buildQuickActionPrompt(action,'Minha resposta',{tenantName:'Flores da Ana',city:'Recife'});
    expect(prompt).toContain('Minha resposta');
    expect(prompt).toContain('Flores da Ana');
    expect(prompt).toContain('uma pergunta por vez');
    expect(prompt).toContain('confirmação explícita');
    expect(prompt).toContain('não simule sucesso');
    expect(buildQuickActionPrompt(action, '  ', {})).toBe('');
    expect(buildQuickActionPrompt(action, 'Minha resposta', {})).not.toContain('Flores da Ana');
  });
});
