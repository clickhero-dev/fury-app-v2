export type WizardObjective = 'visits' | 'engagement' | 'messages' | 'whatsapp' | 'whatsapp_conv' | 'leads';

export type WizardGender = 'all' | 'male' | 'female';

export const AGE_OPTIONS = [18, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65] as const;

export const MAX_CREATIVES = 4;

export const MAX_GEO_CITIES = 4;
export const MAX_GEO_POINTS = 4;
export const DEFAULT_POINT_RADIUS_KM = 1.5;

// Formato salvo em audienceDefaults.geo (o back converte para a Meta)
export interface AudienceGeo {
  mode: 'cities' | 'custom';
  cities: { key: string; name: string; region?: string }[];
  base?: { label: string; lat: number; lng: number };
  points: { lat: number; lng: number; radiusKm: number }[];
}

// Só o modo ativo conta (igual ao back)
export function hasGeoLocations(geo: AudienceGeo | undefined): geo is AudienceGeo {
  if (!geo) return false;
  return geo.mode === 'cities' ? geo.cities.length > 0 : geo.points.length > 0;
}

const round = (n: number, d: number) => Number(n.toFixed(d));

// Prévia do geo_locations (espelho de apps/api/src/lib/audience-geo.ts)
export function buildGeoLocations(geo: AudienceGeo): Record<string, unknown> {
  if (geo.mode === 'cities') {
    return { cities: geo.cities.map((c) => ({ key: parseInt(c.key, 10) })) };
  }
  return {
    custom_locations: geo.points.map((p) => ({
      latitude: round(p.lat, 6),
      longitude: round(p.lng, 6),
      radius: round(p.radiusKm, 3),
      distance_unit: 'kilometer',
    })),
  };
}

export interface WizardCreativeState {
  id: string; // chave estável p/ listas (crypto.randomUUID)
  assetId?: string;
  assetUrl?: string;
  uploadUrl?: string;
  headline: string;
  primaryText: string;
  destinationUrl?: string;
  instagramMediaId?: string;
  mediaUrl?: string;
}

/** Cria um criativo vazio com id estável — usado no estado inicial do wizard e no botão "Adicionar outro criativo". */
export function createEmptyCreative(preSelectedAssetId?: string): WizardCreativeState {
  return {
    id: crypto.randomUUID(),
    assetId: preSelectedAssetId,
    headline: '',
    primaryText: '',
  };
}

export interface WizardAudienceState {
  city: string;
  cityKey?: string;
  ageMin: number;
  ageMax: number;
  gender: WizardGender;
  audienceInterests: { id: string; name: string }[];
  geo?: AudienceGeo;
}

export interface WizardBudgetState {
  dailyBudgetBrl: number;
  durationDays?: number;
}

export type WizardMessagingDestination = 'whatsapp' | 'instagram_direct' | 'messenger';

export interface WizardWhatsappState {
  pageId?: string;
  pageName?: string;
  hasWhatsApp?: boolean;
  hasInstagram?: boolean;
  destinations: WizardMessagingDestination[];
  phoneNumberId?: string;
  phoneNumberDisplay?: string;
  instagramUserId?: string;
  instagramUsername?: string;
}

export interface WizardState {
  currentStep: 1 | 2 | 3 | 4 | 5;
  objective: WizardObjective | null;
  creatives: WizardCreativeState[];
  audience: WizardAudienceState;
  budget: WizardBudgetState;
  whatsapp: WizardWhatsappState;
  preSelectedAssetId?: string;
}

export interface WizardPayloadCreative {
  creative_asset_id?: string;
  creative_upload_url?: string;
  creative_instagram_media_id?: string;
  creative_media_url?: string;
  headline: string;
  primary_text: string;
  destination_url?: string;
}

export interface CreateWizardCampaignPayload {
  objective: WizardObjective;
  creatives: WizardPayloadCreative[];
  // campos únicos legados — aceitos pela API para clientes antigos, o frontend novo envia apenas creatives[]
  creative_asset_id?: string;
  creative_upload_url?: string;
  creative_instagram_media_id?: string;
  creative_media_url?: string;
  headline?: string;
  primary_text?: string;
  destination_url?: string;
  location_city: string;
  location_city_key?: string;
  geo?: AudienceGeo;
  age_min: number;
  age_max: number;
  gender: WizardGender;
  audience_interests?: { id: string; name: string }[];
  daily_budget_brl: number;
  duration_days?: number;
  whatsapp_page_id?: string;
  whatsapp_page_name?: string;
  whatsapp_phone_number_id?: string;
  whatsapp_phone_number?: string;
  destinations?: WizardMessagingDestination[];
  instagram_user_id?: string;
  instagram_username?: string;
}

export interface CreateWizardCampaignResult {
  success: true;
  campaign_id: string;
  meta_campaign_id: string;
  campaign_name: string;
}
