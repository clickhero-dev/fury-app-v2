import { vi } from 'vitest';

export const mockMetaApi = {
  createCampaign: vi.fn().mockResolvedValue({ id: 'mock_camp_123' }),
  pauseCampaign: vi.fn().mockResolvedValue({ success: true }),
  resumeCampaign: vi.fn().mockResolvedValue({ success: true }),
  updateCampaignBudget: vi.fn().mockResolvedValue({ success: true }),
};

vi.mock('../../lib/meta-api', () => ({
  metaApiCall: mockMetaApi.createCampaign,
  decryptAccessToken: vi.fn((token) => token),
  encryptAccessToken: vi.fn((token) => token),
}));
