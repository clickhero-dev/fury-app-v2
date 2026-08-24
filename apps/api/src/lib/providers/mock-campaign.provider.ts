import type { IMetaCampaignProvider } from './meta-campaign.provider.js';

export class MockMetaCampaignProvider implements IMetaCampaignProvider {
  createdCampaigns: any[] = [];
  createdAdSets: any[] = [];
  createdAdCreatives: any[] = [];
  createdAds: any[] = [];
  deletedCampaigns: string[] = [];
  deletedAdSets: string[] = [];
  deletedAdCreatives: string[] = [];
  deletedAds: string[] = [];
  updatedCampaigns: Map<string, any> = new Map();
  getCampaignResult: Record<string, unknown> = {};
  insightsResult: any = { data: [] };
  locationsResult: any[] = [];
  uploadAdImageResult: string | undefined = 'mock_hash';
  downloadImageResult: { buffer: Buffer; contentType: string } | null = null;
  failCreateStep?: 'campaign' | 'adset' | 'creative' | 'ad';

  async createCampaign(adAccountId: string, accessToken: string, body: any) {
    if (this.failCreateStep === 'campaign') throw new Error('Campaign fail');
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
    if (this.failCreateStep === 'adset') throw new Error('AdSet fail');
    const id = `meta_adset_${this.createdAdSets.length + 1}`;
    this.createdAdSets.push(body);
    return { id };
  }

  async createAdCreative(adAccountId: string, accessToken: string, body: any) {
    if (this.failCreateStep === 'creative') throw new Error('Creative fail');
    const id = `meta_creative_${this.createdAdCreatives.length + 1}`;
    this.createdAdCreatives.push(body);
    return { id };
  }

  async createAd(adAccountId: string, accessToken: string, body: any) {
    if (this.failCreateStep === 'ad') throw new Error('Ad fail');
    const id = `meta_ad_${this.createdAds.length + 1}`;
    this.createdAds.push(body);
    return { id };
  }

  async deleteCampaign(campaignId: string, accessToken: string): Promise<void> {
    this.deletedCampaigns.push(campaignId);
  }

  async deleteAdSet(adSetId: string, accessToken: string): Promise<void> {
    this.deletedAdSets.push(adSetId);
  }

  async deleteAdCreative(adCreativeId: string, accessToken: string): Promise<void> {
    this.deletedAdCreatives.push(adCreativeId);
  }

  async deleteAd(adId: string, accessToken: string): Promise<void> {
    this.deletedAds.push(adId);
  }

  async getInsights(params: any) { return this.insightsResult; }

  async searchLocations(query: string, accessToken: string) { return this.locationsResult; }

  async uploadAdImage(params: any) { return this.uploadAdImageResult; }

  async downloadImage(url: string, signal: AbortSignal) { return this.downloadImageResult; }
}
