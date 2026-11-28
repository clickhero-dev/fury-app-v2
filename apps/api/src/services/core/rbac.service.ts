import { getRedis } from '../../lib/redis.js';
import { RBAC_ALL_KEY } from '../../lib/rbac-services.js';
import { DISABLED_SERVICE_KEYS, expandBlocked, expandPlanViews, planServicesOf } from '../../lib/rbac-views.js';
import { RbacRepository, type RbacUserContext } from '../../repository/rbac.repository.js';

const CACHE_TTL_SECONDS = 300;
const VERSION_KEY = 'rbac:version';
const SUPER_ADMIN_ROLE = 'super_admin';
const PARTNER_ADMIN_ROLE = 'admin_partner';
const PARTNER_CLIENT_ROLE = 'user_partner';

export type ServiceCheckResult = 'allowed' | 'blocked' | 'unknown_user';

interface RedisLike {
  status: string;
  get(key: string): Promise<string | null>;
  setex(key: string, ttl: number, value: string): Promise<unknown>;
  incr(key: string): Promise<number>;
}

interface RbacRepoLike {
  findUserContext(userId: string): Promise<RbacUserContext | null>;
  listBlockedServiceKeys(roleKey: string, partnerId: string | null, withDefault?: boolean): Promise<string[]>;
  listBlockedViewKeys(roleKey: string, partnerId: string | null, withDefault?: boolean): Promise<string[]>;
  listPlanBlockedViewKeys?(tenantId: string): Promise<string[]>;
  findTenantPartnerScope?(tenantId: string): Promise<{ partnerWorld: boolean; partnerId: string | null } | null>;
}

// parceiro e clientes dele: só o que o parceiro tem liberado (plano + ajustes), sem o padrão
function inPartnerWorld(ctx: RbacUserContext): boolean {
  return ctx.platformRole === PARTNER_ADMIN_ROLE || ctx.platformRole === PARTNER_CLIENT_ROLE || !!ctx.partnerAccount;
}

// parceiro do usuário; sem parceiro identificado = bloqueia tudo (na dúvida, não libera)
function partnerOf(ctx: RbacUserContext): string | null {
  return inPartnerWorld(ctx) ? ctx.partnerId : null;
}

// isentos do plano: equipe ady, super_admin e conta do parceiro
function exemptFromPlan(ctx: RbacUserContext): boolean {
  return ctx.role === 'admin' || ctx.platformRole === SUPER_ADMIN_ROLE || ctx.platformRole === PARTNER_ADMIN_ROLE || !!ctx.partnerAccount;
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

  // telas tiradas pelo plano do cliente, já com herança
  private async planViews(v: string | null, tenantId: string): Promise<string[]> {
    const load = this.repo.listPlanBlockedViewKeys;
    if (!load) return [];
    const raw = await this.cached(v && `rbac:v${v}:plan:${tenantId}`, () => load.call(this.repo, tenantId));
    return raw.length ? expandPlanViews(raw) : [];
  }

  private userPlanViews(v: string | null, ctx: RbacUserContext): Promise<string[]> {
    if (!ctx.tenantId || exemptFromPlan(ctx)) return Promise.resolve([]);
    return this.planViews(v, ctx.tenantId);
  }

  // telas que o parceiro não tem (plano + ajustes), valem para ele e os clientes
  private partnerViews(v: string | null, partnerId: string): Promise<string[]> {
    return this.cached(v && `rbac:v${v}:view:partner:${partnerId}`, () => this.repo.listBlockedViewKeys(PARTNER_CLIENT_ROLE, partnerId, false));
  }

  // workers: o plano do cliente ou o parceiro dele tira esta funcionalidade?
  async tenantBlocks(tenantId: string, viewKey: string): Promise<boolean> {
    const v = await this.version();
    if ((await this.planViews(v, tenantId)).includes(viewKey)) return true;
    const find = this.repo.findTenantPartnerScope;
    if (!find) return false;
    const scope = await this.cached(v && `rbac:v${v}:tenant-scope:${tenantId}`, () => find.call(this.repo, tenantId));
    if (!scope?.partnerWorld) return false;
    // cliente de parceiro sem parceiro identificado: não roda nada
    if (!scope.partnerId) return true;
    const raw = await this.partnerViews(v, scope.partnerId);
    // mesma herança das telas: sem Campanhas também sem Leads
    return [...expandBlocked(raw, RBAC_ALL_KEY), ...expandPlanViews(raw)].includes(viewKey);
  }

  // usuário dentro da conta própria do parceiro (segue o plano do parceiro)
  async inPartnerAccount(userId: string): Promise<boolean> {
    return !!(await this.context(await this.version(), userId))?.partnerAccount;
  }

  // platform_role do banco (não do JWT); null = usuário inexistente
  async getPlatformRole(userId: string): Promise<string | null> {
    const ctx = await this.context(await this.version(), userId);
    return ctx?.platformRole ?? null;
  }

  // super_admin → todos os clientes; admin_partner → só os do parceiro; null = sem acesso ao admin
  async getAdminScope(userId: string): Promise<{ partnerId: string | null } | null> {
    const ctx = await this.context(await this.version(), userId);
    if (ctx?.platformRole === SUPER_ADMIN_ROLE) return { partnerId: null };
    if (ctx?.platformRole === PARTNER_ADMIN_ROLE && ctx.partnerId) return { partnerId: ctx.partnerId };
    return null;
  }

  async checkServices(userId: string, serviceKeys: string[]): Promise<ServiceCheckResult> {
    const v = await this.version();
    const ctx = await this.context(v, userId);
    if (!ctx) return 'unknown_user';
    // desativado vale para todos, inclusive super_admin
    if (serviceKeys.some((k) => DISABLED_SERVICE_KEYS.includes(k))) return 'blocked';
    if (ctx.platformRole === SUPER_ADMIN_ROLE || serviceKeys.length === 0) return 'allowed';

    if (inPartnerWorld(ctx) && !ctx.partnerId) return 'blocked';
    const partnerId = partnerOf(ctx);
    const blocked = partnerId
      ? await this.cached(v && `rbac:v${v}:svc:partner:${partnerId}`, () => this.repo.listBlockedServiceKeys(PARTNER_CLIENT_ROLE, partnerId, false))
      : await this.cached(
          v && `rbac:v${v}:svc:${ctx.platformRole}:${ctx.partnerId ?? 'global'}`,
          () => this.repo.listBlockedServiceKeys(ctx.platformRole, ctx.partnerId),
        );
    if (blocked.includes(RBAC_ALL_KEY)) return 'blocked';
    if (serviceKeys.some((k) => blocked.includes(k))) return 'blocked';
    const planServices = planServicesOf(await this.userPlanViews(v, ctx));
    return serviceKeys.some((k) => planServices.includes(k)) ? 'blocked' : 'allowed';
  }

  // Telas bloqueadas já expandidas ('all' e herança pai → filho); null = usuário inexistente
  async listBlockedViews(userId: string): Promise<string[] | null> {
    const v = await this.version();
    const ctx = await this.context(v, userId);
    if (!ctx) return null;
    if (ctx.platformRole === SUPER_ADMIN_ROLE) return [];

    if (inPartnerWorld(ctx) && !ctx.partnerId) return expandBlocked([RBAC_ALL_KEY], RBAC_ALL_KEY);
    const partnerId = partnerOf(ctx);
    const raw = partnerId
      ? await this.partnerViews(v, partnerId)
      : await this.cached(
          v && `rbac:v${v}:view:${ctx.platformRole}:${ctx.partnerId ?? 'global'}`,
          () => this.repo.listBlockedViewKeys(ctx.platformRole, ctx.partnerId),
        );
    const plan = await this.userPlanViews(v, ctx);
    return expandBlocked([...raw, ...plan], RBAC_ALL_KEY);
  }
}

export const rbacService = new RbacService();
