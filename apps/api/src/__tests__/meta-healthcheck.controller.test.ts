// =============================================================================
// BDD — Endpoints administrativos do healthcheck Meta
/*
# Language: pt-BR

Funcionalidade: Consultar e atualizar diagnóstico Meta no superadmin

  Cenário: lista de usuários não inicia chamadas Meta
    Dado usuários com e sem conexão Meta
    Quando GET /admin/healthchecks/users
    Então responde a lista sem credenciais e não roda healthcheck

  Cenário: consulta pelo usuário retorna último resultado do tenant
    Dado usuário existente e último resultado salvo
    Quando GET /admin/healthchecks?userId=<id>
    Então responde usuário e resultado atual

  Cenário: executar manualmente resolve tenant e salva resultado
    Dado usuário existente
    Quando POST /admin/healthchecks/run com userId
    Então executa o healthcheck do tenant associado

  Cenário: usuário inexistente e parâmetro inválido são rejeitados
    Dado um id que não existe ou é inválido
    Quando consulto ou executo o healthcheck
    Então retorna erro 404 ou erro de validação 400
*/
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaHealthcheckController } from '../controllers/meta-healthcheck.controller.js';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const TENANT_ID = '123e4567-e89b-12d3-a456-426614174001';
const user = { userId: USER_ID, tenantId: TENANT_ID, name: 'Ana', email: 'ana@example.com', tenantName: 'Loja Ana' };

function setup() {
  const repo = {
    listUsers: vi.fn(async () => [{ ...user, connectionId: 'connection-1', accessToken: undefined }]),
    findUser: vi.fn(async () => user),
    findLatest: vi.fn(async () => ({ tenantId: TENANT_ID, status: 'success' })),
  };
  const healthcheckService = { runForTenant: vi.fn(async () => ({ tenantId: TENANT_ID, status: 'success' })) };
  const controller = new MetaHealthcheckController(repo as any, healthcheckService as any);
  const res = { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;
  return { controller, repo, healthcheckService, res };
}

describe('BDD: MetaHealthcheckController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Cenário: lista usuários sem iniciar probes ou revelar token', async () => {
    const { controller, repo, healthcheckService, res } = setup();

    await controller.listUsers({} as any, res, vi.fn() as any);

    expect(repo.listUsers).toHaveBeenCalledOnce();
    expect(healthcheckService.runForTenant).not.toHaveBeenCalled();
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('accessToken');
  });

  it('Cenário: consulta usuário e último resultado por tenant', async () => {
    const { controller, repo, res } = setup();

    await controller.getLatest({ query: { userId: USER_ID } } as any, res, vi.fn() as any);

    expect(repo.findLatest).toHaveBeenCalledWith(TENANT_ID);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ user, result: expect.any(Object) }) }));
  });

  it('Cenário: execução manual usa tenant do usuário selecionado', async () => {
    const { controller, healthcheckService, res } = setup();

    await controller.run({ body: { userId: USER_ID } } as any, res, vi.fn() as any);

    expect(healthcheckService.runForTenant).toHaveBeenCalledWith(TENANT_ID);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ status: 'success' }) }));
  });

  it('Cenário: usuário inexistente propaga 404 e id inválido propaga ZodError', async () => {
    const { controller, repo } = setup();
    const next = vi.fn();
    repo.findUser.mockResolvedValueOnce(null as any);
    await controller.getLatest({ query: { userId: USER_ID } } as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));

    next.mockClear();
    await controller.run({ body: { userId: 'bad' } } as any, {} as any, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
  });
});
