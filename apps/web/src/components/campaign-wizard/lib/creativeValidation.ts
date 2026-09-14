import type { WizardCreativeState, WizardObjective } from '../types';

export function isCreativeValid(c: WizardCreativeState, objective: WizardObjective | null): boolean {
  return Boolean(
    (c.assetId || c.uploadUrl || c.instagramMediaId) &&
    c.headline.trim().length > 0 &&
    c.primaryText.trim().length > 0 &&
    (objective !== 'visits' || /^https?:\/\//.test(c.destinationUrl?.trim() ?? ''))
  );
}

export function isCreativesStepValid(
  creatives: WizardCreativeState[],
  objective: WizardObjective | null,
): boolean {
  return creatives.length >= 1 && creatives.every((c) => isCreativeValid(c, objective));
}