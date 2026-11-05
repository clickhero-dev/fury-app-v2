import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { PlannerService } from '../services/planner/planner.service.js';

/**
 * Testes do resolveInstagramAccount — fonte de verdade da conta que o
 * publish-due usa para publicar os posts do calendário.
 *
 * Garantia: publica SOMENTE no perfil Instagram vinculado explicitamente
 * (meta_connections.selected_instagram_user_id, gravado server-side no
 * save-selection). Sem vinculação válida ⇒ NÃO publica (falha segura) —
 * o fallback silencioso pagesWithIg[0] (causa do bug velora→jeanvdentz)
 * foi removido.
 */

/** Replica encryptToken (utils/crypto.ts) p/ token decryptável no teste. */
function encryptForTest(token: string): string {
  const key = crypto.createHash('sha256').update(process.env.JWT_SECRET ?? 'test-jwt-secret').digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}

beforeEach(() => {
  process.env.JWT_SECRET = 'test-jwt-secret';
});

type Page = {
  pageId: string;
  name: string;
  hasInstagram: boolean;
  instagramUserId: string | null;
  instagramUsername: string | null;
};

function makeConn(overrides: Record<string, any> = {}) {
  return {
    id: 'conn-1',
    tenantId: 't1',
    accessToken: encryptForTest('meta-token'),
    selectedPageIds: [] as string[],
    selectedInstagramUserId: null as string | null,
    ...overrides,
  };
}

function makeService(
  conn: ReturnType<typeof makeConn> | null,
  pages: Page[],
) {
  const findLatestMetaConnection = vi.fn(async () => conn);
  const getUserFacebookPages = vi.fn(async () => pages);

  const svc = new PlannerService(
    (() => ({ findLatestMetaConnection })) as any,
    {
      openrouter: {} as any,
      createInstagramMedia: vi.fn(),
      getMediaContainerStatus: vi.fn(),
      publishInstagramMedia: vi.fn(),
      getUserFacebookPages,
    } as any,
  );

  return { svc, findLatestMetaConnection, getUserFacebookPages };
}

// Cenário real do bug 2026-09: perfil Meta do usuário tem a página pessoal
// (jeanvdentz, com IG) E a página do BM (velora_studio, com IG).
const JEANV: Page = { pageId: 'p_jeanv', name: 'Jean V Dentz', hasInstagram: true, instagramUserId: 'ig_jeanv', instagramUsername: 'jeanvdentz' };
const VELORA: Page = { pageId: 'p_velora', name: 'Velora Studio', hasInstagram: true, instagramUserId: 'ig_velora', instagramUsername: 'velora_studio' };

describe('resolveInstagramAccount — publicação só no perfil autorizado', () => {
  it('CENÁRIO DO BUG: usa o perfil VINCULADO (velora) mesmo com jeanvdentz primeiro na lista', async () => {
    const { svc, getUserFacebookPages } = makeService(
      makeConn({ selectedInstagramUserId: 'ig_velora', selectedPageIds: ['p_velora'] }),
      [JEANV, VELORA], // ordem da Meta: pessoal primeiro — antes, fallback pegava ela
    );

    const account = await svc.resolveInstagramAccount('t1');

    expect(account).not.toBeNull();
    expect(account!.igUserId).toBe('ig_velora');
    expect(account!.instagramUsername).toBe('velora_studio');
    expect(account!.pageName).toBe('Velora Studio');
    // resolveu via /me/accounts (fonte da publicação)
    expect(getUserFacebookPages).toHaveBeenCalledTimes(1);
  });

  it('SEM vinculação: NÃO publica mesmo com 2 perfis com IG disponíveis (fallback morto)', async () => {
    const { svc } = makeService(
      makeConn({ selectedInstagramUserId: null }),
      [JEANV, VELORA],
    );

    const account = await svc.resolveInstagramAccount('t1');

    expect(account).toBeNull();
  });

  it('vinculação NULL no banco (tenants antigos) + páginas com IG ⇒ não publica (falha segura)', async () => {
    const { svc } = makeService(
      makeConn({ selectedInstagramUserId: undefined }), // coluna ainda não preenchida
      [VELORA],
    );

    const account = await svc.resolveInstagramAccount('t1');

    expect(account).toBeNull();
  });

  it('perfil vinculado foi REVOGADO (não vem mais no /me/accounts) ⇒ não publica', async () => {
    const { svc } = makeService(
      makeConn({ selectedInstagramUserId: 'ig_revogado' }),
      [JEANV, VELORA],
    );

    const account = await svc.resolveInstagramAccount('t1');

    expect(account).toBeNull();
  });

  it('selectedPageIds aponta página SEM IG ⇒ não publica (nunca cai em outra conta)', async () => {
    const SEM_IG: Page = { pageId: 'p_sem_ig', name: 'Sem IG', hasInstagram: false, instagramUserId: null, instagramUsername: null };
    const { svc } = makeService(
      makeConn({ selectedPageIds: ['p_sem_ig'], selectedInstagramUserId: null }),
      [SEM_IG, VELORA],
    );

    const account = await svc.resolveInstagramAccount('t1');

    expect(account).toBeNull();
  });

  it('sem conexão Meta ⇒ null', async () => {
    const { svc } = makeService(null, [VELORA]);

    const account = await svc.resolveInstagramAccount('t1');

    expect(account).toBeNull();
  });

  it('sem token na conexão ⇒ null', async () => {
    const { svc } = makeService(makeConn({ accessToken: '' }), [VELORA]);

    const account = await svc.resolveInstagramAccount('t1');

    expect(account).toBeNull();
  });

  it('publica nos dados da conta vinculada: accessToken descriptografado + igUserId correto', async () => {
    const { svc } = makeService(
      makeConn({ selectedInstagramUserId: 'ig_velora' }),
      [JEANV, VELORA],
    );

    const account = await svc.resolveInstagramAccount('t1');

    expect(account!.accessToken).toBe('meta-token'); // decrypt do token DA CONEXÃO
    expect(account!.igUserId).toBe('ig_velora');
  });
});
