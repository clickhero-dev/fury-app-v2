import type { IMetaCampaignProvider } from './meta-campaign.provider.js';

export class MockMetaCampaignProvider implements IMetaCampaignProvider {
  createdCampaigns: any[] = [];
  createdAdSets: any[] = [];
  createdAdCreatives: any[] = [];
  createdAds: any[] = [];
  updatedCampaigns: Map<string, any> = new Map();
  getCampaignResult: Record<string, unknown> = {};
  insightsResult: any = { data: [] };
  locationsResult: any[] = [];
  uploadAdImageResult: string | undefined = 'mock_hash';
  downloadImageResult: { buffer: Buffer; contentType: string } | null = null;

  async createCampaign(adAccountId: string, accessToken: string, body: any) {
    const id = `meta_campaign_${this.createdCampaigns.length + 1}`;
    this.createdCampaigns.push(body);
    return { id };
  }

  async updateCampaign(campaignId: string, accessToken: string, body: any) {
    this.updatedCampaigns.set(campaignId, body);
  }

  async getCampaign(campaignId: string, accessToken: string, fields?: string) {
    return this.getCampaignResult;
  }

  async createAdSet(adAccountId: string, accessToken: string, body: any) {
    const id = `meta_adset_${this.createdAdSets.length + 1}`;
    this.createdAdSets.push(body);
    return { id };
  }

  async createAdCreative(adAccountId: string, accessToken: string, body: any) {
    const id = `meta_creative_${this.createdAdCreatives.length + 1}`;
    this.createdAdCreatives.push(body);
    return { id };
  }

  async createAd(adAccountId: string, accessToken: string, body: any) {
    const id = `meta_ad_${this.createdAds.length + 1}`;
    this.createdAds.push(body);
    return { id };
  }

  async getInsights(params: any) { return this.insightsResult; }

  async searchLocations(query: string, accessToken: string) { return this.locationsResult; }

  async uploadAdImage(params: any) { return this.uploadAdImageResult; }

  async downloadImage(url: string, signal: AbortSignal) { return this.downloadImageResult; }
}
