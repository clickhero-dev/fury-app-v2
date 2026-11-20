import { describe, expect, it } from 'vitest';
import { applyTextChoice } from './quick-create-text';

describe('texto da Criação Rápida', () => {
  it('Dado texto explícito, preserva a frase uma vez e substitui a sugestão', () => {
    expect(applyTextChoice('Cena\nTexto na imagem (único texto, escrito exatamente assim): "Sugestão"', 'explicit', 'Terapia de Dianética'))
      .toBe('Cena\nTexto na imagem (único texto, escrito exatamente assim): "Terapia de Dianética"');
  });
  it('Dado sem texto, remove sugestão e proíbe texto', () => {
    expect(applyTextChoice('Cena\nTexto na imagem (único texto, escrito exatamente assim): "Sugestão"', 'none', ''))
      .toBe('Cena\nNão escreva nenhum texto na imagem.');
  });
  it('Dado contexto automático, mantém o resultado do aprimoramento', () => {
    expect(applyTextChoice('Cena original', 'auto', '')).toBe('Cena original');
  });
  it('Dado texto vazio ou com aspas, rejeita a entrada', () => {
    expect(() => applyTextChoice('Cena', 'explicit', '  ')).toThrow();
    expect(() => applyTextChoice('Cena', 'explicit', '"teste"')).toThrow();
  });
});
