import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WizardCreativeState, WizardObjective, WizardState } from '../types';
import { createEmptyCreative, MAX_CREATIVES } from '../types';
import { isCreativesStepValid } from '../lib/creativeValidation';
import api from '@/lib/api';

const TOTAL_STEPS = 5;

function createInitialState(preSelectedAssetId?: string): WizardState {
  return {
    currentStep: 1,
    objective: null,
    creatives: [createEmptyCreative(preSelectedAssetId)],
    audience: {
      city: '',
      ageMin: 18,
      ageMax: 65,
      gender: 'all',
      audienceInterests: [],
    },
    budget: {
      dailyBudgetBrl: 20,
      durationDays: undefined,
    },
    whatsapp: { destinations: [] },
    preSelectedAssetId,
  };
}

export function useCampaignWizard(preSelectedAssetId?: string) {
  const [state, setState] = useState<WizardState>(() => createInitialState(preSelectedAssetId));
  const [audienceLoaded, setAudienceLoaded] = useState(false);

  // Load audience defaults from user configuration
  useEffect(() => {
    api.get<{ success: boolean; data: { audienceDefaults?: { city?: string; cityKey?: string; ageMin?: number; ageMax?: number; gender?: 'all' | 'male' | 'female' } } }>('/auth/me')
      .then((res) => {
        const defaults = res.data.data?.audienceDefaults;
        if (defaults) {
          setState((prev) => ({
            ...prev,
            audience: {
              ...prev.audience,
              city: defaults.city || '',
              cityKey: defaults.cityKey,
              ageMin: defaults.ageMin || 18,
              ageMax: defaults.ageMax || 65,
              gender: defaults.gender || 'all',
            },
          }));
        }
        setAudienceLoaded(true);
      })
      .catch(() => {
        // silently ignore - audience stays with default values
        setAudienceLoaded(true);
      });
  }, []);

  // Check if audience data is configured (city is the main requirement)
  const hasAudienceData = useMemo(() => {
    return (
      state.audience.city.trim().length > 0 &&
      audienceLoaded
    );
  }, [state.audience, audienceLoaded]);

  const setObjective = useCallback((objective: WizardObjective) => {
    setState((prev) => ({ ...prev, objective }));
  }, []);

  const setCreatives = useCallback((creatives: WizardCreativeState[]) => {
    setState((prev) => ({ ...prev, creatives }));
  }, []);

  const addCreative = useCallback(() => {
    setState((prev) =>
      prev.creatives.length >= MAX_CREATIVES
        ? prev
        : { ...prev, creatives: [...prev.creatives, createEmptyCreative()] }
    );
  }, []);

  const updateCreative = useCallback((id: string, updates: Partial<WizardCreativeState>) => {
    setState((prev) => ({
      ...prev,
      creatives: prev.creatives.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
  }, []);

  const removeCreative = useCallback((id: string) => {
    setState((prev) => ({ ...prev, creatives: prev.creatives.filter((c) => c.id !== id) }));
  }, []);

  const setAudience = useCallback((updates: Partial<WizardState['audience']>) => {
    setState((prev) => ({ ...prev, audience: { ...prev.audience, ...updates } }));
  }, []);

  const setBudget = useCallback((updates: Partial<WizardState['budget']>) => {
    setState((prev) => ({ ...prev, budget: { ...prev.budget, ...updates } }));
  }, []);

  const setWhatsapp = useCallback((updates: Partial<WizardState['whatsapp']>) => {
    setState((prev) => ({ ...prev, whatsapp: { ...prev.whatsapp, ...updates } }));
  }, []);

  const goToStep = useCallback((step: WizardState['currentStep']) => {
    setState((prev) => ({ ...prev, currentStep: step }));
  }, []);

  const goNext = useCallback(() => {
    setState((prev) => {
      let nextStep = prev.currentStep + 1;
      
      // Skip step 3 (Audience) if audience data is already configured
      if (prev.currentStep === 2 && hasAudienceData) {
        nextStep = 4;
      }
      
      return {
        ...prev,
        currentStep: (Math.min(nextStep, TOTAL_STEPS) as WizardState['currentStep']),
      };
    });
  }, [hasAudienceData]);

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
      1: Boolean(
        state.objective !== null &&
          (state.objective !== 'whatsapp' ||
            (state.whatsapp.pageId &&
              state.whatsapp.destinations.length > 0 &&
              (!state.whatsapp.destinations.includes('whatsapp') || state.whatsapp.phoneNumberId)))
      ),
      2: isCreativesStepValid(state.creatives, state.objective),
      3: Boolean(
        state.audience.city.trim().length > 0 &&
        state.audience.ageMin >= 18 &&
        state.audience.ageMax <= 65 &&
        state.audience.ageMin <= state.audience.ageMax
      ),
      4: state.budget.dailyBudgetBrl >= 7,
      5: true,
    } as Record<WizardState['currentStep'], boolean>;
  }, [state]);

  const canGoNext = isStepValid[state.currentStep];

  return {
    state,
    setObjective,
    setCreatives,
    addCreative,
    updateCreative,
    removeCreative,
    setAudience,
    setBudget,
    setWhatsapp,
    goToStep,
    goNext,
    goBack,
    reset,
    isStepValid,
    canGoNext,
    totalSteps: TOTAL_STEPS,
    hasAudienceData,
    audienceLoaded,
  };
}

export type UseCampaignWizardReturn = ReturnType<typeof useCampaignWizard>;
