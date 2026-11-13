import {
  metaApiCall,
  getMetaInsights,
  searchMetaCityLocations,
  uploadAdImage as metaUploadAdImage,
  uploadAdVideo as metaUploadAdVideo,
  getAdVideoStatus as metaGetAdVideoStatus,
  getPageAccessToken as metaGetPageAccessToken,
  listAccountCampaigns as metaListAccountCampaigns,
  listCampaignAds as metaListCampaignAds,
  campaignHasLeadForm as metaCampaignHasLeadForm,
  listAdLeads as metaListAdLeads,
  getLeadFormQuestions as metaGetLeadFormQuestions,
  type MetaCampaignCreateResponse,
  type MetaInsightsResponse,
  type MetaLocationResult,
  type MetaAdImageUploadResponse,
  type MetaPageAccess,
} from '../meta-api.js';
import type { IMetaCampaignProvider } from './meta-campaign.provider.js';

export class DefaultMetaCampaignProvider implements IMetaCampaignProvider {
  async getAdAccountCurrency(adAccountId: string, accessToken: string): Promise<string | null> {
    const account = await metaApiCall<{currency?: unknown}>(`/${encodeURIComponent(adAccountId)}?fields=currency`,accessToken);
    return typeof account.currency === 'string' ? account.currency : null;
  }
  private async listChatAssets(path: string, token: string): Promise<Array<{ id: string; name?: string }>> {
    const result: Array<{ id: string; name?: string }> = [];
    const seen = new Set<string>();
    let after: string | undefined;
    for (let page = 0; page < 100; page++) {
      const response: { data?: Array<{ id: string; name?: string }>; paging?: { next?: string; cursors?: { after?: string } } } = await metaApiCall(`${path}?fields=id,name&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`, token);
      result.push(...(response.data ?? []));
      if (!response.paging?.next) return result;
      const cursor = response.paging.cursors?.after;
      if (!cursor || seen.has(cursor)) throw new Error('Meta pagination failed');
      seen.add(cursor); after = cursor;
    }
    throw new Error('Meta pagination limit exceeded');
  }
  async listChatAdSets(id: string, token: string) { return this.listChatAssets(`/${encodeURIComponent(id)}/adsets`, token); }
  async listChatAdCreatives(id: string, token: string) { return this.listChatAssets(`/${encodeURIComponent(id)}/adcreatives`, token); }
  async getAdSet(adsetId: string, token: string): Promise<Record<string, unknown>> {
    return metaApiCall(`/${encodeURIComponent(adsetId)}?fields=id,campaign_id,account_id,name,status`, token);
  }
  async getAdCreative(creativeId: string, token: string): Promise<Record<string, unknown>> {
    return metaApiCall(`/${encodeURIComponent(creativeId)}?fields=id,account_id,name`, token);
  }
  async getAd(adId: string, accessToken: string): Promise<Record<string, unknown>> {
    return metaApiCall(`/${encodeURIComponent(adId)}?fields=id,name,status,campaign_id,account_id,adset_id,creative{id},updated_time`, accessToken);
  }

  async updateAd(adId: string, accessToken: string, body: Record<string, unknown>): Promise<void> {
    await metaApiCall(`/${encodeURIComponent(adId)}`, accessToken, { method: 'POST', body });
  }
  async getPageAccessToken(pageId: string, userAccessToken: string): Promise<MetaPageAccess | null> {
    return metaGetPageAccessToken(userAccessToken, pageId);
  }

  async createCampaign(
    adAccountId: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<MetaCampaignCreateResponse> {
    return metaApiCall<MetaCampaignCreateResponse>(
      `/${encodeURIComponent(adAccountId)}/campaigns`,
      accessToken,
      { method: 'POST', body }
    );
  }

  async updateCampaign(
    campaignId: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<void> {
    await metaApiCall(
      `/${encodeURIComponent(campaignId)}`,
      accessToken,
      { method: 'POST', body }
    );
  }

  async getCampaign(
    campaignId: string,
    accessToken: string,
    fields = 'account_id'
  ): Promise<Record<string, unknown>> {
    return metaApiCall<Record<string, unknown>>(
      `/${encodeURIComponent(campaignId)}?fields=${fields}`,
      accessToken
    );
  }

  async createAdSet(
    adAccountId: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<{ id: string }> {
    return metaApiCall<{ id: string }>(
      `/${encodeURIComponent(adAccountId)}/adsets`,
      accessToken,
      { method: 'POST', body }
    );
  }

  async createAdCreative(
    adAccountId: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<{ id: string }> {
    return metaApiCall<{ id: string }>(
      `/${encodeURIComponent(adAccountId)}/adcreatives`,
      accessToken,
      { method: 'POST', body }
    );
  }

  async createAd(
    adAccountId: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<{ id: string }> {
    return metaApiCall<{ id: string }>(
      `/${encodeURIComponent(adAccountId)}/ads`,
      accessToken,
      { method: 'POST', body }
    );
  }

  async createLeadForm(
    pageId: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<{ id: string }> {
    return metaApiCall<{ id: string }>(
      `/${encodeURIComponent(pageId)}/leadgen_forms`,
      accessToken,
      { method: 'POST', body }
    );
  }

  // Formulários leadgen NÃO suportam DELETE na Graph API — o "rollback" possível é arquivar.
  async archiveLeadForm(formId: string, accessToken: string): Promise<void> {
    await metaApiCall(
      `/${encodeURIComponent(formId)}`,
      accessToken,
      { method: 'POST', body: { status: 'ARCHIVED' } }
    );
  }

  async getLeadFormData(
    formId: string,
    accessToken: string
  ): Promise<{ data: Array<Record<string, unknown>> }> {
    return metaApiCall<{ data: Array<Record<string, unknown>> }>(
      `/${encodeURIComponent(formId)}/leads?fields=id,field_data,created_time`,
      accessToken
    );
  }

  async listCampaigns(
    adAccountId: string,
    accessToken: string
  ): Promise<Array<{ id: string; name: string; objective: string | null; status: string | null }>> {
    return metaListAccountCampaigns(adAccountId, accessToken);
  }

  async getCampaignAds(
    campaignId: string,
    accessToken: string
  ): Promise<Array<{ id: string; name?: string }>> {
    return metaListCampaignAds(campaignId, accessToken);
  }

  async campaignHasLeadForm(campaignId: string, accessToken: string): Promise<boolean> {
    return metaCampaignHasLeadForm(campaignId, accessToken);
  }

  async getAdLeads(
    adId: string,
    accessToken: string
  ): Promise<Array<Record<string, unknown>>> {
    return metaListAdLeads(adId, accessToken);
  }

  async getLeadFormQuestions(
    formId: string,
    accessToken: string
  ): Promise<Array<{ key: string; type: string; label?: string }>> {
    return metaGetLeadFormQuestions(formId, accessToken);
  }

  async deleteCampaign(campaignId: string, accessToken: string): Promise<void> {
    await metaApiCall(`/${encodeURIComponent(campaignId)}`, accessToken, { method: 'DELETE' });
  }

  async deleteAdSet(adSetId: string, accessToken: string): Promise<void> {
    await metaApiCall(`/${encodeURIComponent(adSetId)}`, accessToken, { method: 'DELETE' });
  }

  async deleteAdCreative(adCreativeId: string, accessToken: string): Promise<void> {
    await metaApiCall(`/${encodeURIComponent(adCreativeId)}`, accessToken, { method: 'DELETE' });
  }

  async deleteAd(adId: string, accessToken: string): Promise<void> {
    await metaApiCall(`/${encodeURIComponent(adId)}`, accessToken, { method: 'DELETE' });
  }

  async getInsights(params: {
    accessToken: string;
    entityId: string;
    startDate: string;
    endDate: string;
    timeIncrement: number;
  }): Promise<MetaInsightsResponse> {
    return getMetaInsights(params);
  }

  async searchLocations(
    query: string,
    accessToken: string
  ): Promise<MetaLocationResult[]> {
    return searchMetaCityLocations(query, accessToken);
  }

  async uploadAdImage(params: {
    adAccountId: string;
    base64: string;
    filename: string;
    accessToken: string;
  }): Promise<string | undefined> {
    return metaUploadAdImage(params) as Promise<string | undefined>;
  }

  async uploadAdVideo(params: {
    adAccountId: string;
    buffer: Buffer;
    filename: string;
    contentType: string;
    accessToken: string;
  }): Promise<string> {
    return metaUploadAdVideo(params);
  }

  async getAdVideoStatus(videoId: string, accessToken: string): Promise<{ status?: string; picture?: string }> {
    return metaGetAdVideoStatus(videoId, accessToken);
  }

  async downloadImage(
    url: string,
    signal: AbortSignal
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const response = await fetch(url, {
      signal,
      headers: { 'User-Agent': 'FURY/1.0' },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, contentType };
  }
}
