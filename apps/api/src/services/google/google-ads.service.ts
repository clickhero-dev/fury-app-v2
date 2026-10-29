import { AppError } from '../../middleware/errorHandler.js';
import { GoogleRepository } from '../../repository/google.repository.js';
import { GoogleAdsApiClient } from '../../lib/google-ads-api.js';
import { CampaignRepository } from '../../repository/campaign.repository.js';
import { decryptToken } from '../../utils/crypto.js';
import { captureServerEvent } from '../../lib/analytics.js';

export type GoogleAdsObjective = 'leads' | 'website' | 'calls';
export type GoogleAdsLocationLevel = 'city' | 'state' | 'country';

export interface CreateGoogleAdsCampaignInput {
  customerId: string;
  objective: GoogleAdsObjective;
  locationLevel: GoogleAdsLocationLevel;
  locationValue: string;
  headlines: string[];
  longHeadline: string;
  descriptions: string[];
  destinationUrl: string;
  dailyBudgetBrl: number;
  imageUrls: string[];
}

export interface GoogleAdsCampaignResult {
  campaignId: string;
  status: 'ENABLED';
  partialFailures: string[];
}

interface GoogleAdsServiceDeps {
  adsApi: Pick<GoogleAdsApiClient, 'listAccessibleCustomers' | 'createPerformanceMaxCampaign'>;
  decryptToken: (value: string) => string;
}

export class GoogleAdsService {
  constructor(
    private readonly repoFactory: (tenantId: string) => Pick<GoogleRepository, 'findGoogleConnection' | 'patchGoogleConnection' | 'findBusinessProfile'> =
      (tenantId) => new GoogleRepository(tenantId),
    private readonly deps: GoogleAdsServiceDeps = {
      adsApi: new GoogleAdsApiClient(),
      decryptToken,
    },
    private readonly campaignRepoFactory: (tenantId: string) => Pick<CampaignRepository, 'createCampaign'> =
      (tenantId) => new CampaignRepository(tenantId),
  ) {}

  async listAccessibleCustomers(tenantId: string): Promise<string[]> {
    const connection = await this.repoFactory(tenantId).findGoogleConnection();
    if (!connection) {
      throw new AppError(404, 'GOOGLE_CONNECTION_NOT_FOUND', 'Conecte sua conta Google para listar contas Ads.');
    }

    return this.deps.adsApi.listAccessibleCustomers(this.deps.decryptToken(connection.accessToken));
  }

  async selectCustomer(tenantId: string, customerId: string): Promise<{ accountId: string }> {
    const repo = this.repoFactory(tenantId);
    const connection = await repo.findGoogleConnection();
    if (!connection) {
      throw new AppError(404, 'GOOGLE_CONNECTION_NOT_FOUND', 'Conecte sua conta Google para selecionar uma conta Ads.');
    }

    const accessibleCustomers = await this.listAccessibleCustomers(tenantId);
    if (!accessibleCustomers.includes(customerId)) {
      throw new AppError(403, 'GOOGLE_ADS_PERMISSION_DENIED', 'A conta Google não está disponível para este usuário.');
    }

    await repo.patchGoogleConnection(connection.id, { accountId: customerId });
    return { accountId: customerId };
  }

  async createCampaign(
    tenantId: string,
    input: CreateGoogleAdsCampaignInput,
  ): Promise<GoogleAdsCampaignResult> {
    const connection = await this.repoFactory(tenantId).findGoogleConnection();
    if (!connection) {
      throw new AppError(404, 'GOOGLE_CONNECTION_NOT_FOUND', 'Conecte sua conta Google para criar anúncios.');
    }

    if (process.env.GOOGLE_ADS_MOCK === 'true') {
      return {
        campaignId: `mock-google-${Date.now()}`,
        status: 'ENABLED',
        partialFailures: [],
      };
    }

    if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      throw new AppError(
        503,
        'GOOGLE_ADS_NOT_CONFIGURED',
        'A integração Google Ads ainda não está configurada neste ambiente.',
      );
    }

    const businessProfile = await this.repoFactory(tenantId).findBusinessProfile();
    if (!businessProfile) {
      throw new AppError(400, 'GOOGLE_BUSINESS_PROFILE_REQUIRED', 'Configure seu Perfil da Empresa antes de publicar anúncios.');
    }
    const configuredLocation = (businessProfile.address as Record<string, string> | null)?.[input.locationLevel];
    if (!configuredLocation || configuredLocation !== input.locationValue) {
      throw new AppError(400, 'GOOGLE_LOCATION_NOT_CONFIGURED', 'Escolha uma localização já configurada no Perfil da Empresa.');
    }

    const accessibleCustomers = await this.deps.adsApi.listAccessibleCustomers(
      this.deps.decryptToken(connection.accessToken),
    );
    if (!accessibleCustomers.includes(input.customerId)) {
      throw new AppError(403, 'GOOGLE_ADS_PERMISSION_DENIED', 'A conta Google não está disponível para este usuário.');
    }

    const result = await this.deps.adsApi.createPerformanceMaxCampaign(this.deps.decryptToken(connection.accessToken), {
      ...input,
      campaignName: input.headlines[0],
      businessName: input.headlines[0],
      finalUrl: input.destinationUrl,
    });
    try {
      await this.campaignRepoFactory(tenantId).createCampaign({
        metaCampaignId: `google-${result.campaignId}`,
        name: input.headlines[0],
        status: 'active',
        budget: {
          provider: 'google',
          customer_id: input.customerId,
          daily_budget_brl: input.dailyBudgetBrl,
          objective: input.objective,
          location_level: input.locationLevel,
          location_value: input.locationValue,
          headlines: input.headlines,
          long_headline: input.longHeadline,
          descriptions: input.descriptions,
          image_urls: input.imageUrls,
          destination_url: input.destinationUrl,
        },
      });
    } catch {
      const message = 'A campanha foi criada, mas o histórico local será sincronizado em breve.';
      captureServerEvent('google_ads_campaign_persistence_failed', {
        tenantId,
        provider: 'google_ads',
        campaignId: result.campaignId,
      });
      return { campaignId: result.campaignId, status: 'ENABLED', partialFailures: [...result.partialFailures, message] };
    }
    return { campaignId: result.campaignId, status: 'ENABLED', partialFailures: result.partialFailures };
  }
}
