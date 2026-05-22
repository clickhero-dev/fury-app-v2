export type CampaignApiStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

export interface CampaignApiItem {
  id: string;
  name: string;
  status: CampaignApiStatus;
  spend: number;
  roas: number | null;
  cpa: number | null;
  conversions: number | null;
  impressions: number;
  clicks: number;
}

export interface CampaignsApiResponse {
  success: boolean;
  data: CampaignApiItem[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface CampaignData {
  id: string;
  name: string;
  status: 'ativo' | 'pausado' | 'finalizado';
  investido: number;
  roas: number | null;
  cpa: number | null;
  conversoes: number | null;
  startDate: string;
  endDate: string;
}

export function mapApiStatus(status: CampaignApiStatus): CampaignData['status'] {
  if (status === 'ACTIVE') return 'ativo';
  if (status === 'PAUSED') return 'pausado';
  return 'finalizado';
}

export function mapCampaignApiToRow(item: CampaignApiItem): CampaignData {
  return {
    id: item.id,
    name: item.name,
    status: mapApiStatus(item.status),
    investido: item.spend,
    roas: item.roas,
    cpa: item.cpa,
    conversoes: item.conversions,
    startDate: '',
    endDate: '',
  };
}
