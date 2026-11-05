import { describe, it, expect } from 'vitest';
import { sanitizeTypos } from '../utils/sanitize-typos.js';

describe('sanitizeTypos', () => {
  it('deve corrigir "internacionales" para "internacionais"', () => {
    expect(sanitizeTypos('internacionales')).toBe('internacionais');
  });

  it('deve corrigir "Inscriçcões" para "Inscrições"', () => {
    expect(sanitizeTypos('Inscriçcões')).toBe('Inscrições');
  });

  it('deve corrigir typos no meio de frases', () => {
    expect(sanitizeTypos('Descontos internacionales')).toBe('Descontos internacionais');
    expect(sanitizeTypos('Inscriçcões abertas')).toBe('Inscrições abertas');
  });

  it('deve passar texto sem typos intacto', () => {
    const clean = 'Promoção válida para todo o Brasil';
    expect(sanitizeTypos(clean)).toBe(clean);
  });

  it('deve corrigir múltiplas ocorrências do mesmo typo', () => {
    expect(sanitizeTypos('internacionales e mais internacionales')).toBe('internacionais e mais internacionais');
  });

  it('deve retornar string vazia se input for vazio', () => {
    expect(sanitizeTypos('')).toBe('');
  });
});
