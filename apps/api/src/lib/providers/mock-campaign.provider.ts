import type { IMetaCampaignProvider } from './meta-campaign.provider.js';
import type { MetaPageAccess } from '../meta-api.js';

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
  failCreateStep?: 'campaign' | 'adset' | 'creative' | 'ad' | 'lead_form';

  /** Resultado de getPageAccessToken por pageId (default: admin com ADVERTISE). */
  pageAccessByPageId: Map<string, MetaPageAccess | null> = new Map();
  pageAccessRequests: Array<{ pageId: string; userAccessToken: string }> = [];

  async getPageAccessToken(pageId: string, userAccessToken: string): Promise<MetaPageAccess | null> {
    this.pageAccessRequests.push({ pageId, userAccessToken });
    if (this.pageAccessByPageId.has(pageId)) {
      return this.pageAccessByPageId.get(pageId) ?? null;
    }
    // Default: página administrada com task ADVERTISE (Page token distinto do user token).
    return { pageId, name: `Página ${pageId}`, accessToken: `page_token_${pageId}`, tasks: ['ADVERTISE', 'MANAGE'] };
  }

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

  createdLeadForms: Array<{ page_id: string; access_token: string; body: any }> = [];
  archivedLeadForms: string[] = [];
  archivedLeadFormsWithToken: Array<{ formId: string; accessToken: string }> = [];
  leadFormResult: { id: string } = { id: 'meta_form_1' };
  leadsResult: { data: Array<Record<string, unknown>> } = { data: [] };

  async createLeadForm(pageId: string, accessToken: string, body: any) {
    if (this.failCreateStep === 'lead_form') throw new Error('LeadForm fail');
    this.createdLeadForms.push({ page_id: pageId, access_token: accessToken, body });
    return this.leadFormResult;
  }

  async archiveLeadForm(formId: string, accessToken: string): Promise<void> {
    this.archivedLeadForms.push(formId);
    this.archivedLeadFormsWithToken.push({ formId, accessToken });
  }

  async getLeadFormData(formId: string, accessToken: string) {
    return this.leadsResult;
  }

  // ── Fonte da verdade Meta: listagem de campanhas e leads por ad/form ──────
  listCampaignsResult: Array<{ id: string; name: string; objective: string | null; status: string | null }> = [];
  campaignAdsByCampaign: Map<string, string[]> = new Map();
  adLeadsByAd: Map<string, Array<Record<string, unknown>>> = new Map();
  formQuestionsByForm: Map<string, Array<{ key: string; type: string }>> = new Map();
  listCampaignsRequests: Array<{ adAccountId: string; accessToken: string }> = [];

  async listCampaigns(adAccountId: string, accessToken: string) {
    this.listCampaignsRequests.push({ adAccountId, accessToken });
    return this.listCampaignsResult;
  }

  async getCampaignAds(campaignId: string, accessToken: string) {
    return (this.campaignAdsByCampaign.get(campaignId) ?? []).map((id) => ({ id }));
  }

  // ── Presença de formulário (via ads) ──────────────────────────────────────
  campaignHasFormByCampaign: Map<string, boolean> = new Map();
  campaignHasFormRequests: Array<{ campaignId: string; accessToken: string }> = [];

  async campaignHasLeadForm(campaignId: string, accessToken: string): Promise<boolean> {
    this.campaignHasFormRequests.push({ campaignId, accessToken });
    return this.campaignHasFormByCampaign.get(campaignId) ?? false;
  }

  async getAdLeads(adId: string, accessToken: string) {
    return (this.adLeadsByAd.get(adId) ?? []);
  }

  async getLeadFormQuestions(formId: string, accessToken: string) {
    return this.formQuestionsByForm.get(formId) ?? [];
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
