import type { CreateWizardCampaignPayload, WizardState } from '../types';

export function buildWizardCampaignPayload(state: WizardState): CreateWizardCampaignPayload {
  const audience = state.audience;
  return {
    objective: state.objective as NonNullable<WizardState['objective']>,
    creatives: state.creatives.map((c) => ({
      creative_asset_id: c.assetId,
      creative_upload_url: c.uploadUrl,
      creative_instagram_media_id: c.instagramMediaId,
      creative_media_url: c.instagramMediaId ? c.mediaUrl : undefined,
      headline: c.headline,
      primary_text: c.primaryText,
      // undefined → JSON omite; o backend REJEITA "" como URL inválida.
      destination_url: c.destinationUrl || undefined,
    })),
    location_city: audience.city || '',
    location_city_key: audience.cityKey,
    age_min: audience.ageMin || 18,
    age_max: audience.ageMax || 65,
    gender: audience.gender || 'all',
    audience_interests: audience.audienceInterests,
    daily_budget_brl: state.budget.dailyBudgetBrl,
    duration_days: state.budget.durationDays,
    ...(state.objective === 'whatsapp'
      ? {
          whatsapp_page_id: state.whatsapp.pageId,
          whatsapp_page_name: state.whatsapp.pageName,
          whatsapp_phone_number_id: state.whatsapp.phoneNumberId,
          whatsapp_phone_number: state.whatsapp.phoneNumberDisplay,
          destinations: state.whatsapp.destinations,
          instagram_user_id: state.whatsapp.instagramUserId,
          instagram_username: state.whatsapp.instagramUsername,
        }
      : {}),
  };
}