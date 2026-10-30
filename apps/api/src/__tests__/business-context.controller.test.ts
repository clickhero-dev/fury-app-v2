import { describe, expect, it, vi } from 'vitest';
import { BusinessContextController } from '../controllers/business-context.controller.js';

/**
 * Funcionalidade: receber melhoria do contexto do negócio
 * Cenário: resposta incremental
 * Dado texto válido, Quando a pessoa solicita melhoria, Então a API envia fragmentos e evento final.
 * Cenário: entrada inválida
 * Dado texto vazio, Quando solicita melhoria, Então a validação devolve erro sem chamar a IA.
 */
describe('BusinessContextController', () => {
  function response() {
    const res: any = {
      setHeader: vi.fn(), write: vi.fn(), end: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(),
      on: vi.fn(),
    };
    return res;
  }

  it('envia fragmentos SSE e evento final', async () => {
    const service = { stream: vi.fn(() => (async function* () { yield 'Melhor '; yield 'texto'; yield { done: true }; })()) };
    const controller = new BusinessContextController(service as any);
    const res = response();

    await controller.improve({ body: { text: 'Texto original' }, on: vi.fn() } as any, res, vi.fn());

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('fragment'));
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('done'));
    expect(res.end).toHaveBeenCalled();
  });

  it('cancela o stream somente quando o request é abortado', async () => {
    const service = { stream: vi.fn(() => (async function* () { yield { done: true }; })()) };
    const controller = new BusinessContextController(service as any);
    const req = { body: { text: 'Texto original' }, on: vi.fn() };

    await controller.improve(req as any, response(), vi.fn());

    expect(req.on).toHaveBeenCalledWith('aborted', expect.any(Function));
    expect(req.on).not.toHaveBeenCalledWith('close', expect.any(Function));
  });

  it('encaminha erro de entrada inválida e não inicia stream', async () => {
    const service = { stream: vi.fn(() => { throw Object.assign(new Error('bad'), { statusCode: 400 }); }) };
    const controller = new BusinessContextController(service as any);
    const next = vi.fn();

    await controller.improve({ body: { text: '' }, on: vi.fn() } as any, response(), next);

    expect(service.stream).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});
