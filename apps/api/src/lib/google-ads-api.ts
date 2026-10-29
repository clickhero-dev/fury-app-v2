import { AppError } from '../middleware/errorHandler.js';
import { externalFetch, ExternalHttpError } from './http-client.js';

const DEFAULT_GOOGLE_ADS_API_VERSION = 'v26';
const GOOGLE_ADS_BASE_URL = 'https://googleads.googleapis.com';

interface AccessibleCustomersResponse {
  resourceNames?: string[];
}

interface GoogleAdsErrorResponse {
  error?: {
    status?: string;
    message?: string;
  };
}

export interface PerformanceMaxMutationInput {
  customerId: string;
  campaignName: string;
  dailyBudgetBrl: number;
  headlines: string[];
  longHeadline: string;
  descriptions: string[];
  imageUrls: string[];
  businessName: string;
  finalUrl: string;
}

interface MutateResponse {
  mutateOperationResponses?: Array<{ campaignResult?: { resourceName?: string } }>;
  partialFailureError?: { message?: string };
}

function requiredConfig(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new AppError(
      503,
      'GOOGLE_ADS_NOT_CONFIGURED',
      'A integração Google Ads ainda não está configurada neste ambiente.',
    );
  }
  return value;
}

function apiUrl(path: string): string {
  const version = process.env.GOOGLE_ADS_API_VERSION ?? DEFAULT_GOOGLE_ADS_API_VERSION;
  return `${GOOGLE_ADS_BASE_URL}/${version}${path}`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function validatePerformanceMaxInput(input: PerformanceMaxMutationInput): void {
  const valid = /^\d{6,20}$/.test(input.customerId)
    && input.campaignName.trim().length > 0
    && Number.isFinite(input.dailyBudgetBrl)
    && input.dailyBudgetBrl > 0
    && input.headlines.length >= 3
    && input.descriptions.length >= 2
    && input.imageUrls.length >= 2
    && input.imageUrls.slice(0, 2).every(isHttpUrl)
    && isHttpUrl(input.finalUrl);

  if (!valid) {
    throw new AppError(400, 'GOOGLE_ADS_INVALID_CAMPAIGN', 'Os dados da campanha Google Ads são inválidos.');
  }
}

export class GoogleAdsApiClient {
  async listAccessibleCustomers(accessToken: string): Promise<string[]> {
    const developerToken = requiredConfig('GOOGLE_ADS_DEVELOPER_TOKEN');

    let response: Response;
    let payload: AccessibleCustomersResponse & GoogleAdsErrorResponse;
    try {
      response = await externalFetch(apiUrl('/customers:listAccessibleCustomers'), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          Accept: 'application/json',
        },
      });
      payload = (await response.json().catch(() => ({}))) as AccessibleCustomersResponse & GoogleAdsErrorResponse;
    } catch (error) {
      if (error instanceof ExternalHttpError) {
        throw new AppError(
          503,
          'GOOGLE_ADS_PROVIDER_UNAVAILABLE',
          'O Google Ads está temporariamente indisponível. Tente novamente.',
        );
      }
      throw error;
    }

    if (!response.ok) {
      const statusCode = response.status === 401 || response.status === 403 ? 403 : 502;
      throw new AppError(
        statusCode,
        statusCode === 403 ? 'GOOGLE_ADS_PERMISSION_DENIED' : 'GOOGLE_ADS_PROVIDER_ERROR',
        statusCode === 403
          ? 'A conta Google não tem permissão para acessar o Google Ads.'
          : 'Não foi possível consultar as contas Google Ads agora.',
        { providerStatus: payload.error?.status },
      );
    }

    return (payload.resourceNames ?? [])
      .filter((resourceName): resourceName is string => resourceName.startsWith('customers/'))
      .map((resourceName) => resourceName.slice('customers/'.length));
  }

  async createPerformanceMaxCampaign(accessToken: string, input: PerformanceMaxMutationInput): Promise<{ campaignId: string; partialFailures: string[] }> {
    validatePerformanceMaxInput(input);
    const images = await Promise.all(input.imageUrls.slice(0, 2).map((url) => this.downloadImage(url)));
    const resource = (type: string, id: number) => `customers/${input.customerId}/${type}/-${id}`;
    const budget = resource('campaignBudgets', 1);
    const campaign = resource('campaigns', 2);
    const assetGroup = resource('assetGroups', 3);
    const operations: unknown[] = [{ campaignBudgetOperation: { create: { resourceName: budget, name: `${input.campaignName} Budget`, amountMicros: String(Math.round(input.dailyBudgetBrl * 1_000_000)), deliveryMethod: 'STANDARD', explicitlyShared: false } } }];
    const textAsset = (id: number, text: string) => {
      const asset = resource('assets', id);
      operations.push({ assetOperation: { create: { resourceName: asset, name: `${input.campaignName} Asset ${id}`, type: 'TEXT', textAsset: { text } } } });
      return asset;
    };
    const imageAsset = (id: number, data: Uint8Array) => {
      const asset = resource('assets', id);
      operations.push({ assetOperation: { create: { resourceName: asset, name: `${input.campaignName} Image ${id}`, type: 'IMAGE', imageAsset: { data: Buffer.from(data).toString('base64') } } } });
      return asset;
    };
    const headlines = input.headlines.map((text, index) => textAsset(10 + index, text));
    const longHeadline = textAsset(20, input.longHeadline);
    const descriptions = input.descriptions.map((text, index) => textAsset(30 + index, text));
    const landscape = imageAsset(40, images[0]);
    const square = imageAsset(41, images[1]);
    const businessName = textAsset(50, input.businessName);
    operations.push({ campaignOperation: { create: { resourceName: campaign, name: input.campaignName, status: 'ENABLED', advertisingChannelType: 'PERFORMANCE_MAX', campaignBudget: budget, maximizeConversions: {}, finalUrlExpansionOptOut: false, brandGuidelinesEnabled: false } } });
    operations.push({ assetGroupOperation: { create: { resourceName: assetGroup, campaign, name: `${input.campaignName} Asset Group`, finalUrls: [input.finalUrl], status: 'ENABLED' } } });
    const link = (asset: string, fieldType: string) => operations.push({ assetGroupAssetOperation: { create: { assetGroup, asset, fieldType } } });
    headlines.forEach((asset) => link(asset, 'HEADLINE'));
    link(longHeadline, 'LONG_HEADLINE');
    descriptions.forEach((asset) => link(asset, 'DESCRIPTION'));
    link(landscape, 'MARKETING_IMAGE');
    link(square, 'SQUARE_MARKETING_IMAGE');
    link(businessName, 'BUSINESS_NAME');

    let response: Response;
    let payload: MutateResponse & GoogleAdsErrorResponse;
    try {
      response = await externalFetch(`${GOOGLE_ADS_BASE_URL}/${process.env.GOOGLE_ADS_API_VERSION ?? DEFAULT_GOOGLE_ADS_API_VERSION}/customers/${input.customerId}:mutate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': requiredConfig('GOOGLE_ADS_DEVELOPER_TOKEN'), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ mutateOperations: operations, partialFailure: false, validateOnly: false }),
      });
      payload = (await response.json().catch(() => ({}))) as MutateResponse & GoogleAdsErrorResponse;
    } catch (error) {
      if (error instanceof ExternalHttpError) throw new AppError(503, 'GOOGLE_ADS_PROVIDER_UNAVAILABLE', 'O Google Ads está temporariamente indisponível. Tente novamente.');
      throw error;
    }
    if (!response.ok || payload.partialFailureError) throw new AppError(response.status === 401 || response.status === 403 ? 403 : 502, response.status === 401 || response.status === 403 ? 'GOOGLE_ADS_PERMISSION_DENIED' : 'GOOGLE_ADS_PROVIDER_ERROR', 'Não foi possível criar a campanha Google Ads agora.', { providerStatus: payload.error?.status });
    const campaignResult = payload.mutateOperationResponses?.find((item) => item.campaignResult?.resourceName)?.campaignResult?.resourceName;
    if (!campaignResult) throw new AppError(502, 'GOOGLE_ADS_PROVIDER_ERROR', 'O Google Ads não retornou a campanha criada.');
    return { campaignId: campaignResult.split('/').pop() as string, partialFailures: [] };
  }

  private async downloadImage(url: string): Promise<Uint8Array> {
    let response: Response;
    try { response = await externalFetch(url, { method: 'GET' }); }
    catch (error) { if (error instanceof ExternalHttpError) throw new AppError(422, 'GOOGLE_ADS_IMAGE_UNAVAILABLE', 'Não foi possível carregar uma das imagens da campanha.'); throw error; }
    if (!response.ok) throw new AppError(422, 'GOOGLE_ADS_IMAGE_UNAVAILABLE', 'Não foi possível carregar uma das imagens da campanha.');
    return new Uint8Array(await response.arrayBuffer());
  }
}
