import { SubscriptionRepository } from '../../repository/subscription.repository.js';
import { MetaRepository } from '../../repository/meta.repository.js';
import { StudioVideoService } from '../studio/studio-video.service.js';
import { decryptMetaToken } from '../../utils/crypto.js';
import { getPageAccessToken, getUserPermissions, metaApiCall } from '../../lib/meta-api.js';
import { ChatReadCapabilities } from './chat-read-capabilities.js';
import { isTrialExpired } from '../billing/trial-signup.js';

/** Adaptadores reais; nenhum deles é chamado durante a montagem do serviço.
 * A role deve vir da identidade autenticada e a instância deve ser por requisição. */
export function createChatReadCapabilities(role?: string) {
  const video = new StudioVideoService();
  return new ChatReadCapabilities({
    subscription: async (tenant, includeImages) => {
      const repo = new SubscriptionRepository(tenant);
      const sub = await repo.findSubscription();
      if (!sub || !['active', 'trial'].includes(sub.status)) return null;
      if ((sub.status === 'trial' && isTrialExpired(new Date(), sub.trialEndsAt)) ||
          (role !== 'demo' && sub.status === 'active' && sub.currentPeriodEnd && new Date() > sub.currentPeriodEnd)) return {status: 'expired' as const};
      return includeImages ? repo.getCreativeQuotaSnapshot() : {creativesLimit: null, creativesRemaining: null};
    },
    videos: tenant => video.getOptions(tenant),
    connection: async tenant => (await new MetaRepository(tenant).findLatestMetaConnection()) ?? null,
    decrypt: decryptMetaToken,
    permissions: getUserPermissions,
    account: async (id, token) => {
      const result = await metaApiCall<{account_status?: unknown}>(`/${encodeURIComponent(id)}?fields=account_status`, token);
      if (typeof result.account_status !== 'number') throw new Error('invalid account status');
      return result.account_status === 1;
    },
    page: getPageAccessToken,
    instagram: async (id, token) => {
      const result = await metaApiCall<{id?: unknown}>(`/${encodeURIComponent(id)}?fields=id`, token);
      if (result.id !== id) throw new Error('invalid instagram account');
    },
    link: async (page, instagram, token) => {
      const result = await metaApiCall<{id?: unknown; instagram_business_account?: {id?: unknown}}>(`/${encodeURIComponent(page)}?fields=id,instagram_business_account`, token);
      if (result.id !== page) throw new Error('invalid page');
      return result.instagram_business_account?.id === instagram;
    },
  });
}
