import { describe, it, expect, vi } from 'vitest';
import { GoogleController } from '../controllers/google.controller.js';

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
}

describe('GoogleController', () => {
  const googleService = { generateGoogleAuthUrl: vi.fn() } as any;
  const controller = new GoogleController(googleService);

  beforeEach(() => {
    googleService.generateGoogleAuthUrl.mockReset();
  });

  it('happy: getAuthUrl retorna authUrl do tenant autenticado', async () => {
    googleService.generateGoogleAuthUrl.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x=1');
    const req = { user: { tenantId: 't-1' }, query: { context: 'onboarding' }, headers: {} } as any;
    const res = mockRes();
    const next = vi.fn();

    await controller.getAuthUrl(req, res, next);

    expect(googleService.generateGoogleAuthUrl).toHaveBeenCalledWith('t-1', 'onboarding', undefined);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' },
      })
    );
  });

  it('400: getAuthUrl com context inválido chama next com ZodError', async () => {
    const req = { user: { tenantId: 't-1' }, query: { context: 'invalid-context' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await controller.getAuthUrl(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ name: 'ZodError' }));
    expect(res.json).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(googleService.generateGoogleAuthUrl).not.toHaveBeenCalled();
  });

  it('401: getAuthUrl sem tenant no token chama next com AppError', async () => {
    const req = { user: undefined, query: { context: 'onboarding' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await controller.getAuthUrl(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }));
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('GoogleController — mapeamento do erro 401 de auth', () => {
  it('repassa frontendUrl do query para gerar a URL de autorização', async () => {
    const googleService = { generateGoogleAuthUrl: vi.fn(() => 'https://accounts.google.com/x') } as any;
    const controller = new GoogleController(googleService);
    const req = { user: { tenantId: 't-1' }, query: { context: 'settings', frontendUrl: 'http://localhost:5173' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await controller.getAuthUrl(req, res, next);

    expect(googleService.generateGoogleAuthUrl).toHaveBeenCalledWith('t-1', 'settings', 'http://localhost:5173');
    expect(next).not.toHaveBeenCalled();
  });

  it('deriva o origin do header Origin quando o query não traz frontendUrl (browser real)', async () => {
    const googleService = { generateGoogleAuthUrl: vi.fn(() => 'https://accounts.google.com/x') } as any;
    const controller = new GoogleController(googleService);
    const req = {
      user: { tenantId: 't-1' },
      query: { context: 'settings' },
      headers: { origin: 'http://localhost:5173' },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await controller.getAuthUrl(req, res, next);

    expect(googleService.generateGoogleAuthUrl).toHaveBeenCalledWith('t-1', 'settings', 'http://localhost:5173');
    expect(next).not.toHaveBeenCalled();
  });
});