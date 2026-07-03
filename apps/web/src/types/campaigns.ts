/** Status de campanha retornado pela Meta Ads API (sempre em maiúsculas). */
export type CampaignApiStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';

/** Item de campanha retornado pela API (formato flat). */
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

/** Resposta paginada da API de campanhas. */
export interface CampaignsApiResponse {
  success: boolean;
  data: CampaignApiItem[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
  };
}

/** Formato normalizado de campanha usado pelo frontend (UI-friendly). */
export interface CampaignData {
  id: string;
  name: string;
  /** Status em português para exibição na UI. */
  status: 'ativo' | 'pausado' | 'finalizado';
  investido: number;
  roas: number | null;
  cpa: number | null;
  conversoes: number | null;
  startDate: string;
  endDate: string;
}

/**
 * Converte o status da API (inglês, maiúsculas) para o formato da UI (português).
 *
 * @param status - Status retornado pela API
 * @returns Status em português para exibição
 */
export function mapApiStatus(status: string | CampaignApiStatus): CampaignData['status'] {
  const normalized = String(status).toUpperCase();
  if (normalized === 'ACTIVE') return 'ativo';
  if (normalized === 'PAUSED') return 'pausado';
  return 'finalizado';
}

/**
 * Converte um valor desconhecido para número ou null.
 * Retorna null para valores vazios, nulos ou não finitos.
 */
function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Normaliza um item da API de campanhas para o formato usado pelo frontend.
 * Suporta tanto o formato flat atual quanto o formato legado com campo `metrics`.
 *
 * @param item - Item retornado pela API (flat ou legado)
 * @returns Campanha no formato `CampaignData` normalizado
 */
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