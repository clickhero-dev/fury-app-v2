/*
# Language: pt-BR

Funcionalidade: consultar contas acessíveis no Google Ads

  Cenário: listar contas acessíveis com os cabeçalhos obrigatórios
    Dado um token OAuth válido e um developer token configurado
    Quando o serviço consulta as contas Google Ads acessíveis
    Então a API externa recebe os cabeçalhos de autenticação
    E retorna os customer IDs disponíveis

  Cenário: informar configuração ausente antes da chamada externa
    Dado que o developer token não está configurado
    Quando o serviço consulta as contas Google Ads acessíveis
    Então a API informa que a integração ainda não está configurada

  Cenário: transformar timeout do provedor em erro client-safe
    Dado que a API externa excede o tempo limite
    Quando o serviço consulta as contas Google Ads acessíveis
    Então a API retorna erro de indisponibilidade sem expor detalhes internos

  Cenário: criar Performance Max com orçamento e assets
    Dado imagens e textos válidos
    Quando o cliente envia o mutate para a conta selecionada
    Então o Google Ads recebe orçamento, campanha, grupo de assets e vínculos

  Cenário: rejeitar dados de campanha incompletos antes de chamar o provedor
    Dado uma campanha sem as duas imagens obrigatórias
    Quando o cliente prepara a mutação
    Então a API informa entrada inválida sem fazer chamada externa
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../middleware/errorHandler.js';
import { GoogleAdsApiClient } from '../lib/google-ads-api.js';

describe('Google Ads API — contas acessíveis', () => {
  const originalDeveloperToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;

  beforeEach(() => {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'developer-token-test';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalDeveloperToken === undefined) delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    else process.env.GOOGLE_ADS_DEVELOPER_TOKEN = originalDeveloperToken;
  });

  it('envia os cabeçalhos obrigatórios e retorna customer IDs', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ resourceNames: ['customers/1234567890'] }), { status: 200 }),
    );
    const client = new GoogleAdsApiClient();

    await expect(client.listAccessibleCustomers('oauth-token')).resolves.toEqual(['1234567890']);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/v26/customers:listAccessibleCustomers'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer oauth-token',
          'developer-token': 'developer-token-test',
        }),
      }),
    );
  });

  it('falha antes da chamada quando não há developer token', async () => {
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const client = new GoogleAdsApiClient();

    await expect(client.listAccessibleCustomers('oauth-token')).rejects.toMatchObject<AppError>({
      statusCode: 503,
      code: 'GOOGLE_ADS_NOT_CONFIGURED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('converte timeout em indisponibilidade client-safe', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    const client = new GoogleAdsApiClient();

    await expect(client.listAccessibleCustomers('oauth-token')).rejects.toMatchObject<AppError>({
      statusCode: 503,
      code: 'GOOGLE_ADS_PROVIDER_UNAVAILABLE',
      message: 'O Google Ads está temporariamente indisponível. Tente novamente.',
    });
  });

  it('cria Performance Max com orçamento e assets', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([4, 5, 6]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ mutateOperationResponses: [{ campaignResult: { resourceName: 'customers/1234567890/campaigns/999' } }] }), { status: 200 }));
    const client = new GoogleAdsApiClient();

    await expect(client.createPerformanceMaxCampaign('oauth-token', {
      customerId: '1234567890', campaignName: 'Campanha local', dailyBudgetBrl: 20,
      headlines: ['Título 1', 'Título 2', 'Título 3'], longHeadline: 'Título longo',
      descriptions: ['Descrição 1', 'Descrição 2'], imageUrls: ['https://img.test/landscape', 'https://img.test/square'],
      businessName: 'Empresa local', finalUrl: 'https://example.com',
    })).resolves.toEqual({ campaignId: '999', partialFailures: [] });

    const mutateCall = fetchMock.mock.calls[2];
    const body = JSON.parse(String((mutateCall[1] as RequestInit).body));
    expect(mutateCall[0]).toContain('/v26/customers/1234567890:mutate');
    expect(body.mutateOperations).toEqual(expect.arrayContaining([
      expect.objectContaining({ campaignBudgetOperation: expect.any(Object) }),
      expect.objectContaining({ campaignOperation: expect.any(Object) }),
      expect.objectContaining({ assetGroupOperation: expect.any(Object) }),
    ]));
  });

  it('rejeita campanha sem as duas imagens antes de chamar o provedor', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const client = new GoogleAdsApiClient();

    await expect(client.createPerformanceMaxCampaign('oauth-token', {
      customerId: '1234567890', campaignName: 'Campanha local', dailyBudgetBrl: 20,
      headlines: ['Título 1', 'Título 2', 'Título 3'], longHeadline: 'Título longo',
      descriptions: ['Descrição 1', 'Descrição 2'], imageUrls: ['https://img.test/landscape'],
      businessName: 'Empresa local', finalUrl: 'https://example.com',
    })).rejects.toMatchObject<AppError>({ statusCode: 400, code: 'GOOGLE_ADS_INVALID_CAMPAIGN' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
