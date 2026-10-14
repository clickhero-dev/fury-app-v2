// =============================================================================
// BDD — Healthcheck real da integração Meta
/*
# Language: pt-BR

Funcionalidade: Diagnóstico da integração Meta por tenant

  Cenário: conexão válida e todos os recursos acessíveis
    Dado um tenant com token, conta de anúncios, Página e Instagram selecionados
    Quando executo o healthcheck
    Então consulta a Meta para validar token, permissões e capacidades
    E persiste o estado mais recente como success
    E inclui a data e o último resultado de sincronização

  Cenário: token armazenado expirado
    Dado uma conexão com tokenExpiresAt no passado
    Quando executo o healthcheck
    Então token fica failed e nenhuma capacidade é marcada como saudável
    E salva a execução sem expor o token

  Cenário: uma capacidade falha sem interromper as demais
    Dado chamadas de Instagram e formulário bem sucedidas
    E a consulta de métricas retorna timeout
    Quando executo o healthcheck
    Então mantém os resultados independentes e marca o resultado geral partial
    E a razão retornada é client-safe

  Cenário: conexão inexistente
    Dado tenant sem conexão Meta
    Quando executo o healthcheck
    Então marca conexão e capacidades como failed e persiste a execução
*/
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaHealthcheckService } from '../services/meta/meta-healthcheck.service.js';

const tenantId = 'tenant-1';
const token = 'secret-meta-access-token';

function fixtures(overrides: { connection?: any; api?: Record<string, any>; latestSync?: any } = {}) {
  const connection = overrides.connection === undefined ? {
    accessToken: 'encrypted-token',
    tokenExpiresAt: new Date('2026-10-07T12:00:00.000Z'),
    selectedAdAccountId: 'act_123',
    selectedInstagramUserId: 'ig_123',
    selectedPageIds: ['page_123'],
  } : overrides.connection;
  const saved: any[] = [];
  const metaRepository = { findLatestMetaConnection: vi.fn(async () => connection) };
  const healthRepository = {
    saveLatest: vi.fn(async (result: any) => { saved.push(result); return result; }),
    findLatestSyncRun: vi.fn(async () => overrides.latestSync ?? ({ status: 'partial', startedAt: new Date('2026-10-05T12:00:00.000Z') })),
  };
  const metaApi = {
    getMetaUserId: vi.fn(async () => 'meta-user-1'),
    getUserPermissions: vi.fn(async () => [
      'instagram_basic', 'instagram_content_publish', 'ads_read', 'ads_management',
      'pages_show_list', 'pages_manage_ads', 'business_management',
    ]),
    getInstagramMedia: vi.fn(async () => []),
    getPageAccessToken: vi.fn(async () => ({ pageId: 'page_123', name: 'Página', accessToken: 'page-token', tasks: ['ADVERTISE'] })),
    listAccountCampaigns: vi.fn(async () => []),
    getMetaInsights: vi.fn(async () => ({ data: [] })),
    ...overrides.api,
  };
  const service = new MetaHealthcheckService({
    metaRepositoryFactory: () => metaRepository as any,
    healthRepository: healthRepository as any,
    decryptToken: vi.fn(() => token),
    metaApi: metaApi as any,
    now: () => new Date('2026-10-06T12:00:00.000Z'),
  } as any);
  return { service, metaRepository, healthRepository, metaApi, saved };
}

describe('BDD: MetaHealthcheckService.runForTenant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Cenário: conexão válida verifica recursos e salva estado mais recente', async () => {
    const { service, metaApi, healthRepository, saved } = fixtures();

    const result = await service.runForTenant(tenantId);

    expect(metaApi.getMetaUserId).toHaveBeenCalledWith(token);
    expect(metaApi.getInstagramMedia).toHaveBeenCalledWith('ig_123', token);
    expect(metaApi.getPageAccessToken).toHaveBeenCalledWith(token, 'page_123');
    expect(metaApi.listAccountCampaigns).toHaveBeenCalledWith('act_123', token);
    expect(metaApi.getMetaInsights).toHaveBeenCalledWith(expect.objectContaining({ accessToken: token, adAccountId: 'act_123' }));
    expect(result.status).toBe('success');
    expect(result.lastSync).toMatchObject({ status: 'partial', startedAt: '2026-10-05T12:00:00.000Z' });
    expect(healthRepository.saveLatest).toHaveBeenCalledWith(result);
    expect(saved).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(token);
  });

  it('Cenário: token expirado não executa probes de capacidade', async () => {
    const { service, metaApi, healthRepository } = fixtures({
      connection: { accessToken: 'encrypted-token', tokenExpiresAt: new Date('2026-10-05T00:00:00.000Z') },
    });

    const result = await service.runForTenant(tenantId);

    expect(result.status).toBe('failed');
    expect(result.checks.token.status).toBe('failed');
    expect(metaApi.getMetaUserId).not.toHaveBeenCalled();
    expect(healthRepository.saveLatest).toHaveBeenCalledOnce();
  });

  it('Cenário: timeout de métricas vira falha parcial sanitizada e não interrompe os outros checks', async () => {
    const timeout = Object.assign(new Error('Timeout with access_token=top-secret-value'), { httpStatus: 504 });
    const { service, metaApi } = fixtures({ api: { getMetaInsights: vi.fn(async () => { throw timeout; }) } });

    const result = await service.runForTenant(tenantId);

    expect(result.status).toBe('partial');
    expect(result.checks.metrics.status).toBe('failed');
    expect(result.checks.instagramPublish.status).toBe('success');
    expect(result.checks.leadFormCampaigns.status).toBe('success');
    expect(result.checks.metrics.reason).not.toContain('top-secret-value');
    expect(metaApi.getInstagramMedia).toHaveBeenCalledOnce();
  });

  it('Cenário: conexão inexistente é persistida como falha', async () => {
    const { service, healthRepository } = fixtures({ connection: null });

    const result = await service.runForTenant(tenantId);

    expect(result.status).toBe('failed');
    expect(result.checks.connection.status).toBe('failed');
    expect(healthRepository.saveLatest).toHaveBeenCalledWith(result);
  });

  it('Cenário: bloqueio sinalizado pela Meta é distinguido de falha de permissão', async () => {
    const blocked = Object.assign(new Error('Your account is blocked by a security checkpoint.'), { metaCode: 368 });
    const { service } = fixtures({ api: { getMetaUserId: vi.fn(async () => { throw blocked; }) } });

    const result = await service.runForTenant(tenantId);

    expect(result.checks.metaBlocked.status).toBe('failed');
    expect(result.checks.token.status).toBe('failed');
    expect(result.status).toBe('failed');
    expect(result.checks.metaBlocked.reason).not.toContain('checkpoint');
  });

  it('Cenário: permissões ausentes isolam publicação e campanhas das métricas', async () => {
    const { service, metaApi } = fixtures({ api: { getUserPermissions: vi.fn(async () => ['ads_read']) } });

    const result = await service.runForTenant(tenantId);

    expect(result.status).toBe('partial');
    expect(result.checks.instagramPublish.code).toBe('META_PERMISSION_DENIED');
    expect(result.checks.leadFormCampaigns.code).toBe('META_PERMISSION_DENIED');
    expect(result.checks.metrics.status).toBe('success');
    expect(metaApi.getInstagramMedia).not.toHaveBeenCalled();
  });
});
