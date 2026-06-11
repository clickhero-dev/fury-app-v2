export type WizardObjective = 'visits' | 'engagement' | 'messages';

export type WizardGender = 'all' | 'male' | 'female';

export const RADIUS_OPTIONS = [5, 10, 15, 20, 30, 50] as const;
export type RadiusOption = (typeof RADIUS_OPTIONS)[number];

export const AGE_OPTIONS = [18, 21, 25, 30, 35, 40, 45, 50, 55, 60, 65] as const;

export interface WizardCreativeState {
  assetId?: string;
  assetUrl?: string;
  uploadUrl?: string;
  headline: string;
  primaryText: string;
  destinationUrl?: string;
  instagramMediaId?: string;
  mediaUrl?: string;
}

export interface WizardAudienceState {
  city: string;
  cityKey?: string;
  radiusKm: RadiusOption;
  ageMin: number;
  ageMax: number;
  gender: WizardGender;
}

export interface WizardBudgetState {
  dailyBudgetBrl: number;
  durationDays?: number;
}

export interface WizardState {
  currentStep: 1 | 2 | 3 | 4 | 5;
  objective: WizardObjective | null;
  creative: WizardCreativeState;
  audience: WizardAudienceState;
  budget: WizardBudgetState;
  preSelectedAssetId?: string;
}

export interface CreateWizardCampaignPayload {
  objective: WizardObjective;
  creative_asset_id?: string;
  creative_upload_url?: string;
  creative_instagram_media_id?: string;
  creative_media_url?: string;
  headline: string;
  primary_text: string;
  destination_url?: string;
  location_city: string;
  location_city_key?: string;
  location_radius_km: number;
  age_min: number;
  age_max: number;
  gender: WizardGender;
  daily_budget_brl: number;
  duration_days?: number;
}

export interface CreateWizardCampaignResult {
  success: true;
  campaign_id: string;
  meta_campaign_id: string;
  campaign_name: string;
}
