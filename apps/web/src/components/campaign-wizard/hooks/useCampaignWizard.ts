import { useCallback, useMemo, useState } from 'react';
import type { WizardObjective, WizardState } from '../types';

const TOTAL_STEPS = 5;

function createInitialState(preSelectedAssetId?: string): WizardState {
  return {
    currentStep: 1,
    objective: null,
    creative: {
      assetId: preSelectedAssetId,
      headline: '',
      primaryText: '',
    },
    audience: {
      city: '',
      radiusKm: 10,
      ageMin: 18,
      ageMax: 65,
      gender: 'all',
    },
    budget: {
      dailyBudgetBrl: 20,
      durationDays: undefined,
    },
    preSelectedAssetId,
  };
}

export function useCampaignWizard(preSelectedAssetId?: string) {
  const [state, setState] = useState<WizardState>(() => createInitialState(preSelectedAssetId));

  const setObjective = useCallback((objective: WizardObjective) => {
    setState((prev) => ({ ...prev, objective }));
  }, []);

  const setCreative = useCallback((updates: Partial<WizardState['creative']>) => {
    setState((prev) => ({ ...prev, creative: { ...prev.creative, ...updates } }));
  }, []);

  const setAudience = useCallback((updates: Partial<WizardState['audience']>) => {
    setState((prev) => ({ ...prev, audience: { ...prev.audience, ...updates } }));
  }, []);

  const setBudget = useCallback((updates: Partial<WizardState['budget']>) => {
    setState((prev) => ({ ...prev, budget: { ...prev.budget, ...updates } }));
  }, []);

  const goToStep = useCallback((step: WizardState['currentStep']) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  }, []);

  const goNext = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: (Math.min(prev.currentStep + 1, TOTAL_STEPS) as WizardState['currentStep']),
    }));
  }, []);

  const goBack = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: (Math.max(prev.currentStep - 1, 1) as WizardState['currentStep']),
    }));
  }, []);

  const reset = useCallback(() => {
    setState(createInitialState(preSelectedAssetId));
  }, [preSelectedAssetId]);

  const isStepValid = useMemo(() => {
    return {
      1: state.objective !== null,
      2: Boolean(
        (state.creative.assetId || state.creative.uploadUrl) &&
          state.creative.headline.trim().length > 0 &&
          state.creative.primaryText.trim().length > 0
      ),
      3: Boolean(state.audience.city.trim().length > 0),
      4: state.budget.dailyBudgetBrl >= 5,
      5: true,
    } as Record<WizardState['currentStep'], boolean>;
  }, [state]);

  const canGoNext = isStepValid[state.currentStep];

  return {
    state,
    setObjective,
    setCreative,
    setAudience,
    setBudget,
    goToStep,
    goNext,
    goBack,
    reset,
    isStepValid,
    canGoNext,
    totalSteps: TOTAL_STEPS,
  };
}

export type UseCampaignWizardReturn = ReturnType<typeof useCampaignWizard>;
