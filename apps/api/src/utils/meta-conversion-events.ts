export const CONVERSION_ACTION_TYPES: readonly string[] = [
  'purchase',
  'lead',
  'complete_registration',
  'offsite_conversion',
  'offsite_conversion.fb_pixel_purchase',
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_complete_registration',
  'onsite_conversion',
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
  'onsite_conversion.post_save',
  'omni_purchase',
  'omni_complete_registration',
  'omni_initiated_checkout',
  'contact',
  'subscribe',
  'find_location',
  'schedule',
  'start_trial',
  'submit_application',
  'donate',
  'app_install',
  'app_use',
  'link_click',
] as const;

const CONVERSION_SET = new Set(CONVERSION_ACTION_TYPES);

export function isConversionEvent(actionType: string): boolean {
  return CONVERSION_SET.has(actionType);
}
