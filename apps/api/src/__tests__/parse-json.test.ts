import { describe, it, expect } from 'vitest';
import { parseAgentJSON } from '../agents/utils.js';

describe('parseAgentJSON', () => {
  it('parse JSON puro', () => {
    expect(parseAgentJSON<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('remove ```json fence e parse', () => {
    const raw = '```json\n{"a":1}\n```';
    expect(parseAgentJSON<{ a: number }>(raw)).toEqual({ a: 1 });
  });

  it('remove ``` fence sem lang', () => {
    const raw = '```\n{"a":1}\n```';
    expect(parseAgentJSON<{ a: number }>(raw)).toEqual({ a: 1 });
  });

  it('ignora texto antes/depois do JSON', () => {
    const raw = 'Aqui está o JSON:\n{"a":1}\nFim.';
    expect(parseAgentJSON<{ a: number }>(raw)).toEqual({ a: 1 });
  });

  it('extrai objeto dentro de markdown com texto ao redor', () => {
    const raw = '```json\n{"posts":[{"dayIndex":1,"caption":"Legenda","cta":"Saiba mais","hashtags":["#tag"]}]}\n```';
    const result = parseAgentJSON<{ posts: { dayIndex: number }[] }>(raw);
    expect(result.posts[0].dayIndex).toBe(1);
  });

  it('lança erro se não encontrar JSON', () => {
    expect(() => parseAgentJSON('apenas texto')).toThrow('Nenhum JSON encontrado');
  });

  it('lança erro se JSON for inválido', () => {
    expect(() => parseAgentJSON('{a:1}')).toThrow(); // sem aspas nas chaves
  });
});
