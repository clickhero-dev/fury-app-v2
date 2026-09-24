import type {
  MetaCampaignCreateResponse,
  MetaInsightsResponse,
  MetaLocationResult,
  MetaAdImageUploadResponse,
} from '../meta-api.js';
import type { MetaPageAccess } from '../meta-api.js';

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

  createLeadForm(
    pageId: string,
    accessToken: string,
    body: Record<string, unknown>
  ): Promise<{ id: string }>;

  /**
   * Page access token + tasks de uma Página do usuário (via /me/accounts).
   * Cobre páginas de admin direto e as acessadas via Business Manager.
   * Retorna null quando o usuário não tem papel na Página.
   */
  getPageAccessToken(pageId: string, userAccessToken: string): Promise<MetaPageAccess | null>;

  archiveLeadForm(formId: string, accessToken: string): Promise<void>;

  getLeadFormData(
    formId: string,
    accessToken: string
  ): Promise<{ data: Array<Record<string, unknown>> }>;

  /**
   * Lista TODAS as campanhas de uma conta de anúncios (paginação completa).
   * Fonte da verdade do filtro de leads — inclui campanhas criadas fora do Fury.
   */
  listCampaigns(
    adAccountId: string,
    accessToken: string
  ): Promise<Array<{ id: string; name: string; objective: string | null; status: string | null }>>;

  /** Lista os ads de uma campanha (id + name), com paginação completa. */
  getCampaignAds(
    campaignId: string,
    accessToken: string
  ): Promise<Array<{ id: string; name?: string }>>;

  /** Lista os leads de um AD (paginação completa), com field_data/created_time/form_id. */
  getAdLeads(
    adId: string,
    accessToken: string
  ): Promise<Array<Record<string, unknown>>>;

  /** Perguntas de um leadgen form — mapeia key tokenizado → type. */
  getLeadFormQuestions(
    formId: string,
    accessToken: string
  ): Promise<Array<{ key: string; type: string; label?: string }>>;

  deleteCampaign(campaignId: string, accessToken: string): Promise<void>;

  deleteAdSet(adSetId: string, accessToken: string): Promise<void>;

  deleteAdCreative(adCreativeId: string, accessToken: string): Promise<void>;

  deleteAd(adId: string, accessToken: string): Promise<void>;

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
