import type { CampaignData } from '../types/campaigns';
export type { CampaignData };

/**
 * Dados fictícios de campanhas para uso como fallback quando a API falha
 * ou quando `META_USE_MOCK=true` está configurado.
 *
 * Usado pelo hook `useCampaigns` em caso de erro na requisição.
 * Cobre os três status possíveis: ativo, pausado e finalizado.
 */
export const campanhasMock: CampaignData[] = [
  {
    id: '1',
    name: 'Promoção Verão 2026',
    status: 'ativo',
    investido: 8234,
    roas: 3.4,
    cpa: 45.5,
    conversoes: 180,
    startDate: '01/01/2026',
    endDate: '31/03/2026',
  },
  {
    id: '2',
    name: 'Campanha de Email',
    status: 'ativo',
    investido: 1800,
    roas: 2.15,
    cpa: 62.3,
    conversoes: 28,
    startDate: '15/01/2026',
    endDate: '31/05/2026',
  },
  {
    id: '3',
    name: 'Anúncios em Rede Social',
    status: 'ativo',
    investido: 6234,
    roas: 2.85,
    cpa: 38.2,
    conversoes: 163,
    startDate: '05/02/2026',
    endDate: '30/04/2026',
  },
  {
    id: '4',
    name: 'Retargeting Display',
    status: 'pausado',
    investido: 2100,
    roas: 1.98,
    cpa: 89.45,
    conversoes: 23,
    startDate: '20/01/2026',
    endDate: '30/05/2026',
  },
  {
    id: '5',
    name: 'Lançamento de Produto',
    status: 'finalizado',
    investido: 19800,
    roas: 4.25,
    cpa: 31.75,
    conversoes: 624,
    startDate: '01/12/2025',
    endDate: '31/12/2025',
  },
];