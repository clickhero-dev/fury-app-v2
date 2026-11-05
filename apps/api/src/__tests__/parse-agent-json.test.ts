import { describe, it, expect } from 'vitest';
import { parseAgentJSON } from '../agents/utils.js';

describe('parseAgentJSON', () => {
  it('faz parse de objeto JSON válido', () => {
    expect(parseAgentJSON('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('faz parse de array JSON válido', () => {
    expect(parseAgentJSON('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it('remove fences markdown ```json', () => {
    expect(parseAgentJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('remove fences markdown ``` (sem lang)', () => {
    expect(parseAgentJSON('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('extrai o JSON de texto com conteúdo antes/depois', () => {
    expect(parseAgentJSON('Aqui está o resultado: {"a": 1} obrigado!')).toEqual({ a: 1 });
  });

  it('tolera trailing commas', () => {
    expect(parseAgentJSON('{"a":1,"b":[1,2,],}')).toEqual({ a: 1, b: [1, 2] });
  });

  it('escapa quebras de linha não escapadas dentro de strings', () => {
    const result = parseAgentJSON<{ a: string }>('{"a":"line1\nline2"}');
    expect(result.a).toBe('line1\nline2');
  });

  it('remove vírgulas duplicadas (caminho repairJson)', () => {
    expect(parseAgentJSON('{"a":1,,,"b":2}')).toEqual({ a: 1, b: 2 });
  });

  it('lança erro quando não há JSON na resposta', () => {
    expect(() => parseAgentJSON('nenhum json aqui')).toThrow(/Nenhum JSON encontrado/);
  });
});
