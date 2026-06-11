export const CONVERSION_ACTION_TYPES: readonly string[] = [
  'offsite_conversion.fb_pixel_lead',
  'offsite_conversion.fb_pixel_purchase',
  'offsite_conversion.fb_pixel_complete_registration',
  'onsite_conversion.lead',
  'omni_purchase',
  'omni_complete_registration',
  'contact',
  'start_trial',
  'submit_application',
] as const;

const CONVERSION_SET = new Set(CONVERSION_ACTION_TYPES);

export function isConversionEvent(actionType: string): boolean {
  return CONVERSION_SET.has(actionType);
}
