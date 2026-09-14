import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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