import { getRedis } from '../../lib/redis.js';
import { RBAC_ALL_KEY } from '../../lib/rbac-services.js';
import { RBAC_VIEWS } from '../../lib/rbac-views.js';
import { RbacRepository, type RbacUserContext } from '../../repository/rbac.repository.js';

const CACHE_TTL_SECONDS = 300;
const VERSION_KEY = 'rbac:version';
const SUPER_ADMIN_ROLE = 'super_admin';

export type ServiceCheckResult = 'allowed' | 'blocked' | 'unknown_user';

interface RedisLike {
  status: string;
  get(key: string): Promise<string | null>;
  setex(key: string, ttl: number, value: string): Promise<unknown>;
  incr(key: string): Promise<number>;
}

interface RbacRepoLike {
  findUserContext(userId: string): Promise<RbacUserContext | null>;
  listBlockedServiceKeys(roleKey: string, partnerId: string | null): Promise<string[]>;
  listBlockedViewKeys(roleKey: string, partnerId: string | null): Promise<string[]>;
}

export class RbacService {
  constructor(
    private repo: RbacRepoLike = new RbacRepository(),
    private redis: () => RedisLike = getRedis,
  ) {}

  // Redis fora do ar → null (evita fila infinita do ioredis)
  private readyRedis(): RedisLike | null {
    try {
      const client = this.redis();
      return client.status === 'ready' ? client : null;
    } catch {
      return null;
    }
  }

  private async cached<T>(key: string | null, load: () => Promise<T>): Promise<T> {
    if (key === null) return load();
    const redis = this.readyRedis();
    if (redis) {
      try {
        const hit = await redis.get(key);
        if (hit !== null) return JSON.parse(hit) as T;
      } catch {
        // cache é best-effort
      }
    }
    const value = await load();
    if (redis) redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(value)).catch(() => {});
    return value;
  }

  // null = versão desconhecida → sem cache, para não reaproveitar entradas velhas
  private async version(): Promise<string | null> {
    const redis = this.readyRedis();
    if (!redis) return null;
    try {
      return (await redis.get(VERSION_KEY)) ?? '0';
    } catch {
      return null;
    }
  }

  // Chamar sempre que bloqueios, papel ou parceiro de usuário mudarem
  async bumpVersion(): Promise<void> {
    const redis = this.readyRedis();
    if (redis) await redis.incr(VERSION_KEY);
  }

  private context(v: string | null, userId: string): Promise<RbacUserContext | null> {
    return this.cached(v && `rbac:v${v}:ctx:${userId}`, () => this.repo.findUserContext(userId));
  }

  // platform_role do banco (não do JWT); null = usuário inexistente
  async getPlatformRole(userId: string): Promise<string | null> {
    const ctx = await this.context(await this.version(), userId);
    return ctx?.platformRole ?? null;
  }

  async checkServices(userId: string, serviceKeys: string[]): Promise<ServiceCheckResult> {
    const v = await this.version();
    const ctx = await this.context(v, userId);
    if (!ctx) return 'unknown_user';
    if (ctx.platformRole === SUPER_ADMIN_ROLE) return 'allowed';

    const blocked = await this.cached(
      v && `rbac:v${v}:svc:${ctx.platformRole}:${ctx.partnerId ?? 'global'}`,
      () => this.repo.listBlockedServiceKeys(ctx.platformRole, ctx.partnerId),
    );
    if (blocked.includes(RBAC_ALL_KEY)) return 'blocked';
    return serviceKeys.some((k) => blocked.includes(k)) ? 'blocked' : 'allowed';
  }

  // Telas bloqueadas já expandidas ('all' e herança pai → filho); null = usuário inexistente
  async listBlockedViews(userId: string): Promise<string[] | null> {
    const v = await this.version();
    const ctx = await this.context(v, userId);
    if (!ctx) return null;
    if (ctx.platformRole === SUPER_ADMIN_ROLE) return [];

    const raw = await this.cached(
      v && `rbac:v${v}:view:${ctx.platformRole}:${ctx.partnerId ?? 'global'}`,
      () => this.repo.listBlockedViewKeys(ctx.platformRole, ctx.partnerId),
    );
    const all = raw.includes(RBAC_ALL_KEY);
    return RBAC_VIEWS.map((e) => e.key).filter(
      (key) => all || raw.some((r) => key === r || key.startsWith(r + '.')),
    );
  }
}

export const rbacService = new RbacService();
