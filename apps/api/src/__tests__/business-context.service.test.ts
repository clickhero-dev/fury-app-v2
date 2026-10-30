import { describe, expect, it, vi } from 'vitest';
import { BusinessContextService } from '../services/core/business-context.service.js';

/**
 * Funcionalidade: melhorar o contexto do negócio com segurança
 * Cenário: stream concluído
 * Dado um texto válido, Quando a IA envia fragmentos e um evento final, Então a sugestão completa é emitida.
 * Cenário: stream incompleto
 * Dado um stream sem evento final, Quando termina, Então a operação falha sem sucesso aparente.
 * Cenário: entrada inválida
 * Dado texto vazio, Quando solicito melhoria, Então a validação rejeita a entrada.
 */
describe('BusinessContextService', () => {
  it('emite os fragmentos somente após evento terminal', async () => {
    const service = new BusinessContextService({
      stream: vi.fn(async function* () {
        yield 'Texto ';
        yield 'melhorado';
        yield { done: true };
      }),
    });

    const result = await service.improve('Contexto original');

    expect(result).toEqual({ suggestion: 'Texto melhorado' });
  });

  it('rejeita stream sem evento terminal', async () => {
    const service = new BusinessContextService({
      stream: vi.fn(async function* () {
        yield 'parcial';
      }),
    });

    await expect(service.improve('Contexto original')).rejects.toMatchObject({
      code: 'BUSINESS_CONTEXT_STREAM_INCOMPLETE',
      statusCode: 502,
    });
  });

  it('rejeita texto vazio antes de chamar o provedor', async () => {
    const stream = vi.fn();
    const service = new BusinessContextService({ stream });

    await expect(service.improve('   ')).rejects.toMatchObject({
      code: 'BUSINESS_CONTEXT_INVALID',
      statusCode: 400,
    });
    expect(stream).not.toHaveBeenCalled();
  });
});
