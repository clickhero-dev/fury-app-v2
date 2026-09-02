export type WizardObjective = 'visits' | 'engagement' | 'messages' | 'whatsapp' | 'whatsapp_conv';

export type WizardGender = 'all' | 'male' | 'female';

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
  ageMin: number;
  ageMax: number;
  gender: WizardGender;
  audienceInterests: { id: string; name: string }[];
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
  creative: WizardCreativeState;
  audience: WizardAudienceState;
  budget: WizardBudgetState;
  whatsapp: WizardWhatsappState;
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
