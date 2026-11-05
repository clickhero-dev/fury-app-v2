// =============================================================================
// BDD — Clientes = envios de formulário (mesma fonte na tela de Campanhas e no detalhe)
//
/*
# Language: pt-BR

Funcionalidade: Coleta de leads de uma campanha Meta (formulário primeiro)

  Cenário: campanha com formulário e envios → usa o caminho do formulário
    Dado uma campanha OUTCOME_LEADS com lead_form_id e 3 envios no formulário
    Quando collectCampaignLeads
    Então retorna os 3 leads do formulário
    E NÃO busca leads por ad

  Cenário: formulário sem envios → cai para o caminho dos ads
    Dado formulário sem envios e um ad com 2 leads
    Quando collectCampaignLeads
    Então retorna os 2 leads do ad

  Cenário: campanha sem formulário gravado (criada fora do Fury)
    Dado lead_form_id ausente e um ad com 1 lead
    Quando collectCampaignLeads
    Então retorna o lead do ad

  Cenário: mesmo lead em dois ads → dedupe por id
    Dado dois ads que retornam o MESMO lead id
    Quando collectCampaignLeads
    Então retorna 1 lead

  Cenário: falha ao buscar perguntas do formulário → degradação graciosa
    Dado getLeadFormQuestions lança erro
    Quando collectCampaignLeads
    Então retorna os leads com nome/email/telefone nulos (sem lançar)
*/
// =============================================================================

import { describe, it, expect, vi } from 'vitest';
import { collectCampaignLeads, type MetaSyncApi } from '../services/meta/meta-sync.service.js';

function lead(id: string, name: string | null = 'Maria') {
  return {
    id,
    created_time: '2026-09-30T12:00:00+0000',
    field_data: name
      ? [
          { name: 'question1', values: [name] },
          { name: 'question2', values: ['maria@x.com'] },
          { name: 'question3', values: ['11999999999'] },
        ]
      : [],
  };
}

const QUESTIONS = [
  { key: 'question1', type: 'FULL_NAME' },
  { key: 'question2', type: 'EMAIL' },
  { key: 'question3', type: 'PHONE' },
];

function makeApi(overrides: Partial<MetaSyncApi> = {}) {
  return {
    getLeadFormData: vi.fn(async () => ({ data: [] as Array<Record<string, unknown>> })),
    getLeadFormQuestions: vi.fn(async () => QUESTIONS),
    listCampaignAds: vi.fn(async () => [{ id: 'ad-1' }]),
    listAdLeads: vi.fn(async () => [] as Array<Record<string, unknown>>),
    ...overrides,
  } as unknown as MetaSyncApi & {
    getLeadFormData: ReturnType<typeof vi.fn>;
    listCampaignAds: ReturnType<typeof vi.fn>;
    listAdLeads: ReturnType<typeof vi.fn>;
  };
}

describe('BDD: collectCampaignLeads', () => {
  it('Cenário: campanha com formulário e envios → usa o formulário e não busca ads', async () => {
    const api = makeApi({
      getLeadFormData: vi.fn(async () => ({ data: [lead('l1'), lead('l2'), lead('l3')] })),
    });

    const leads = await collectCampaignLeads(api, {
      campaignId: 'camp-1',
      leadFormId: 'form-1',
      accessToken: 'tok',
    });

    expect(leads).toHaveLength(3);
    expect(leads[0]).toMatchObject({ metaLeadId: 'l1', metaCampaignId: 'camp-1', email: 'maria@x.com', phone: '11999999999' });
    expect(api.getLeadFormData).toHaveBeenCalledWith('form-1', 'tok');
    expect(api.listCampaignAds).not.toHaveBeenCalled();
    expect(api.listAdLeads).not.toHaveBeenCalled();
  });

  it('Cenário: formulário sem envios → cai para os ads', async () => {
    const api = makeApi({
      getLeadFormData: vi.fn(async () => ({ data: [] })),
      listAdLeads: vi.fn(async () => [lead('a1'), lead('a2')]),
    });

    const leads = await collectCampaignLeads(api, {
      campaignId: 'camp-1',
      leadFormId: 'form-1',
      accessToken: 'tok',
    });

    expect(leads).toHaveLength(2);
    expect(api.listCampaignAds).toHaveBeenCalledWith('camp-1', 'tok');
  });

  it('Cenário: campanha sem formulário gravado → usa os ads', async () => {
    const api = makeApi({ listAdLeads: vi.fn(async () => [lead('a1')]) });

    const leads = await collectCampaignLeads(api, { campaignId: 'camp-1', accessToken: 'tok' });

    expect(leads).toHaveLength(1);
    expect(api.getLeadFormData).not.toHaveBeenCalled();
    expect(api.listCampaignAds).toHaveBeenCalledWith('camp-1', 'tok');
  });

  it('Cenário: mesmo lead em dois ads → dedupe', async () => {
    const api = makeApi({
      listCampaignAds: vi.fn(async () => [{ id: 'ad-1' }, { id: 'ad-2' }]),
      listAdLeads: vi.fn(async () => [lead('dup-1')]),
    });

    const leads = await collectCampaignLeads(api, { campaignId: 'camp-1', accessToken: 'tok' });

    expect(leads).toHaveLength(1);
    expect(leads[0].metaLeadId).toBe('dup-1');
  });

  it('Cenário: falha nas perguntas do formulário → degradação graciosa', async () => {
    const api = makeApi({
      getLeadFormData: vi.fn(async () => ({ data: [lead('l1', null)] })),
      getLeadFormQuestions: vi.fn(async () => {
        throw new Error('[Meta API] 100: sem permissão');
      }),
    });

    const leads = await collectCampaignLeads(api, {
      campaignId: 'camp-1',
      leadFormId: 'form-1',
      accessToken: 'tok',
    });

    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ metaLeadId: 'l1', name: null, email: null, phone: null });
  });
});
