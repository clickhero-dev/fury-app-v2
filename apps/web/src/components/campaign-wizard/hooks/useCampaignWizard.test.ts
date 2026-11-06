import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCampaignWizard } from './useCampaignWizard';

const mockApiGet = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  default: { get: mockApiGet },
}));

beforeEach(() => {
  mockApiGet.mockReset();
  mockApiGet.mockResolvedValue({ data: { data: {} } });
});

describe('useCampaignWizard — estado inicial dos criativos', () => {
  it('sem asset pré-selecionado, a lista de criativos começa VAZIA', async () => {
    const { result } = renderHook(() => useCampaignWizard());

    await waitFor(() => expect(result.current.state.creatives).toHaveLength(0));
  });

  it('com asset pré-selecionado, começa com 1 criativo contendo o asset', async () => {
    const { result } = renderHook(() => useCampaignWizard('a1'));

    await waitFor(() => expect(result.current.state.creatives).toHaveLength(1));
    expect(result.current.state.creatives[0].assetId).toBe('a1');
  });
});

describe('useCampaignWizard — destinos de mensagens', () => {
  it('Cenário: Gerar Conversas exige destino, mas mantém Instagram e Facebook selecionados juntos', async () => {
    const { result } = renderHook(() => useCampaignWizard());
    await waitFor(() => expect(result.current.audienceLoaded).toBe(true));

    act(() => {
      result.current.setObjective('whatsapp');
      result.current.setWhatsapp({ pageId: 'page-1', destinations: [] });
    });
    expect(result.current.isStepValid[1]).toBe(false);

    act(() => {
      result.current.setWhatsapp({ destinations: ['instagram_direct', 'messenger'] });
    });
    expect(result.current.state.whatsapp.destinations).toEqual(['instagram_direct', 'messenger']);
    expect(result.current.isStepValid[1]).toBe(true);
  });
});
