import type {
  MetaCampaignCreateResponse,
  MetaInsightsResponse,
  MetaLocationResult,
  MetaAdImageUploadResponse,
} from '../meta-api.js';

export interface IMetaCampaignProvider {
  createCampaign(
    adAccountId: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<MetaCampaignCreateResponse>;

  updateCampaign(
    campaignId: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<void>;

  getCampaign(
    campaignId: string,
    accessToken: string,
    fields?: string
  ): Promise<Record<string, unknown>>;

  createAdSet(
    adAccountId: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<{ id: string }>;

  createAdCreative(
    adAccountId: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<{ id: string }>;

  createAd(
    adAccountId: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<{ id: string }>;

  getInsights(
    params: {
      accessToken: string;
      entityId: string;
      startDate: string;
      endDate: string;
      timeIncrement: number;
    }
  ): Promise<MetaInsightsResponse>;

  searchLocations(
    query: string,
    accessToken: string
  ): Promise<MetaLocationResult[]>;

  uploadAdImage(
    params: {
      adAccountId: string;
      base64: string;
      filename: string;
      accessToken: string;
    }
  ): Promise<string | undefined>;

  downloadImage(
    url: string,
    signal: AbortSignal
  ): Promise<{ buffer: Buffer; contentType: string } | null>;
}
