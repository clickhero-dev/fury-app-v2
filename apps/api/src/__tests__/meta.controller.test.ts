import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { MetaController } from '../controllers/meta.controller.js';

vi.mock('../services/email/notify.js', () => ({
  sendToTenant: vi.fn(async () => undefined),
}));
vi.mock('../services/email/email.service.js', () => ({
  emailService: { sendAccountConnected: vi.fn(), sendAccountDisconnected: vi.fn() },
}));

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn(), redirect: vi.fn() } as any;
}

function signedState(payload: Record<string, unknown>): string {
  return jwt.sign(payload, 'test-jwt-secret');
}

describe('MetaController', () => {
  const metaService = { getTenantBusinesses: vi.fn(), getTenantPagesByBusiness: vi.fn(), getTenantMetaScopes: vi.fn() } as any;
  const controller = new MetaController(metaService);

  beforeEach(() => {
    metaService.getTenantBusinesses.mockReset();
    metaService.getTenantPagesByBusiness.mockReset();
    metaService.getTenantMetaScopes.mockReset();
    process.env.META_APP_ID = 'app_id_123';
    process.env.JWT_SECRET = 'test-jwt-secret';
    process.env.META_REDIRECT_URI = 'http://localhost/api/meta/auth/callback';
    process.env.FRONTEND_URL = 'https://clickhero-fury-web.u7pe19.easypanel.host';
  });

  it('happy: getBusinesses retorna businesses do tenant', async () => {
    metaService.getTenantBusinesses.mockResolvedValue([{ id: 'bm-1', name: 'Biz' }]);
    const req = { tenant: { tenantId: 't-1' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await controller.getBusinesses(req, res, next);

    expect(metaService.getTenantBusinesses).toHaveBeenCalledWith('t-1');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: [{ id: 'bm-1', name: 'Biz' }] })
    );
  });

  it('400: getPagesByBusiness com businessIds vazio chama next com ZodError', async () => {
    const req = { tenant: { tenantId: 't-1' }, body: { businessIds: [] } } as any;
    const res = mockRes();
    const next = vi.fn();

    await controller.getPagesByBusiness(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
    expect(res.json).not.toHaveBeenCalled();
    expect(metaService.getTenantPagesByBusiness).not.toHaveBeenCalled();
  });

  it('getAuthUrl usa o origin do header da requisição (não FRONTEND_URL fixo)', async () => {
    const generateMetaAuthUrl = vi.fn(() => 'https://www.facebook.com/dialog/oauth?state=x');
    const localController = new MetaController({ generateMetaAuthUrl } as any);
    const req = {
      user: { tenantId: 't-1' },
      query: { context: 'settings' },
      headers: { origin: 'https://app.useady.com.br' },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await localController.getAuthUrl(req, res, next);

    expect(generateMetaAuthUrl).toHaveBeenCalledWith('t-1', 'settings', 'https://app.useady.com.br');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { authUrl: expect.any(String) } })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('authCallback redireciona para a frontendUrl embutida no state (domínio de origem do fluxo)', async () => {
    const state = signedState({
      tenantId: 't-1',
      context: 'settings',
      frontendUrl: 'https://app.useady.com.br',
    });
    metaService.handleMetaOAuthCallback = vi.fn(async (code: string, rawState: string) => {
      const decoded = jwt.decode(rawState) as { frontendUrl?: string };
      return {
        tenantId: 't-1',
        context: 'settings',
        returnUrl: '/configuracoes/integracoes?connected=true',
        frontendUrl: decoded.frontendUrl,
      };
    });
    const localController = new MetaController(metaService);
    const req = { query: { code: 'code123', state } } as any;
    const res = mockRes();
    const next = vi.fn();

    await localController.authCallback(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith(
      'https://app.useady.com.br/configuracoes/integracoes?connected=true'
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('authCallback cai no FRONTEND_URL quando o state não carrega frontendUrl (fallback)', async () => {
    const state = signedState({ tenantId: 't-1', context: 'settings' });
    metaService.handleMetaOAuthCallback = vi.fn(async () => ({
      tenantId: 't-1',
      context: 'settings',
      returnUrl: '/configuracoes/integracoes?connected=true',
    }));
    const localController = new MetaController(metaService);
    const req = { query: { code: 'code123', state } } as any;
    const res = mockRes();
    const next = vi.fn();

    await localController.authCallback(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith(
      'https://clickhero-fury-web.u7pe19.easypanel.host/configuracoes/integracoes?connected=true'
    );
  });

  it('authCallback redireciona para integracoes com erro quando o callback falha', async () => {
    const state = signedState({ tenantId: 't-1', context: 'settings' });
    metaService.handleMetaOAuthCallback = vi.fn(async () => {
      throw new Error('token exchange failed');
    });
    const localController = new MetaController(metaService);
    const req = { query: { code: 'code123', state } } as any;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = mockRes();
    const next = vi.fn();

    await localController.authCallback(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith(
      'https://clickhero-fury-web.u7pe19.easypanel.host/configuracoes/integracoes?error=oauth_cancelled'
    );
    expect(next).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});