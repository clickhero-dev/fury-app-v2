import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express, { Router, type Request, type Response, type NextFunction } from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRbacMiddleware, resolveServiceKeys } from '../middleware/rbac.middleware.js';
import { RBAC_SERVICES, RBAC_EXEMPT_PREFIXES } from '../lib/rbac-services.js';
import { RbacService } from '../services/core/rbac.service.js';
import { generateAccessToken } from '../lib/jwt.js';
import { AppError } from '../middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_SRC = fs.readFileSync(path.join(__dirname, '../routes/index.ts'), 'utf8');
const V2_SRC = fs.readFileSync(path.join(__dirname, '../routes/v2.routes.ts'), 'utf8');

const ALL_KEYS = [...new Set(RBAC_SERVICES.map((e) => e.key))];

// referência independente: keys de um caminho já canônico
function keysOfCanonical(canonical: string): string[] {
  return [
    ...new Set(
      RBAC_SERVICES.filter((e) => canonical === e.prefix || canonical.startsWith(e.prefix + '/')).map((e) => e.key),
    ),
  ];
}

// Montagens reais do index.ts, na mesma ordem
function parseMounts(): { method: 'use' | 'get'; prefix: string }[] {
  const re = /router\.(use|get)\(\s*["']([^"']+)["']/g;
  const out: { method: 'use' | 'get'; prefix: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(INDEX_SRC))) out.push({ method: m[1] as 'use' | 'get', prefix: m[2]! });
  return out;
}

function tokenFor(userId: string, role = 'owner') {
  return generateAccessToken({ userId, tenantId: 't-' + userId, email: `${userId}@x.test`, role });
}

// ───────────────────────── resolveServiceKeys ─────────────────────────

describe('resolveServiceKeys', () => {
  it('prefixo exato e subcaminho', () => {
    expect(resolveServiceKeys('/campaigns')).toEqual(['campaigns']);
    expect(resolveServiceKeys('/campaigns/123/edit')).toEqual(['campaigns']);
  });

  it('é hierárquico: /studio/video traz studio e studio.video', () => {
    expect(resolveServiceKeys('/studio/video/gerar').sort()).toEqual(['studio', 'studio.video']);
    expect(resolveServiceKeys('/studio/ai/x').sort()).toEqual(['studio', 'studio.ai']);
    expect(resolveServiceKeys('/studio/assets')).toEqual(['studio']);
  });

  it.each([
    '/STUDIO/VIDEO/x',
    '/Studio/Video',
    '//studio/video',
    '/studio//video',
    '/studio/video/',
    '/studio/video//',
    '/studio\\video',
    '/studio/%76ideo',
    '/studio/%56IDEO',
    '/%73tudio/video',
    '/studio%2Fvideo',
    '/studio%2fvideo/x',
  ])('variação %s resolve para studio.video', (p) => {
    expect(resolveServiceKeys(p)).toContain('studio.video');
  });

  it('. e .. são literais, como no Express', () => {
    expect(resolveServiceKeys('/studio/video/..')).toContain('studio.video');
    expect(resolveServiceKeys('/studio/video/.')).toContain('studio.video');
    expect(resolveServiceKeys('/studio/video/%2e%2e')).toContain('studio.video');
  });

  it('respeita limite de segmento', () => {
    expect(resolveServiceKeys('/studiox')).toEqual([]);
    expect(resolveServiceKeys('/metricsfoo/x')).toEqual([]);
    expect(resolveServiceKeys('/campaign')).toEqual([]);
    expect(resolveServiceKeys('/studio-video')).toEqual([]);
  });

  it('v2 mapeia para o módulo de origem', () => {
    expect(resolveServiceKeys('/v2/campaigns/1/leads')).toEqual(['campaigns']);
    expect(resolveServiceKeys('/v2/leads')).toEqual(['campaigns']);
    expect(resolveServiceKeys('/v2/lead-campaigns')).toEqual(['campaigns']);
    expect(resolveServiceKeys('/v2/metrics/summary')).toEqual(['metrics']);
    expect(resolveServiceKeys('/v2/dashboard/instagram-insights')).toEqual(['dashboard']);
  });

  it.each(RBAC_EXEMPT_PREFIXES)('isento %s não resolve key', (p) => {
    expect(resolveServiceKeys(p)).toEqual([]);
    expect(resolveServiceKeys(p + '/qualquer/coisa')).toEqual([]);
  });

  it('URI malformada → null', () => {
    expect(resolveServiceKeys('/studio/%E0%A4%A')).toBeNull();
    expect(resolveServiceKeys('/studio/%')).toBeNull();
  });
});

// ───────────────────────── catálogo × index.ts ─────────────────────────

describe('catálogo cobre todos os módulos do index.ts', () => {
  it('todo prefixo montado tem key ou está na lista de isentos', () => {
    const missing = parseMounts()
      .map((m) => m.prefix)
      .filter((p) => p !== '/v2')
      .filter((p) => keysOfCanonical(p).length === 0 && !RBAC_EXEMPT_PREFIXES.includes(p));
    expect(missing).toEqual([]);
  });

  it('toda rota do v2 tem key', () => {
    const re = /router\.(?:get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
    const missing: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(V2_SRC))) {
      const canonical = ('/v2' + m[1]!).replace(/\/:[^/]+/g, '/x');
      if (keysOfCanonical(canonical).length === 0) missing.push(m[1]!);
    }
    expect(missing).toEqual([]);
  });

  it('nenhum prefixo é ao mesmo tempo isento e bloqueável', () => {
    const both = RBAC_EXEMPT_PREFIXES.filter((p) => keysOfCanonical(p).length > 0);
    expect(both).toEqual([]);
  });

  it('prefixos do catálogo são canônicos (minúsculos, sem barra final)', () => {
    for (const e of RBAC_SERVICES) {
      expect(e.prefix).toBe(e.prefix.toLowerCase());
      expect(e.prefix.startsWith('/')).toBe(true);
      expect(e.prefix.endsWith('/')).toBe(false);
      expect(e.prefix).not.toContain('//');
    }
  });
});

// ───────────────────────── RbacService ─────────────────────────

function fakeRedis(ready = true) {
  const store = new Map<string, string>();
  return {
    store,
    status: ready ? 'ready' : 'reconnecting',
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    setex: vi.fn(async (k: string, _t: number, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    incr: vi.fn(async (k: string) => {
      const n = Number(store.get(k) ?? '0') + 1;
      store.set(k, String(n));
      return n;
    }),
  };
}

function fakeRepo(ctx: { platformRole: string; partnerId: string | null } | null, blocked: string[] = []) {
  return {
    findUserContext: vi.fn(async () => ctx),
    listBlockedServiceKeys: vi.fn(async () => blocked),
  };
}

describe('RbacService.checkServices', () => {
  it('usuário inexistente → unknown_user', async () => {
    const svc = new RbacService(fakeRepo(null), () => fakeRedis());
    expect(await svc.checkServices('u1', ['studio'])).toBe('unknown_user');
  });

  it('super_admin nunca é bloqueado e nem consulta bloqueios', async () => {
    const repo = fakeRepo({ platformRole: 'super_admin', partnerId: null }, ['all']);
    const svc = new RbacService(repo, () => fakeRedis());
    expect(await svc.checkServices('u1', ['studio'])).toBe('allowed');
    expect(repo.listBlockedServiceKeys).not.toHaveBeenCalled();
  });

  it('bloqueio da key → blocked; key diferente → allowed', async () => {
    const svc = new RbacService(fakeRepo({ platformRole: 'user_partner', partnerId: 'p1' }, ['studio.video']), () => fakeRedis());
    expect(await svc.checkServices('u1', ['studio', 'studio.video'])).toBe('blocked');
    expect(await svc.checkServices('u1', ['studio'])).toBe('allowed');
    expect(await svc.checkServices('u1', ['campaigns'])).toBe('allowed');
  });

  it('bloqueio do pai bloqueia o filho (hierárquico)', async () => {
    const svc = new RbacService(fakeRepo({ platformRole: 'user_partner', partnerId: 'p1' }, ['studio']), () => fakeRedis());
    expect(await svc.checkServices('u1', ['studio', 'studio.ai'])).toBe('blocked');
  });

  it("'all' bloqueia qualquer key", async () => {
    const svc = new RbacService(fakeRepo({ platformRole: 'admin_partner', partnerId: 'p1' }, ['all']), () => fakeRedis());
    expect(await svc.checkServices('u1', ['metrics'])).toBe('blocked');
  });

  it('consulta bloqueios com papel e parceiro do usuário', async () => {
    const repo = fakeRepo({ platformRole: 'user_partner', partnerId: 'p9' });
    await new RbacService(repo, () => fakeRedis()).checkServices('u1', ['studio']);
    expect(repo.listBlockedServiceKeys).toHaveBeenCalledWith('user_partner', 'p9');
  });

  it('usa o cache na segunda chamada', async () => {
    const repo = fakeRepo({ platformRole: 'user', partnerId: null }, []);
    const redis = fakeRedis();
    const svc = new RbacService(repo, () => redis);
    await svc.checkServices('u1', ['studio']);
    await svc.checkServices('u1', ['studio']);
    expect(repo.findUserContext).toHaveBeenCalledTimes(1);
    expect(repo.listBlockedServiceKeys).toHaveBeenCalledTimes(1);
  });

  it('bumpVersion invalida o cache na hora', async () => {
    const repo = fakeRepo({ platformRole: 'user', partnerId: null }, []);
    const redis = fakeRedis();
    const svc = new RbacService(repo, () => redis);
    await svc.checkServices('u1', ['studio']);
    repo.listBlockedServiceKeys.mockResolvedValue(['studio']);
    expect(await svc.checkServices('u1', ['studio'])).toBe('allowed'); // ainda em cache
    await svc.bumpVersion();
    expect(await svc.checkServices('u1', ['studio'])).toBe('blocked');
  });

  it('cache separa parceiros diferentes', async () => {
    const redis = fakeRedis();
    const repoA = fakeRepo({ platformRole: 'user_partner', partnerId: 'pA' }, ['studio']);
    const repoB = fakeRepo({ platformRole: 'user_partner', partnerId: 'pB' }, []);
    expect(await new RbacService(repoA, () => redis).checkServices('uA', ['studio'])).toBe('blocked');
    expect(await new RbacService(repoB, () => redis).checkServices('uB', ['studio'])).toBe('allowed');
  });

  it('Redis fora do ar → vai direto ao banco sem chamar o Redis', async () => {
    const repo = fakeRepo({ platformRole: 'user', partnerId: null }, ['studio']);
    const redis = fakeRedis(false);
    expect(await new RbacService(repo, () => redis).checkServices('u1', ['studio'])).toBe('blocked');
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('erro no Redis → cai para o banco', async () => {
    const repo = fakeRepo({ platformRole: 'user', partnerId: null }, ['studio']);
    const redis = fakeRedis();
    redis.get.mockRejectedValue(new Error('boom'));
    expect(await new RbacService(repo, () => redis).checkServices('u1', ['studio'])).toBe('blocked');
  });

  it('falha ao ler a versão → ignora o cache (não reaproveita entrada velha)', async () => {
    const repo = fakeRepo({ platformRole: 'user', partnerId: null }, ['studio']);
    const redis = fakeRedis();
    redis.store.set('rbac:v0:ctx:u1', JSON.stringify({ platformRole: 'super_admin', partnerId: null }));
    redis.get.mockImplementation(async (k: string) => {
      if (k === 'rbac:version') throw new Error('boom');
      return redis.store.get(k) ?? null;
    });
    expect(await new RbacService(repo, () => redis).checkServices('u1', ['studio'])).toBe('blocked');
    expect(repo.findUserContext).toHaveBeenCalled();
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it('getRedis lançando → cai para o banco', async () => {
    const repo = fakeRepo({ platformRole: 'user', partnerId: null }, ['studio']);
    const svc = new RbacService(repo, () => {
      throw new Error('no redis');
    });
    expect(await svc.checkServices('u1', ['studio'])).toBe('blocked');
  });

  it('erro no banco propaga (middleware responde 503)', async () => {
    const repo = fakeRepo(null);
    repo.findUserContext.mockRejectedValue(new Error('db down'));
    await expect(new RbacService(repo, () => fakeRedis(false)).checkServices('u1', ['studio'])).rejects.toThrow('db down');
  });
});

// ───────────────────── middleware + Express espelhando o index.ts ─────────────────────

type Served = { prefix: string; canonical: string } | null;

let server: http.Server;
let port: number;
let lastServed: Served = null;
const blockedByUser = new Map<string, Set<string>>();
const unknownUsers = new Set<string>();
let serviceShouldThrow = false;
const checkServices = vi.fn(async (userId: string, keys: string[]) => {
  if (serviceShouldThrow) throw new Error('db down');
  if (unknownUsers.has(userId)) return 'unknown_user' as const;
  const blocked = blockedByUser.get(userId) ?? new Set();
  if (blocked.has('all') || keys.some((k) => blocked.has(k))) return 'blocked' as const;
  return 'allowed' as const;
});

function dummyRouter(prefix: string) {
  const r = Router();
  const handler = (req: Request, res: Response) => {
    const params = Object.values(req.params).map((p) => String(p).toLowerCase());
    const canonical = prefix === '/v2' && params[0] ? `/v2/${params[0]}` : prefix;
    lastServed = { prefix, canonical };
    res.json({ served: prefix });
  };
  r.all('/', handler);
  r.all('/:a', handler);
  r.all('/:a/:b', handler);
  r.all('/:a/:b/:c', handler);
  return r;
}

function buildMirrorApp() {
  const app = express();
  const router = Router();
  router.use(createRbacMiddleware({ checkServices }));
  for (const m of parseMounts()) {
    if (m.method === 'get') {
      router.get(m.prefix, (_req, res) => {
        lastServed = { prefix: m.prefix, canonical: m.prefix };
        res.json({ served: m.prefix });
      });
    } else {
      router.use(m.prefix, dummyRouter(m.prefix));
    }
  }
  app.use('/api', router);
  app.use((err: AppError, _req: Request, res: Response, _next: NextFunction) => {
    res.status(err.statusCode ?? 500).json({ code: err.code });
  });
  return app;
}

function rawRequest(rawPath: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: rawPath, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let body: any = data;
        try {
          body = JSON.parse(data);
        } catch {
          // não-JSON
        }
        resolve({ status: res.statusCode ?? 0, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function variantsOf(prefix: string): string[] {
  const segs = prefix.split('/').filter(Boolean);
  const last = segs[segs.length - 1]!;
  const head = segs.slice(0, -1);
  const join = (s: string[]) => '/' + s.join('/');
  const encFirst = (s: string) => '%' + s.charCodeAt(0).toString(16) + s.slice(1);
  const encFirstUpper = (s: string) => '%' + s.charCodeAt(0).toString(16).toUpperCase() + s.slice(1);
  const mixed = (s: string) => s.split('').map((c, i) => (i % 2 ? c.toUpperCase() : c)).join('');
  const bases = [
    prefix,
    prefix.toUpperCase(),
    mixed(prefix),
    prefix + '/',
    '/' + prefix,
    prefix.replace(/\//g, '//'),
    join([...head, encFirst(last)]),
    join([...head, encFirstUpper(last)]),
    join([...head, encFirst(last).toUpperCase()]),
  ];
  const suffixes = ['', '/x', '/x/y', '/..', '/.', '/%2e%2e', '/x/../y', '/x%2Fy', '?a=1', '/x?token=lixo'];
  const out: string[] = [];
  for (const b of bases) for (const s of suffixes) out.push(b + s);
  return out;
}

describe('rbacMiddleware — Express real espelhando o index.ts', () => {
  beforeAll(async () => {
    server = buildMirrorApp().listen(0);
    await new Promise<void>((r) => server.once('listening', () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  beforeEach(() => {
    blockedByUser.clear();
    unknownUsers.clear();
    serviceShouldThrow = false;
    lastServed = null;
    checkServices.mockClear();
  });

  const mountedPrefixes = () => [...new Set(parseMounts().map((m) => m.prefix))];

  it('nenhuma variação de caminho deixa um módulo bloqueado responder', async () => {
    const leaks: string[] = [];
    let blockedHits = 0;
    for (const key of ALL_KEYS) {
      blockedByUser.set('u1', new Set([key]));
      const auth = { authorization: `Bearer ${tokenFor('u1')}` };
      const paths = [...mountedPrefixes(), ...RBAC_SERVICES.map((e) => e.prefix)].flatMap(variantsOf);
      for (const p of paths) {
        lastServed = null;
        const res = await rawRequest('/api' + p, auth);
        if (res.status === 403) blockedHits++;
        if (res.status === 200 && lastServed && keysOfCanonical((lastServed as { canonical: string }).canonical).includes(key)) {
          leaks.push(`${key} vazou em ${p} (servido por ${(lastServed as { prefix: string }).prefix})`);
        }
      }
    }
    expect(leaks).toEqual([]);
    expect(blockedHits).toBeGreaterThan(0);
  }, 120_000);

  it('não bloqueia módulos que não estão bloqueados', async () => {
    const wrong: string[] = [];
    for (const key of ALL_KEYS) {
      blockedByUser.set('u1', new Set([key]));
      const auth = { authorization: `Bearer ${tokenFor('u1')}` };
      for (const e of RBAC_SERVICES) {
        const res = await rawRequest('/api' + e.prefix + '/x', auth);
        const shouldBlock = keysOfCanonical(e.prefix).includes(key);
        if (shouldBlock !== (res.status === 403)) wrong.push(`${key} em ${e.prefix} → ${res.status}`);
      }
    }
    expect(wrong).toEqual([]);
  }, 60_000);

  it("'all' bloqueia todos os módulos e nenhum isento", async () => {
    blockedByUser.set('u1', new Set(['all']));
    const auth = { authorization: `Bearer ${tokenFor('u1')}` };
    for (const e of RBAC_SERVICES) expect((await rawRequest('/api' + e.prefix, auth)).status).toBe(403);
    for (const p of RBAC_EXEMPT_PREFIXES) expect((await rawRequest('/api' + p + '/x', auth)).status).not.toBe(403);
  });

  it('isentos nem consultam o serviço', async () => {
    const auth = { authorization: `Bearer ${tokenFor('u1')}` };
    for (const p of RBAC_EXEMPT_PREFIXES) await rawRequest('/api' + p + '/x', auth);
    await rawRequest('/api/rota-inexistente', auth);
    expect(checkServices).not.toHaveBeenCalled();
  });

  it('resposta 403 SERVICE_BLOCKED', async () => {
    blockedByUser.set('u1', new Set(['planner']));
    const res = await rawRequest('/api/planner/x', { authorization: `Bearer ${tokenFor('u1')}` });
    expect(res).toEqual({ status: 403, body: { code: 'SERVICE_BLOCKED' } });
  });

  it('método não importa (POST também é bloqueado)', async () => {
    blockedByUser.set('u1', new Set(['campaigns']));
    const res = await rawRequest('/api/campaigns/x', { authorization: `Bearer ${tokenFor('u1')}` }, 'POST');
    expect(res.status).toBe(403);
  });

  it('token em ?token= (SSE) também é checado', async () => {
    blockedByUser.set('u1', new Set(['fury']));
    const res = await rawRequest(`/api/fury/stream?token=${tokenFor('u1')}`);
    expect(res.status).toBe(403);
  });

  it('header liberado + ?token= bloqueado → 403', async () => {
    blockedByUser.set('blocked', new Set(['fury']));
    const res = await rawRequest(`/api/fury/stream?token=${tokenFor('blocked')}`, {
      authorization: `Bearer ${tokenFor('free')}`,
    });
    expect(res.status).toBe(403);
  });

  it.each(['bearer ', 'BEARER ', 'XXXXXXX', 'Token: '])(
    'header %j + JWT (aceito pelo authSSEMiddleware) também é checado',
    async (prefix) => {
      blockedByUser.set('u1', new Set(['fury']));
      const res = await rawRequest('/api/fury/live-feed', { authorization: prefix + tokenFor('u1') });
      expect(res.status).toBe(403);
    },
  );

  it('vários ?token= → todos checados', async () => {
    blockedByUser.set('blocked', new Set(['fury']));
    const res = await rawRequest(`/api/fury/stream?token=${tokenFor('free')}&token=${tokenFor('blocked')}`);
    expect(res.status).toBe(403);
  });

  it('sem token ou token inválido → segue (a auth da rota decide)', async () => {
    blockedByUser.set('u1', new Set(['all']));
    expect((await rawRequest('/api/campaigns/x')).status).toBe(200);
    expect((await rawRequest('/api/campaigns/x', { authorization: 'Bearer lixo' })).status).toBe(200);
    expect((await rawRequest('/api/campaigns/x', { authorization: tokenFor('u1') })).status).toBe(200); // sem "Bearer "
    expect(checkServices).not.toHaveBeenCalled();
  });

  it('token assinado com outro segredo é ignorado', async () => {
    const jwt = await import('jsonwebtoken');
    const forged = jwt.default.sign({ userId: 'u1', tenantId: 't', email: 'e', role: 'superadmin' }, 'outro-segredo');
    await rawRequest('/api/campaigns/x', { authorization: `Bearer ${forged}` });
    expect(checkServices).not.toHaveBeenCalled();
  });

  it('usuário não encontrado → 401', async () => {
    unknownUsers.add('ghost');
    const res = await rawRequest('/api/campaigns/x', { authorization: `Bearer ${tokenFor('ghost')}` });
    expect(res).toEqual({ status: 401, body: { code: 'UNAUTHORIZED' } });
  });

  it('falha ao verificar → 503 (nunca libera)', async () => {
    serviceShouldThrow = true;
    const res = await rawRequest('/api/campaigns/x', { authorization: `Bearer ${tokenFor('u1')}` });
    expect(res).toEqual({ status: 503, body: { code: 'RBAC_UNAVAILABLE' } });
  });

  it('URI malformada com token → 400', async () => {
    const res = await rawRequest('/api/studio/%E0%A4%A', { authorization: `Bearer ${tokenFor('u1')}` });
    expect(res.status).toBe(400);
  });

  it('token mock só é ignorado com AUTH_BYPASS_DEV fora de produção', async () => {
    const mock = Buffer.from(JSON.stringify({ userId: 'mock-user' })).toString('base64');
    vi.stubEnv('AUTH_BYPASS_DEV', 'true');
    await rawRequest('/api/campaigns/x', { authorization: `Bearer ${mock}` });
    expect(checkServices).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
