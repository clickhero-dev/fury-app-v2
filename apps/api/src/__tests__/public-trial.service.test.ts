import { describe, expect, it, vi } from 'vitest';
import { PublicTrialService } from '../services/core/public-trial.service.js';

describe('PublicTrialService', () => {
  it('retorna redirect_url temporário somente para conta criada', async () => {
    const repository = {
      createAccount: vi.fn().mockResolvedValue({ accountId: 'account-1', temporaryPassword: 'Secret123!', user: { id: 'user-1', tenantId: 'tenant-1', email: 'ana@example.com', name: 'Ana', role: 'owner' } }),
      issueMagicLink: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(null),
    };
    const mailer = { sendPublicTrialMagicLink: vi.fn().mockResolvedValue(undefined) };
    const service = new PublicTrialService(repository as any, mailer as any);
    const result = await service.signup({ name: 'Ana', email: ' ANA@example.com ' });
    expect(result).toMatchObject({ created: true, redirectUrl: expect.stringContaining('#token=') });
    expect(repository.createAccount).toHaveBeenCalledTimes(1);
    expect(repository.issueMagicLink).toHaveBeenCalledTimes(1);
    expect(mailer.sendPublicTrialMagicLink).toHaveBeenCalledTimes(1);
    expect(mailer.sendPublicTrialMagicLink.mock.calls[0][2]).toBe((result as { redirectUrl: string }).redirectUrl);
    expect(mailer.sendPublicTrialMagicLink.mock.calls[0][3]).toBe('Secret123!');
  });

  it('usa FRONTEND_URL em vez da URL da API', async () => {
    vi.stubEnv('PUBLIC_TRIAL_FRONTEND_URL', '');
    vi.stubEnv('APP_URL', 'https://api.example.com');
    vi.stubEnv('FRONTEND_URL', 'https://frontend.example.com/');
    try {
      const repository = { createAccount: vi.fn().mockResolvedValue({ accountId: '1', user: { email: 'ana@example.com', name: 'Ana' } }), issueMagicLink: vi.fn().mockResolvedValue({}) };
      const mailer = { sendPublicTrialMagicLink: vi.fn().mockResolvedValue(undefined) };
      const result = await new PublicTrialService(repository as any, mailer as any).signup({ name: 'Ana', email: 'ana@example.com' });
      expect(result).toMatchObject({ created: true, redirectUrl: expect.stringMatching(/^https:\/\/frontend\.example\.com\/trial\/acesso#token=/) });
      expect(mailer.sendPublicTrialMagicLink.mock.calls[0][2]).toBe((result as { redirectUrl: string }).redirectUrl);
    } finally { vi.unstubAllEnvs(); }
  });

  it('não emite nem retorna token quando o e-mail já existe', async () => {
    const repository = { createAccount: vi.fn().mockResolvedValue({ accountId: '', user: { email: 'ana@example.com' } }), issueMagicLink: vi.fn() };
    const service = new PublicTrialService(repository as any, { sendPublicTrialMagicLink: vi.fn() } as any);
    await expect(service.signup({ name: 'Ana', email: 'ana@example.com' })).resolves.toEqual({ created: false, error: 'EMAIL_JA_CADASTRADO' });
    expect(repository.issueMagicLink).not.toHaveBeenCalled();
  });

  it('avisa o titular quando o email já existe sem emitir token', async () => {
    vi.stubEnv('FRONTEND_URL', 'https://app.example');
    const repository = { createAccount: vi.fn().mockResolvedValue({ accountId: '', user: { email: 'ana@example.com' } }), issueMagicLink: vi.fn() };
    const mailer = { sendPublicTrialMagicLink: vi.fn(), sendPublicTrialExistingAccount: vi.fn().mockResolvedValue(undefined) };
    try {
      const result = await new PublicTrialService(repository as any, mailer as any).signup({ name: 'Ana', email: 'ANA@example.com' });
      expect(result).toEqual({ created: false, error: 'EMAIL_JA_CADASTRADO' });
      expect(mailer.sendPublicTrialExistingAccount).toHaveBeenCalledWith('ana@example.com', 'https://app.example');
      expect(repository.issueMagicLink).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });

  it('mantém o erro de email existente mesmo se o envio falhar', async () => {
    const repository = { createAccount: vi.fn().mockResolvedValue({ accountId: '', user: { email: 'ana@example.com' } }) };
    const mailer = { sendPublicTrialExistingAccount: vi.fn().mockRejectedValue(new Error('smtp')) };
    await expect(new PublicTrialService(repository as any, mailer as any).signup({ name: 'Ana', email: 'ana@example.com' })).resolves.toEqual({ created: false, error: 'EMAIL_JA_CADASTRADO' });
  });

  it('não falha o aceite quando o provedor de email está indisponível', async () => {
    const repository = {
      createAccount: vi.fn().mockResolvedValue({ accountId: 'account-1', user: { email: 'ana@example.com', name: 'Ana' } }),
      issueMagicLink: vi.fn().mockResolvedValue({}),
    };
    const service = new PublicTrialService(repository as any, { sendPublicTrialMagicLink: vi.fn().mockRejectedValue(new Error('smtp')) } as any);
    await expect(service.signup({ name: 'Ana', email: 'ana@example.com' })).resolves.toMatchObject({ created: true, redirectUrl: expect.any(String) });
  });
});
