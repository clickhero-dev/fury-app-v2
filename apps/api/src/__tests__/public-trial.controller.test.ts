/**
 * Funcionalidade: cadastro público e acesso ao Trial
 * Cenários:
 * - Dado cadastro válido com Origin permitido, quando solicita Trial, então recebe resposta genérica sem expor a conta.
 * - Dado token malformado, quando tenta acessar, então a sessão não é emitida.
 * - Dado Origin ausente, quando solicita signup ou resgata link, então rejeita antes do serviço.
 * - Dado token válido e serviço disponível, quando resgata o link, então recebe sessão normal.
 * - Dado tentativas de token repetidas, quando excede o limite, então bloqueia antes do consumo do link.
 * - Dado email recém-solicitado, quando pede novo link antes do prazo, então bloqueia nova emissão atomicamente.
 * - Dado configuração FRONTEND_URL, quando valida Origin, então permite apenas esse domínio.
 * - Dado Redis indisponível, quando limita signup ou acesso, então falha fechado.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicTrialController } from '../controllers/public-trial.controller.js';

const { evalRedis } = vi.hoisted(() => ({ evalRedis: vi.fn() }));
vi.mock('../lib/redis.js', () => ({ getRedis: () => ({ eval: evalRedis }) }));

const APP_ORIGIN = 'https://app.example.com';

function response() {
  const res = { set: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

function makeRequest(body: unknown, origin: string | null = APP_ORIGIN, ip = '127.0.0.1') {
  return {
    body,
    ip,
    header: (name: string) => name.toLowerCase() === 'origin' ? origin ?? undefined : undefined,
  } as never;
}

describe('PublicTrialController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PUBLIC_TRIAL_RATE_KEY', 'test-key');
    vi.stubEnv('PUBLIC_TRIAL_ALLOWED_ORIGINS', APP_ORIGIN);
    vi.stubEnv('FRONTEND_URL', '');
    evalRedis.mockResolvedValue(1);
  });

  it('Dado email enviado de Origin permitido, quando pede acesso, então responde sem confirmar se existe conta', async () => {
    const service = { signup: vi.fn().mockResolvedValue({ message: 'Se for possível, enviaremos um link de acesso.' }) };
    const controller = new PublicTrialController(service as never);
    const req = makeRequest({ name: 'Ana', email: 'ana@example.com' });
    const res = response();
    const next = vi.fn();

    await controller.signup(req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { message: 'Se for possível, enviaremos um link de acesso.' } }));
    expect(next).not.toHaveBeenCalled();
    expect(evalRedis).toHaveBeenCalledTimes(1);
    expect(evalRedis.mock.calls[0][1]).toBe(2);
    expect(evalRedis.mock.calls[0][2]).not.toContain('127.0.0.1');
    expect(evalRedis.mock.calls[0][3]).not.toContain('ana@example.com');
  });

  it('Dado token malformado, quando resgata o acesso, então retorna erro de validação sem criar sessão', async () => {
    const service = { access: vi.fn() };
    const controller = new PublicTrialController(service as never);
    const next = vi.fn();

    await controller.access(makeRequest({ token: 'invalido' }), response() as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
    expect(service.access).not.toHaveBeenCalled();
    expect(evalRedis).not.toHaveBeenCalled();
  });

  it('Dado Origin ausente, quando solicita signup, então rejeita sem limite Redis ou criação', async () => {
    vi.stubEnv('PUBLIC_TRIAL_ALLOWED_ORIGINS', '');
    vi.stubEnv('FRONTEND_URL', '');
    const service = { signup: vi.fn() };
    const controller = new PublicTrialController(service as never);
    const next = vi.fn();

    await controller.signup(makeRequest({ name: 'Ana', email: 'ana@example.com' }, null), response() as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: 'ORIGIN_NOT_ALLOWED' }));
    expect(evalRedis).not.toHaveBeenCalled();
    expect(service.signup).not.toHaveBeenCalled();
  });

  it('Dado Origin ausente, quando resgata link, então rejeita sem consultar token ou emitir sessão', async () => {
    vi.stubEnv('PUBLIC_TRIAL_ALLOWED_ORIGINS', '');
    vi.stubEnv('FRONTEND_URL', '');
    const service = { access: vi.fn() };
    const controller = new PublicTrialController(service as never);
    const next = vi.fn();

    await controller.access(makeRequest({ token: 'a'.repeat(64) }, null), response() as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: 'ORIGIN_NOT_ALLOWED' }));
    expect(evalRedis).not.toHaveBeenCalled();
    expect(service.access).not.toHaveBeenCalled();
  });

  it('Dado Origin de frontend configurada, quando recebe outro domínio, então rejeita antes do serviço', async () => {
    vi.stubEnv('PUBLIC_TRIAL_ALLOWED_ORIGINS', '');
    vi.stubEnv('FRONTEND_URL', 'https://app.example.com/path');
    const service = { signup: vi.fn() };
    const controller = new PublicTrialController(service as never);
    const next = vi.fn();

    await controller.signup(makeRequest({ name: 'Ana', email: 'ana@example.com' }, 'https://attacker.example'), response() as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: 'ORIGIN_NOT_ALLOWED' }));
    expect(evalRedis).not.toHaveBeenCalled();
    expect(service.signup).not.toHaveBeenCalled();
  });

  it('Dado Origin correspondente à FRONTEND_URL, quando solicita Trial, então permite o cadastro público', async () => {
    vi.stubEnv('PUBLIC_TRIAL_ALLOWED_ORIGINS', '');
    vi.stubEnv('FRONTEND_URL', 'https://app.example.com/path');
    const service = { signup: vi.fn().mockResolvedValue({ message: 'Se for possível, enviaremos um link de acesso.' }) };
    const controller = new PublicTrialController(service as never);
    const res = response();
    const next = vi.fn();

    await controller.signup(makeRequest({ name: 'Ana', email: 'ana@example.com' }), res as never, next);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(next).not.toHaveBeenCalled();
    expect(service.signup).toHaveBeenCalledOnce();
    expect(evalRedis).toHaveBeenCalledOnce();
  });

  it('Dado email já limitado, quando repete pedido, então rejeita sem incrementar quota de IP', async () => {
    evalRedis.mockResolvedValueOnce(0);
    const service = { signup: vi.fn() };
    const controller = new PublicTrialController(service as never);
    const next = vi.fn();

    await controller.signup(makeRequest({ name: 'Ana', email: 'ana@example.com' }), response() as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429, code: 'TRIAL_RATE_LIMITED' }));
    expect(evalRedis).toHaveBeenCalledOnce();
    const [script, keyCount] = evalRedis.mock.calls[0];
    expect(keyCount).toBe(2);
    expect(script).toContain("redis.call('GET', KEYS[1])");
    expect(script).toContain("redis.call('GET', KEYS[2])");
    expect(script.indexOf('then return 0 end')).toBeLessThan(script.indexOf("redis.call('INCR'"));
    expect(service.signup).not.toHaveBeenCalled();
  });

  it('Dado token válido, quando acessa dentro do limite, então devolve sessão sem consumir chave de signup', async () => {
    const session = { tokens: { accessToken: 'access', refreshToken: 'refresh' }, user: { id: 'u1' } };
    const service = { access: vi.fn().mockResolvedValue(session) };
    const controller = new PublicTrialController(service as never);
    const res = response();
    const next = vi.fn();

    await controller.access(makeRequest({ token: 'a'.repeat(64) }), res as never, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: { token: 'access', refreshToken: 'refresh', user: session.user } }));
    expect(next).not.toHaveBeenCalled();
    expect(evalRedis).toHaveBeenCalledOnce();
    expect(evalRedis.mock.calls[0][1]).toBe(2);
    expect(evalRedis.mock.calls[0].slice(4)).toEqual([60, 5, 900]);
    expect(evalRedis.mock.calls[0][2]).not.toContain('127.0.0.1');
    expect(evalRedis.mock.calls[0][3]).not.toContain('a'.repeat(64));
  });

  it('Dado tentativas de token excedidas, quando resgata link, então limita IP e token sem consultar sessão', async () => {
    evalRedis.mockResolvedValueOnce(0);
    const service = { access: vi.fn() };
    const controller = new PublicTrialController(service as never);
    const next = vi.fn();

    await controller.access(makeRequest({ token: 'b'.repeat(64) }), response() as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 429, code: 'TRIAL_RATE_LIMITED' }));
    expect(evalRedis).toHaveBeenCalledOnce();
    expect(evalRedis.mock.calls[0][1]).toBe(2);
    expect(evalRedis.mock.calls[0].slice(4)).toEqual([60, 5, 900]);
    expect(service.access).not.toHaveBeenCalled();
  });

  it('Dado Redis indisponível, quando limita signup, então falha fechado sem criar conta', async () => {
    evalRedis.mockRejectedValueOnce(new Error('redis unavailable'));
    const service = { signup: vi.fn() };
    const controller = new PublicTrialController(service as never);
    const next = vi.fn();

    await controller.signup(makeRequest({ name: 'Ana', email: 'ana@example.com' }), response() as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503, code: 'TRIAL_RATE_LIMIT_UNAVAILABLE' }));
    expect(service.signup).not.toHaveBeenCalled();
  });

  it('Dado Redis indisponível, quando limita resgate, então falha fechado sem consultar token', async () => {
    evalRedis.mockRejectedValueOnce(new Error('redis unavailable'));
    const service = { access: vi.fn() };
    const controller = new PublicTrialController(service as never);
    const next = vi.fn();

    await controller.access(makeRequest({ token: 'c'.repeat(64) }), response() as never, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503, code: 'TRIAL_RATE_LIMIT_UNAVAILABLE' }));
    expect(service.access).not.toHaveBeenCalled();
  });

  it('Dado JWT_SECRET configurado, quando limita cadastros sem chave dedicada, então aceita a solicitação', async () => {
    vi.stubEnv('PUBLIC_TRIAL_RATE_KEY', '');
    vi.stubEnv('JWT_SECRET', 'existing-jwt-test-secret');
    const service = { signup: vi.fn().mockResolvedValue({ message: 'Se for possível, enviaremos um link de acesso.' }) };
    const controller = new PublicTrialController(service as never);
    const res = response();
    const next = vi.fn();

    await controller.signup(makeRequest({ name: 'Ana', email: 'ana@example.com' }), res as never, next);

    expect(res.status).toHaveBeenCalledWith(202);
    expect(next).not.toHaveBeenCalled();
    expect(service.signup).toHaveBeenCalledOnce();
  });
});
