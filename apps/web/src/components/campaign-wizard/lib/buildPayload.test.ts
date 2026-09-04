import { describe, expect, it } from 'vitest';
import { buildWizardCampaignPayload } from './buildPayload';
import type { WizardState } from '../types';

function makeState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    currentStep: 5,
    objective: 'visits',
    creatives: [
      { id: 'c1', assetId: 'a1', headline: 'Título 1', primaryText: 'Texto 1', destinationUrl: 'https://site.com' },
      { id: 'c2', uploadUrl: 'https://cdn.jpg', headline: 'Título 2', primaryText: 'Texto 2' },
    ],
    audience: {
      city: 'São Paulo',
      cityKey: 'sp',
      ageMin: 18,
      ageMax: 45,
      gender: 'all',
      audienceInterests: [{ id: 'i1', name: 'Marketing' }],
    },
    budget: { dailyBudgetBrl: 20, durationDays: 7 },
    whatsapp: {
      pageId: 'page-1',
      pageName: 'Fury',
      hasWhatsApp: true,
      hasInstagram: true,
      destinations: ['whatsapp'],
      phoneNumberId: 'pn-1',
      phoneNumberDisplay: '+55 11 99999-9999',
      instagramUserId: 'ig-user',
      instagramUsername: 'fury',
    },
    ...overrides,
  };
}

describe('buildWizardCampaignPayload', () => {
  it('mapeia todos os criativos sem o campo id', () => {
    const payload = buildWizardCampaignPayload(makeState());
    expect(payload.creatives).toHaveLength(2);
    expect(payload.creatives[0]).toEqual({
      creative_asset_id: 'a1',
      creative_upload_url: undefined,
      creative_instagram_media_id: undefined,
      creative_media_url: undefined,
      headline: 'Título 1',
      primary_text: 'Texto 1',
      destination_url: 'https://site.com',
    });
    expect(payload.creatives[1].creative_upload_url).toBe('https://cdn.jpg');
    // Frontend sempre envia creatives[] — nunca os campos legado de criativo único
    expect(payload.creative_asset_id).toBeUndefined();
    expect(payload.creative_upload_url).toBeUndefined();
    expect(payload.headline).toBeUndefined();
    expect(payload.primary_text).toBeUndefined();
  });

  it('não envia destination_url quando vazio (backend rejeita "" como URL inválida)', () => {
    const state = {
      ...makeState(),
      creatives: [
        { id: 'c1', assetId: 'a1', headline: 'Título 1', primaryText: 'Texto 1', destinationUrl: '' },
        { id: 'c2', assetId: 'a2', headline: 'Título 2', primaryText: 'Texto 2' },
      ],
    };
    const payload = buildWizardCampaignPayload(state);

    expect(payload.creatives[0].destination_url).toBeUndefined();
    expect(payload.creatives[1].destination_url).toBeUndefined();
  });

  it('mapeia dados de audiência e orçamento', () => {
    const payload = buildWizardCampaignPayload(makeState());
    expect(payload.objective).toBe('visits');
    expect(payload.location_city).toBe('São Paulo');
    expect(payload.location_city_key).toBe('sp');
    expect(payload.age_min).toBe(18);
    expect(payload.age_max).toBe(45);
    expect(payload.gender).toBe('all');
    expect(payload.audience_interests).toEqual([{ id: 'i1', name: 'Marketing' }]);
    expect(payload.daily_budget_brl).toBe(20);
    expect(payload.duration_days).toBe(7);
    expect(payload.whatsapp_page_id).toBeUndefined();
    expect(payload.destinations).toBeUndefined();
  });

  it('inclui o bloco whatsapp apenas para o objetivo whatsapp', () => {
    const whatsapp = buildWizardCampaignPayload(makeState({ objective: 'whatsapp' }));
    expect(whatsapp.whatsapp_page_id).toBe('page-1');
    expect(whatsapp.whatsapp_page_name).toBe('Fury');
    expect(whatsapp.whatsapp_phone_number_id).toBe('pn-1');
    expect(whatsapp.whatsapp_phone_number).toBe('+55 11 99999-9999');
    expect(whatsapp.destinations).toEqual(['whatsapp']);
    expect(whatsapp.instagram_user_id).toBe('ig-user');
    expect(whatsapp.instagram_username).toBe('fury');

    const conv = buildWizardCampaignPayload(makeState({ objective: 'whatsapp_conv' }));
    expect(conv.whatsapp_page_id).toBeUndefined();
    expect(conv.whatsapp_phone_number).toBeUndefined();
    expect(conv.destinations).toBeUndefined();
  });

  it('media_url é enviado apenas para criativos do Instagram', () => {
    const state = makeState();
    state.creatives[1] = {
      id: 'c2',
      instagramMediaId: 'ig-1',
      mediaUrl: 'https://ig.jpg',
      headline: 'T2',
      primaryText: 'P2',
    };
    const payload = buildWizardCampaignPayload(state);
    expect(payload.creatives[1].creative_instagram_media_id).toBe('ig-1');
    expect(payload.creatives[1].creative_media_url).toBe('https://ig.jpg');
    expect(payload.creatives[0].creative_instagram_media_id).toBeUndefined();
    expect(payload.creatives[0].creative_media_url).toBeUndefined();
  });
});