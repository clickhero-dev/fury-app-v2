import { decryptMetaToken } from '../../utils/crypto.js';
import { metaErrorCode } from '../../lib/meta-error.js';
import { captureServerEvent } from '../../lib/analytics.js';
import {
  getInstagramMedia,
  getMetaInsights,
  getMetaUserId,
  getPageAccessToken,
  getUserPermissions,
  listAccountCampaigns,
} from '../../lib/meta-api.js';
import { MetaRepository } from '../../repository/meta.repository.js';
import { MetaHealthcheckRepository, type MetaHealthcheckRecord } from '../../repository/meta-healthcheck.repository.js';

export type HealthcheckItemStatus = 'success' | 'failed' | 'not_applicable';
export interface HealthcheckItem {
  status: HealthcheckItemStatus;
  code?: string;
  reason?: string;
}

export interface MetaHealthcheckResult extends MetaHealthcheckRecord {
  checks: {
    connection: HealthcheckItem;
    token: HealthcheckItem;
    metaBlocked: HealthcheckItem;
    instagramPublish: HealthcheckItem;
    leadFormCampaigns: HealthcheckItem;
    metrics: HealthcheckItem;
  };
  lastSync: { startedAt: string; status: string } | null;
}

interface MetaHealthcheckApi {
  getMetaUserId(accessToken: string): Promise<string>;
  getUserPermissions(accessToken: string): Promise<string[]>;
  getInstagramMedia(igUserId: string, accessToken: string): Promise<unknown[]>;
  getPageAccessToken(accessToken: string, pageId: string): Promise<{ tasks: string[] } | null>;
  listAccountCampaigns(adAccountId: string, accessToken: string): Promise<unknown[]>;
  getMetaInsights(params: { accessToken: string; adAccountId: string; startDate: string; endDate: string; level: 'account' }): Promise<{ data: unknown[] }>;
}

interface MetaHealthcheckServiceDeps {
  metaRepositoryFactory: (tenantId: string) => Pick<MetaRepository, 'findLatestMetaConnection'>;
  healthRepository: Pick<MetaHealthcheckRepository, 'findLatestSyncRun' | 'saveLatest'>;
  decryptToken: (encryptedToken: string) => string;
  metaApi: MetaHealthcheckApi;
  now: () => Date;
}

const defaultMetaApi: MetaHealthcheckApi = {
  getMetaUserId,
  getUserPermissions,
  getInstagramMedia,
  getPageAccessToken,
  listAccountCampaigns,
  getMetaInsights,
};

function notApplicable(reason: string): HealthcheckItem {
  return { status: 'not_applicable', reason };
}

function failed(err: unknown): HealthcheckItem {
  const candidate = err as { httpStatus?: number; statusCode?: number; metaCode?: number };
  const externalCode = (err as { code?: string })?.code;
  const code = candidate?.httpStatus === 504 || candidate?.statusCode === 504 || externalCode === 'TIMEOUT' || (err instanceof Error && /timeout/i.test(err.message))
    ? 'META_TIMEOUT'
    : candidate?.metaCode === 190
      ? 'META_TOKEN_EXPIRED'
      : metaErrorCode(err);
  const fallback = code === 'META_TIMEOUT'
    ? 'A Meta demorou para responder.'
    : code === 'META_TOKEN_EXPIRED'
      ? 'Token Meta inválido ou expirado. Reconecte a integração.'
      : 'A Meta recusou esta validação. Verifique as permissões e o acesso aos ativos.';
  return { status: 'failed', code, reason: fallback };
}

function restricted(err: unknown): boolean {
  const candidate = err as { metaCode?: number; metaSubcode?: number; details?: { meta_code?: number; meta_subcode?: number } };
  const text = err instanceof Error ? err.message.toLowerCase() : '';
  const code = candidate?.metaCode ?? candidate?.details?.meta_code;
  return [368, 459, 460, 464].includes(code ?? -1)
    || /checkpoint|account.{0,20}(disabled|restricted|blocked)|conta.{0,20}(bloqueada|restrita|desativada)/i.test(text);
}

function firstId(value: unknown): string | null {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null;
  return typeof value === 'string' ? value : null;
}

function statusFor(checks: MetaHealthcheckResult['checks']): MetaHealthcheckResult['status'] {
  const required = Object.values(checks);
  if (checks.connection.status === 'failed' || checks.token.status === 'failed') return 'failed';
  return required.every((check) => check.status === 'success') ? 'success' : 'partial';
}

/** Probes read-only para diagnosticar a conexão Meta e as capacidades configuradas. */
export class MetaHealthcheckService {
  private readonly deps: MetaHealthcheckServiceDeps;

  constructor(deps?: Partial<MetaHealthcheckServiceDeps>) {
    this.deps = {
      metaRepositoryFactory: (tenantId) => new MetaRepository(tenantId),
      healthRepository: new MetaHealthcheckRepository(),
      decryptToken: decryptMetaToken,
      metaApi: defaultMetaApi,
      now: () => new Date(),
      ...deps,
    } as MetaHealthcheckServiceDeps;
  }

  async runForTenant(tenantId: string): Promise<MetaHealthcheckResult> {
    const checkedAt = this.deps.now();
    const checks: MetaHealthcheckResult['checks'] = {
      connection: { status: 'success' },
      token: notApplicable('A conexão não pôde ser validada.'),
      metaBlocked: notApplicable('A conexão não pôde ser validada.'),
      instagramPublish: notApplicable('Não foi possível validar a conexão.'),
      leadFormCampaigns: notApplicable('Não foi possível validar a conexão.'),
      metrics: notApplicable('Não foi possível validar a conexão.'),
    };

    const [connection, syncRun] = await Promise.all([
      this.deps.metaRepositoryFactory(tenantId).findLatestMetaConnection(),
      this.deps.healthRepository.findLatestSyncRun(tenantId),
    ]);
    const lastSync = syncRun ? { startedAt: syncRun.startedAt.toISOString(), status: syncRun.status } : null;

    if (!connection) {
      checks.connection = { status: 'failed', code: 'META_CONNECTION_NOT_FOUND', reason: 'Nenhuma conexão Meta configurada.' };
      checks.token = notApplicable('Conecte uma conta Meta para validar o token.');
      checks.metaBlocked = notApplicable('Conecte uma conta Meta para validar bloqueios.');
      checks.instagramPublish = notApplicable('Conecte uma conta Meta para validar o Instagram.');
      checks.leadFormCampaigns = notApplicable('Conecte uma conta Meta para validar campanhas de formulário.');
      checks.metrics = notApplicable('Conecte uma conta Meta para validar métricas.');
      return this.persist({ tenantId, checkedAt, checks, lastSync });
    }

    const expired = connection.tokenExpiresAt instanceof Date && connection.tokenExpiresAt.getTime() <= checkedAt.getTime();
    let accessToken: string;
    try {
      if (expired) throw Object.assign(new Error('Token Meta expirado.'), { metaCode: 190 });
      accessToken = this.deps.decryptToken(connection.accessToken);
    } catch (err) {
      checks.token = failed(err);
      checks.metaBlocked = restricted(err)
        ? failed(err)
        : { status: 'success', reason: 'Nenhum bloqueio foi identificado antes da validação do token.' };
      checks.instagramPublish = notApplicable('Token inválido ou expirado.');
      checks.leadFormCampaigns = notApplicable('Token inválido ou expirado.');
      checks.metrics = notApplicable('Token inválido ou expirado.');
      return this.persist({ tenantId, checkedAt, checks, lastSync });
    }

    try {
      await this.deps.metaApi.getMetaUserId(accessToken);
      const permissions = await this.deps.metaApi.getUserPermissions(accessToken);
      checks.token = { status: 'success', reason: 'Token aceito pela Meta.' };
      checks.metaBlocked = { status: 'success', reason: 'A Meta não sinalizou bloqueio da conta.' };

      const adAccountId = connection.selectedAdAccountId;
      const instagramUserId = connection.selectedInstagramUserId;
      const pageId = firstId(connection.selectedPageIds);

      if (!instagramUserId) {
        checks.instagramPublish = notApplicable('Nenhuma conta do Instagram foi selecionada.');
      } else if (!permissions.includes('instagram_content_publish')) {
        checks.instagramPublish = { status: 'failed', code: 'META_PERMISSION_DENIED', reason: 'Permissão instagram_content_publish ausente.' };
      } else {
        try {
          await this.deps.metaApi.getInstagramMedia(instagramUserId, accessToken);
          checks.instagramPublish = { status: 'success', reason: 'Conta do Instagram acessível e permissão de publicação concedida.' };
        } catch (err) {
          checks.instagramPublish = failed(err);
          if (restricted(err)) checks.metaBlocked = failed(err);
        }
      }

      if (!adAccountId || !pageId) {
        checks.leadFormCampaigns = notApplicable('Selecione uma conta de anúncios e uma Página.');
      } else {
        const required = ['ads_management', 'pages_show_list', 'pages_manage_ads', 'business_management'];
        const missing = required.filter((permission) => !permissions.includes(permission));
        if (missing.length > 0) {
          checks.leadFormCampaigns = { status: 'failed', code: 'META_PERMISSION_DENIED', reason: `Permissões ausentes: ${missing.join(', ')}.` };
        } else {
          try {
            await this.deps.metaApi.listAccountCampaigns(adAccountId, accessToken);
            const pageAccess = await this.deps.metaApi.getPageAccessToken(accessToken, pageId);
            if (!pageAccess || !pageAccess.tasks.includes('ADVERTISE')) {
              checks.leadFormCampaigns = { status: 'failed', code: 'META_PAGE_ADVERTISE_TASK_REQUIRED', reason: 'A Página selecionada não concede acesso de anunciante.' };
            } else {
              checks.leadFormCampaigns = { status: 'success', reason: 'Conta de anúncios e Página acessíveis para criação de formulário.' };
            }
          } catch (err) {
            checks.leadFormCampaigns = failed(err);
            if (restricted(err)) checks.metaBlocked = failed(err);
          }
        }
      }

      if (!adAccountId) {
        checks.metrics = notApplicable('Nenhuma conta de anúncios foi selecionada.');
      } else if (!permissions.includes('ads_read')) {
        checks.metrics = { status: 'failed', code: 'META_PERMISSION_DENIED', reason: 'Permissão ads_read ausente.' };
      } else {
        try {
          const endDate = checkedAt.toISOString().slice(0, 10);
          const startDate = new Date(checkedAt.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          await this.deps.metaApi.getMetaInsights({ accessToken, adAccountId, startDate, endDate, level: 'account' });
          checks.metrics = { status: 'success', reason: 'Métricas da conta de anúncios acessíveis.' };
        } catch (err) {
          checks.metrics = failed(err);
          if (restricted(err)) checks.metaBlocked = failed(err);
        }
      }
    } catch (err) {
      checks.token = failed(err);
      checks.metaBlocked = restricted(err)
        ? failed(err)
        : { status: 'success', reason: 'Nenhum bloqueio de conta foi identificado.' };
      checks.instagramPublish = notApplicable('Não foi possível validar o token e as permissões.');
      checks.leadFormCampaigns = notApplicable('Não foi possível validar o token e as permissões.');
      checks.metrics = notApplicable('Não foi possível validar o token e as permissões.');
    }

    return this.persist({ tenantId, checkedAt, checks, lastSync });
  }

  private async persist(args: {
    tenantId: string;
    checkedAt: Date;
    checks: MetaHealthcheckResult['checks'];
    lastSync: MetaHealthcheckResult['lastSync'];
  }): Promise<MetaHealthcheckResult> {
    const result: MetaHealthcheckResult = {
      tenantId: args.tenantId,
      checkedAt: args.checkedAt,
      status: statusFor(args.checks),
      checks: args.checks,
      lastSyncAt: args.lastSync ? new Date(args.lastSync.startedAt) : null,
      lastSyncStatus: args.lastSync?.status ?? null,
      lastSync: args.lastSync,
    };
    await this.deps.healthRepository.saveLatest(result);
    if (result.status !== 'success') {
      const failedChecks = Object.entries(result.checks)
        .filter(([, check]) => check.status === 'failed')
        .map(([name, check]) => ({ name, code: check.code ?? 'META_HEALTHCHECK_FAILED' }));
      captureServerEvent('meta_healthcheck_partial_failure', { tenantId: result.tenantId, status: result.status, failedChecks });
      console.warn('[meta-healthcheck] validação Meta incompleta', { tenantId: result.tenantId, status: result.status, failedChecks });
    }
    return result;
  }
}

export const metaHealthcheckService = new MetaHealthcheckService();
