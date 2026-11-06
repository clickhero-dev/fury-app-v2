/** Funcionalidade: contrato HTTP público do trial. */
import { describe, expect, it, vi } from 'vitest';
import { PublicTrialController } from '../controllers/public-trial.controller.js';

const response = () => ({ set: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis(), json: vi.fn() }) as any;

describe('PublicTrialController', () => {
  it('Dado JSON inválido, quando chega ao webhook, então devolve 400 sem iniciar cadastro', async () => {
    const signup = vi.fn();
    const controller = new PublicTrialController({ signup } as any);
    const next = vi.fn();
    await controller.signup({ body: Buffer.from('{'), header: () => undefined, ip: '127.0.0.1' } as any, response(), next);
    expect(signup).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: 'INVALID_JSON' }));
  });

  it('Dado token malformado, quando troca acesso, então rejeita antes de criar sessão', async () => {
    const access = vi.fn();
    const controller = new PublicTrialController({ access } as any);
    const next = vi.fn();
    await controller.access({ body: { token: 'bad' } } as any, response(), next);
    expect(access).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});
