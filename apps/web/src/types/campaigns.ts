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

export function mapApiStatus(status: string | CampaignApiStatus): CampaignData['status'] {
  const normalized = String(status).toUpperCase();
  if (normalized === 'ACTIVE') return 'ativo';
  if (normalized === 'PAUSED') return 'pausado';
  return 'finalizado';
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

/** Normaliza payload da API (flat ou legado com `metrics`). */
export function mapCampaignApiToRow(item: CampaignApiItem | Record<string, unknown>): CampaignData {
  const metrics =
    'metrics' in item && item.metrics && typeof item.metrics === 'object'
      ? (item.metrics as Record<string, unknown>)
      : null;

  const spend = toNumberOrNull(item.spend ?? metrics?.spend) ?? 0;

  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? 'Campanha'),
    status: mapApiStatus(String(item.status ?? 'ARCHIVED')),
    investido: spend,
    roas: toNumberOrNull(item.roas ?? metrics?.roas),
    cpa: toNumberOrNull(item.cpa ?? metrics?.cpa),
    conversoes: toNumberOrNull(item.conversions ?? metrics?.conversions),
    startDate: '',
    endDate: '',
  };
}
