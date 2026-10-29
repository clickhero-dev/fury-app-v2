/*
# Language: pt-BR

Funcionalidade: expor criação Google Ads pela API

  Cenário: aceitar uma campanha válida
    Dado um tenant autenticado
    Quando o formulário Google é enviado
    Então a API retorna o identificador da campanha

  Cenário: rejeitar usuário sem autenticação
    Dado que não existe tenant autenticado
    Quando o formulário Google é enviado
    Então a API retorna erro 401

  Cenário: listar contas Google Ads acessíveis
    Dado um tenant autenticado
    Quando o usuário abre a seleção de conta Google Ads
    Então a API retorna os customer IDs disponíveis

  Cenário: rejeitar campanha sem o conjunto mínimo de assets
    Dado um tenant autenticado
    Quando o formulário envia menos de três títulos ou duas imagens
    Então a API rejeita a publicação antes de chamar o serviço

  Cenário: salvar a conta Google Ads selecionada
    Dado um tenant autenticado e uma conta acessível
    Quando o usuário confirma a conta
    Então a API salva a conta na conexão do tenant
*/
import { describe, expect, it, vi } from 'vitest';
import { GoogleAdsController } from '../controllers/google-ads.controller.js';

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
}

describe('GoogleAdsController', () => {
  it('retorna a campanha criada', async () => {
    const service = { createCampaign: vi.fn().mockResolvedValue({ campaignId: 'g-1', status: 'ENABLED' }) } as any;
    const controller = new GoogleAdsController(service);
    const res = response();

    await controller.createCampaign({ tenant: { tenantId: 'tenant-1' }, body: {
      customerId: '1234567890', objective: 'leads', locationLevel: 'city', locationValue: 'São Paulo',
      headlines: ['Título 1', 'Título 2', 'Título 3'], longHeadline: 'Título longo do anúncio',
      descriptions: ['Descrição 1', 'Descrição 2'], destinationUrl: 'https://example.com',
      dailyBudgetBrl: 20, imageUrls: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
    } } as any, res, vi.fn());

    expect(service.createCampaign).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ objective: 'leads' }));
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('encaminha erro 401 sem tenant', async () => {
    const service = { createCampaign: vi.fn() } as any;
    const controller = new GoogleAdsController(service);
    const res = response();
    const next = vi.fn();

    await controller.createCampaign({ tenant: undefined, body: {} } as any, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }));
    expect(service.createCampaign).not.toHaveBeenCalled();
  });

  it('retorna as contas acessíveis', async () => {
    const service = {
      createCampaign: vi.fn(),
      listAccessibleCustomers: vi.fn().mockResolvedValue(['1234567890']),
    } as any;
    const controller = new GoogleAdsController(service);
    const res = response();

    await controller.listAccessibleCustomers({ tenant: { tenantId: 'tenant-1' } } as any, res, vi.fn());

    expect(service.listAccessibleCustomers).toHaveBeenCalledWith('tenant-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: ['1234567890'] }));
  });

  it('rejeita assets insuficientes antes do serviço', async () => {
    const service = { createCampaign: vi.fn(), listAccessibleCustomers: vi.fn() } as any;
    const controller = new GoogleAdsController(service);
    const next = vi.fn();

    await controller.createCampaign({
      tenant: { tenantId: 'tenant-1' },
      body: {
        customerId: '1234567890', objective: 'leads', locationLevel: 'city', locationValue: 'São Paulo',
        headlines: ['Título único'], longHeadline: 'Título longo', descriptions: ['Descrição'],
        destinationUrl: 'https://example.com', dailyBudgetBrl: 20, imageUrls: ['https://example.com/1.jpg'],
      },
    } as any, response(), next);

    expect(next).toHaveBeenCalled();
    expect(service.createCampaign).not.toHaveBeenCalled();
  });

  it('salva a conta selecionada', async () => {
    const service = {
      createCampaign: vi.fn(),
      listAccessibleCustomers: vi.fn(),
      selectCustomer: vi.fn().mockResolvedValue({ accountId: '1234567890' }),
    } as any;
    const controller = new GoogleAdsController(service);
    const res = response();

    await controller.selectCustomer({ tenant: { tenantId: 'tenant-1' }, body: { customerId: '1234567890' } } as any, res, vi.fn());

    expect(service.selectCustomer).toHaveBeenCalledWith('tenant-1', '1234567890');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
