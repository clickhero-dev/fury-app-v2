type Quota = { creativesRemaining: number | null; creativesLimit: number | null };
type Connection = { accessToken: string; tokenExpiresAt: Date | null; selectedAdAccountId?: string | null; selectedPageIds?: unknown; selectedInstagramUserId?: string | null };
type Deps = {
  subscription: (tenant: string, includeImages: boolean) => Promise<Quota | {status: 'expired'} | null>;
  videos: (tenant: string) => Promise<{videosLimit: number | null; videosRemaining: number | null}>;
  connection: (tenant: string) => Promise<Connection | null>;
  decrypt: (token: string) => string;
  permissions: (token: string) => Promise<string[]>;
  account: (id: string, token: string) => Promise<boolean>;
  page: (token: string, id: string) => Promise<{tasks: string[]} | null>;
  instagram: (id: string, token: string) => Promise<unknown>;
  link: (page: string, instagram: string, token: string) => Promise<boolean>;
};
type Check = 'confirmed' | 'missing' | 'unknown' | 'error' | 'inactive' | 'not_returned' | 'missing_advertise';
const ASSESSED_SCOPES = ['ads_management', 'ads_read', 'pages_show_list', 'pages_manage_ads'] as const;

/** Apenas leituras. Não classifica disponibilidade contratual nem garante publicação. */
export class ChatReadCapabilities {
  constructor(private readonly deps: Deps) {}

  async quota(tenant: string, allowed = {images: true, videos: true}) {
    const images = await this.deps.subscription(tenant, allowed.images);
    if (!images) return {subscription: 'missing', images: null, videos: null};
    if ('status' in images) return {subscription: images.status, images: null, videos: null};
    const video = allowed.videos ? await this.deps.videos(tenant) : null;
    return {subscription: 'active', images: allowed.images ? {limit: images.creativesLimit, remaining: images.creativesRemaining} : null, videos: video ? {limit: video.videosLimit, remaining: video.videosRemaining} : null};
  }

  async meta(tenant: string) {
    const checks: Record<string, Check> = {connection:'missing', adsAndPagesPermissions:'unknown', account:'unknown', page:'unknown', instagram:'unknown', pageInstagramLink:'unknown'};
    const permissionScopes = [...ASSESSED_SCOPES];
    const connection = await this.deps.connection(tenant);
    if (!connection) return {status:'missing', checks, permissionScopes};
    checks.connection = 'confirmed';
    if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() <= Date.now()) return {status:'expired', checks, permissionScopes};
    let token: string;
    try { token = this.deps.decrypt(connection.accessToken); } catch { return {status:'error', checks, permissionScopes}; }
    const account = connection.selectedAdAccountId;
    const instagram = connection.selectedInstagramUserId;
    const selectedPages = Array.isArray(connection.selectedPageIds)
      ? [...new Set(connection.selectedPageIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
      : [];
    if (!account) checks.account = 'missing';
    if (!selectedPages.length) checks.page = 'missing';
    if (!instagram) checks.instagram = 'missing';
    let expired = false;
    const markError = (key: string, err: unknown) => {
      checks[key] = 'error';
      if ((err as {code?: string} | null)?.code === 'META_TOKEN_EXPIRED') expired = true;
    };
    const probes: Promise<void>[] = [this.deps.permissions(token).then(p => { checks.adsAndPagesPermissions = ASSESSED_SCOPES.every(x => p.includes(x)) ? 'confirmed' : 'missing'; }).catch(err => markError('adsAndPagesPermissions', err))];
    if (account) probes.push(this.deps.account(account, token).then(active => {checks.account=active ? 'confirmed' : 'inactive';}).catch(err => markError('account', err)));
    if (instagram) probes.push(this.deps.instagram(instagram, token).then(() => {checks.instagram='confirmed';}).catch(err => markError('instagram', err)));
    probes.push((async () => {
      let page: string | undefined;
      if (instagram && selectedPages.length) {
        let failed = false;
        for (const candidate of selectedPages) {
          try {
            if (await this.deps.link(candidate, instagram, token)) {
              page = candidate;
              checks.pageInstagramLink = 'confirmed';
              break;
            }
          } catch (err) {
            failed = true;
            markError('pageInstagramLink', err);
          }
        }
        if (!page && !failed) checks.pageInstagramLink = 'missing';
      } else if (!instagram && selectedPages.length === 1) {
        page = selectedPages[0];
      }
      if (page) {
        try {
          const result = await this.deps.page(token, page);
          checks.page = !result ? 'not_returned' : result.tasks.includes('ADVERTISE') ? 'confirmed' : 'missing_advertise';
        } catch (err) { markError('page', err); }
      }
    })());
    await Promise.all(probes);
    return {status: expired ? 'expired' : 'partial', checks, permissionScopes};
  }
}
