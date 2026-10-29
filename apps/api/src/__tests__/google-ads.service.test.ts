/*
# Language: pt-BR

Funcionalidade: criar campanha Google Ads

  Cenário: criar campanha no modo de integração simulada
    Dado que existe uma conexão Google para o tenant
    E a integração Google Ads simulada está habilitada
    Quando o usuário confirma uma campanha Performance Max
    Então a API retorna um identificador de campanha ativa

  Cenário: impedir criação sem integração Google Ads configurada
    Dado que existe uma conexão Google para o tenant
    E a integração Google Ads real não está configurada
    Quando o usuário confirma uma campanha
    Então a API informa que a integração ainda não está disponível

  Cenário: listar contas Google Ads acessíveis para o tenant
    Dado que existe uma conexão Google com token válido
    Quando o usuário abre a seleção de conta Google Ads
    Então a API retorna os customer IDs acessíveis

  Cenário: salvar a conta Google Ads escolhida
    Dado que existe uma conexão Google para o tenant
    Quando o usuário confirma uma conta acessível
    Então a conta fica vinculada à conexão do tenant

  Cenário: publicar campanha real e persistir o vínculo local
    Dado que o Google Ads está configurado
    Quando a campanha Performance Max é criada
    Então a campanha ativa fica registrada para o tenant

  Cenário: bloquear publicação sem Perfil da Empresa
    Dado que a conta Google Ads está configurada mas não existe perfil local
    Quando o usuário tenta publicar
    Então a API solicita configurar o Perfil da Empresa

  Cenário: bloquear localização fora das configurações
    Dado que o usuário escolhe uma cidade diferente da configurada
    Quando o usuário tenta publicar
    Então a API rejeita a localização

  Cenário: impedir campanha para uma conta que não pertence ao usuário
    Dado uma conexão Google válida
    Quando é enviada uma conta Ads fora da lista acessível
    Então a campanha não é criada no provedor

  Cenário: informar persistência pendente sem esconder campanha criada no provedor
    Dado que o Google Ads criou a campanha
    E o registro local falha temporariamente
    Quando a criação termina
    Então a resposta mantém o identificador da campanha e informa a falha parcial
*/
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AppError } from '../middleware/errorHandler.js';
import { GoogleAdsService } from '../services/google/google-ads.service.js';

describe('GoogleAdsService — criação de campanha', () => {
  const repo = {
    findGoogleConnection: vi.fn(),
    findBusinessProfile: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    repo.findGoogleConnection.mockResolvedValue({ id: 'google-1' });
    repo.findBusinessProfile.mockResolvedValue({ address: { city: 'São Paulo', state: 'SP', country: 'BR' } });
  });

  afterEach(() => {
    delete process.env.GOOGLE_ADS_MOCK;
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  });

  it('retorna identificador ativo no modo simulado', async () => {
    process.env.GOOGLE_ADS_MOCK = 'true';
    const service = new GoogleAdsService(() => repo);

    const result = await service.createCampaign('tenant-1', {
      customerId: '1234567890',
      objective: 'leads',
      locationLevel: 'city', locationValue: 'São Paulo',
      headlines: ['Título 1', 'Título 2', 'Título 3'],
      longHeadline: 'Título longo do anúncio',
      descriptions: ['Descrição 1', 'Descrição 2'],
      destinationUrl: 'https://example.com',
      dailyBudgetBrl: 20,
      imageUrls: [],
    });

    expect(result.status).toBe('ENABLED');
    expect(result.campaignId).toMatch(/^mock-google-/);
    expect(result.partialFailures).toEqual([]);
  });

  it('informa configuração ausente no modo real', async () => {
    const service = new GoogleAdsService(() => repo);

    await expect(service.createCampaign('tenant-1', {
      customerId: '1234567890',
      objective: 'leads',
      locationLevel: 'city', locationValue: 'São Paulo',
      headlines: ['Título 1', 'Título 2', 'Título 3'],
      longHeadline: 'Título longo do anúncio',
      descriptions: ['Descrição 1', 'Descrição 2'],
      destinationUrl: 'https://example.com',
      dailyBudgetBrl: 20,
      imageUrls: [],
    })).rejects.toMatchObject<AppError>({
      statusCode: 503,
      code: 'GOOGLE_ADS_NOT_CONFIGURED',
    });
  });

  it('lista os customer IDs acessíveis', async () => {
    const service = new GoogleAdsService(
      () => repo,
      {
        adsApi: { listAccessibleCustomers: vi.fn().mockResolvedValue(['1234567890']) },
        decryptToken: vi.fn().mockReturnValue('oauth-token'),
      },
    );

    await expect(service.listAccessibleCustomers('tenant-1')).resolves.toEqual(['1234567890']);
  });

  it('salva a conta escolhida', async () => {
    const patchGoogleConnection = vi.fn().mockResolvedValue({ id: 'google-1', accountId: '1234567890' });
    const service = new GoogleAdsService(
      () => ({ ...repo, patchGoogleConnection }) as any,
      { adsApi: { listAccessibleCustomers: vi.fn().mockResolvedValue(['1234567890']) }, decryptToken: vi.fn() },
    );

    await expect(service.selectCustomer('tenant-1', '1234567890')).resolves.toEqual({ accountId: '1234567890' });
    expect(patchGoogleConnection).toHaveBeenCalledWith('google-1', { accountId: '1234567890' });
  });

  it('publica campanha real e persiste o vínculo local', async () => {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'developer-token-test';
    const createCampaign = vi.fn().mockResolvedValue({ id: 'local-1' });
    const createPerformanceMaxCampaign = vi.fn().mockResolvedValue({ campaignId: '987654321', partialFailures: [] });
    const service = new GoogleAdsService(
      () => ({ ...repo, findGoogleConnection: vi.fn().mockResolvedValue({ id: 'google-1', accessToken: 'encrypted' }) }) as any,
      { adsApi: { listAccessibleCustomers: vi.fn().mockResolvedValue(['1234567890']), createPerformanceMaxCampaign }, decryptToken: vi.fn().mockReturnValue('oauth-token') },
      () => ({ createCampaign }) as any,
    );

    await expect(service.createCampaign('tenant-1', {
      customerId: '1234567890', objective: 'leads', locationLevel: 'city', locationValue: 'São Paulo',
      headlines: ['Título 1', 'Título 2', 'Título 3'], longHeadline: 'Título longo',
      descriptions: ['Descrição 1', 'Descrição 2'], destinationUrl: 'https://example.com',
      dailyBudgetBrl: 20, imageUrls: ['https://example.com/landscape.jpg', 'https://example.com/square.jpg'],
    })).resolves.toEqual({ campaignId: '987654321', status: 'ENABLED', partialFailures: [] });
    expect(createPerformanceMaxCampaign).toHaveBeenCalled();
    expect(createCampaign).toHaveBeenCalledWith(expect.objectContaining({ metaCampaignId: 'google-987654321', status: 'active' }));
  });

  it('bloqueia publicação sem Perfil da Empresa', async () => {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'developer-token-test';
    repo.findBusinessProfile.mockResolvedValue(null);
    const service = new GoogleAdsService(() => repo);

    await expect(service.createCampaign('tenant-1', {
      customerId: '1234567890', objective: 'leads', locationLevel: 'city', locationValue: 'São Paulo',
      headlines: ['Título 1', 'Título 2', 'Título 3'], longHeadline: 'Título longo',
      descriptions: ['Descrição 1', 'Descrição 2'], destinationUrl: 'https://example.com', dailyBudgetBrl: 20,
      imageUrls: ['https://example.com/landscape.jpg', 'https://example.com/square.jpg'],
    })).rejects.toMatchObject({ statusCode: 400, code: 'GOOGLE_BUSINESS_PROFILE_REQUIRED' });
  });

  it('bloqueia localização fora das configurações', async () => {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'developer-token-test';
    const service = new GoogleAdsService(() => repo);

    await expect(service.createCampaign('tenant-1', {
      customerId: '1234567890', objective: 'leads', locationLevel: 'city', locationValue: 'Campinas',
      headlines: ['Título 1', 'Título 2', 'Título 3'], longHeadline: 'Título longo',
      descriptions: ['Descrição 1', 'Descrição 2'], destinationUrl: 'https://example.com', dailyBudgetBrl: 20,
      imageUrls: ['https://example.com/landscape.jpg', 'https://example.com/square.jpg'],
    })).rejects.toMatchObject({ statusCode: 400, code: 'GOOGLE_LOCATION_NOT_CONFIGURED' });
  });

  it('bloqueia campanha para customer ID que não é acessível', async () => {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'developer-token-test';
    const createPerformanceMaxCampaign = vi.fn();
    const service = new GoogleAdsService(
      () => ({ ...repo, findGoogleConnection: vi.fn().mockResolvedValue({ id: 'google-1', accessToken: 'encrypted' }) }) as any,
      {
        adsApi: { listAccessibleCustomers: vi.fn().mockResolvedValue(['1111111111']), createPerformanceMaxCampaign },
        decryptToken: vi.fn().mockReturnValue('oauth-token'),
      },
    );

    await expect(service.createCampaign('tenant-1', {
      customerId: '1234567890', objective: 'leads', locationLevel: 'city', locationValue: 'São Paulo',
      headlines: ['Título 1', 'Título 2', 'Título 3'], longHeadline: 'Título longo',
      descriptions: ['Descrição 1', 'Descrição 2'], destinationUrl: 'https://example.com', dailyBudgetBrl: 20,
      imageUrls: ['https://example.com/landscape.jpg', 'https://example.com/square.jpg'],
    })).rejects.toMatchObject({ statusCode: 403, code: 'GOOGLE_ADS_PERMISSION_DENIED' });
    expect(createPerformanceMaxCampaign).not.toHaveBeenCalled();
  });

  it('mantém a campanha criada quando a persistência local falha', async () => {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'developer-token-test';
    const service = new GoogleAdsService(
      () => ({ ...repo, findGoogleConnection: vi.fn().mockResolvedValue({ id: 'google-1', accessToken: 'encrypted' }) }) as any,
      {
        adsApi: {
          listAccessibleCustomers: vi.fn().mockResolvedValue(['1234567890']),
          createPerformanceMaxCampaign: vi.fn().mockResolvedValue({ campaignId: '987654321', partialFailures: [] }),
        },
        decryptToken: vi.fn().mockReturnValue('oauth-token'),
      },
      () => ({ createCampaign: vi.fn().mockRejectedValue(new Error('db unavailable')) }) as any,
    );

    await expect(service.createCampaign('tenant-1', {
      customerId: '1234567890', objective: 'leads', locationLevel: 'city', locationValue: 'São Paulo',
      headlines: ['Título 1', 'Título 2', 'Título 3'], longHeadline: 'Título longo',
      descriptions: ['Descrição 1', 'Descrição 2'], destinationUrl: 'https://example.com', dailyBudgetBrl: 20,
      imageUrls: ['https://example.com/landscape.jpg', 'https://example.com/square.jpg'],
    })).resolves.toEqual({
      campaignId: '987654321', status: 'ENABLED', partialFailures: ['A campanha foi criada, mas o histórico local será sincronizado em breve.'],
    });
  });
});
