/**
 * Funcionalidade: acesso público ao Trial
 * Cenários:
 * - Dado novo Trial público, quando solicita acesso, então recebe link de uso único com token persistido apenas como hash.
 * - Dado email atual divergente do snapshot, quando solicita novo acesso, então falha fechado sem reenviar link.
 * - Dado conta existente sem Trial, quando solicita acesso, então não recebe link nem tem sua identidade revelada.
 * - Dado link válido, quando acessa, então troca o token por sessão normal.
 * - Dado falha ao persistir sessão após consumir o link, quando solicita novo acesso depois do limite, então pode receber outro link no snapshot validado.
 * - Dado email alterado após consumo do link, quando tenta recuperar sessão, então não envia link ao endereço divergente.
 * - Dado token inválido, quando tenta acessar, então rejeita antes de criar sessão.
 */
import { describe, expect, it, vi } from 'vitest';
import { PublicTrialFlowService } from '../services/billing/public-trial-flow.service.js';
import { hashMagicLinkToken } from '../services/billing/public-trial.service.js';

describe('PublicTrialFlowService', () => {
  it('Dado novo Trial público, quando solicita acesso, então envia link com token de uso único', async () => {
    const now = new Date('2026-11-07T12:00:00.000Z');
    const repository = {
      createOrFindAccount: vi.fn().mockResolvedValue({
        created: true,
        accountId: 'account-1',
        isPublicTrial: true,
        deliveryEmail: 'ana@example.com',
        user: { id: 'user-1', email: 'ana@example.com', name: 'Ana' },
      }),
      issueToken: vi.fn().mockResolvedValue(undefined),
    };
    const sendAccessEmail = vi.fn().mockResolvedValue(undefined);
    const service = new PublicTrialFlowService(repository as never, {
      issueSession: vi.fn(), sendAccessEmail, accessUrl: 'https://web.example/trial/acesso', now: () => now,
    });

    await expect(service.signup({ name: 'Ana', email: 'ANA@example.com' }))
      .resolves.toEqual({ message: 'Se for possível, enviaremos um link de acesso.' });
    const sentUrl = new URL(sendAccessEmail.mock.calls[0][2]);
    const token = new URLSearchParams(sentUrl.hash.slice(1)).get('token');
    expect(sentUrl.origin + sentUrl.pathname).toBe('https://web.example/trial/acesso');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.issueToken).toHaveBeenCalledWith('account-1', hashMagicLinkToken(token!), new Date(now.getTime() + 15 * 60 * 1000));
    expect(sendAccessEmail).toHaveBeenCalledWith('ana@example.com', 'Ana', expect.stringContaining('#token='));
  });

  it('Dado email atual divergente do snapshot, quando solicita novo acesso, então falha fechado sem reenviar link', async () => {
    const repository = {
      createOrFindAccount: vi.fn().mockResolvedValue({
        created: false,
        accountId: 'account-1',
        isPublicTrial: false,
        deliveryEmail: null,
        user: { id: 'user-1', email: 'changed@example.net', name: 'Ana' },
      }),
      issueToken: vi.fn().mockResolvedValue(undefined),
    };
    const sendAccessEmail = vi.fn().mockResolvedValue(undefined);
    const service = new PublicTrialFlowService(repository as never, {
      issueSession: vi.fn(), sendAccessEmail, accessUrl: 'https://web.example/trial/acesso',
    });

    await expect(service.signup({ name: 'Ana', email: 'ana@example.com' }))
      .resolves.toEqual({ message: 'Se for possível, enviaremos um link de acesso.' });

    expect(repository.issueToken).not.toHaveBeenCalled();
    expect(sendAccessEmail).not.toHaveBeenCalled();
  });

  it('Dado link válido e não utilizado, quando acessa, então troca o token por sessão normal', async () => {
    const repository = { consumeToken: vi.fn().mockResolvedValue({ id: 'user-1', email: 'ana@example.com' }) };
    const session = { user: { id: 'user-1' }, tokens: { accessToken: 'access', refreshToken: 'refresh' } };
    const issueSession = vi.fn().mockResolvedValue(session);
    const service = new PublicTrialFlowService(repository as never, {
      issueSession, sendAccessEmail: vi.fn(), accessUrl: 'https://app.example/trial/acesso',
    });
    await expect(service.access('a'.repeat(64))).resolves.toEqual(session);
    expect(issueSession).toHaveBeenCalledWith('user-1');
  });

  it('Dado falha ao criar sessão após consumo, quando solicita novo link depois da janela de limite, então reenvia ao snapshot', async () => {
    const user = { id: 'user-1', email: 'ana@example.com', name: 'Ana' };
    const repository = {
      consumeToken: vi.fn().mockResolvedValue(user),
      createOrFindAccount: vi.fn().mockResolvedValue({
        created: false,
        accountId: 'account-1',
        isPublicTrial: true,
        deliveryEmail: 'ana@example.com',
        user,
      }),
      issueToken: vi.fn().mockResolvedValue(undefined),
    };
    const sendAccessEmail = vi.fn().mockResolvedValue(undefined);
    const service = new PublicTrialFlowService(repository as never, {
      issueSession: vi.fn().mockRejectedValue(new Error('session persistence unavailable')),
      sendAccessEmail,
      accessUrl: 'https://web.example/trial/acesso',
      now: () => new Date('2026-11-07T12:15:00.000Z'),
    });

    await expect(service.access('a'.repeat(64))).rejects.toThrow('session persistence unavailable');
    await expect(service.signup({ name: 'Ana', email: 'ana@example.com' }))
      .resolves.toEqual({ message: 'Se for possível, enviaremos um link de acesso.' });

    expect(repository.consumeToken).toHaveBeenCalledOnce();
    expect(repository.issueToken).toHaveBeenCalledOnce();
    expect(sendAccessEmail).toHaveBeenCalledWith('ana@example.com', 'Ana', expect.stringContaining('#token='));
  });

  it('Dado email alterado após consumo do link, quando tenta recuperar sessão, então não emite novo link', async () => {
    const userAtConsumption = { id: 'user-1', email: 'ana@example.com', name: 'Ana' };
    const userAfterChange = { ...userAtConsumption, email: 'new-address@example.net' };
    const repository = {
      consumeToken: vi.fn().mockResolvedValue(userAtConsumption),
      createOrFindAccount: vi.fn().mockResolvedValue({
        created: false,
        accountId: 'account-1',
        isPublicTrial: false,
        deliveryEmail: null,
        user: userAfterChange,
      }),
      issueToken: vi.fn(),
    };
    const sendAccessEmail = vi.fn();
    const service = new PublicTrialFlowService(repository as never, {
      issueSession: vi.fn().mockRejectedValue(new Error('session persistence unavailable')),
      sendAccessEmail,
      accessUrl: 'https://web.example/trial/acesso',
    });

    await expect(service.access('a'.repeat(64))).rejects.toThrow('session persistence unavailable');
    await expect(service.signup({ name: 'Ana', email: 'ana@example.com' }))
      .resolves.toEqual({ message: 'Se for possível, enviaremos um link de acesso.' });

    expect(repository.issueToken).not.toHaveBeenCalled();
    expect(sendAccessEmail).not.toHaveBeenCalled();
  });

  it('Dado email de conta sem cadastro público, quando solicita acesso, então não envia link nem revela identidade', async () => {
    const repository = {
      createOrFindAccount: vi.fn().mockResolvedValue({ created: false, accountId: null, isPublicTrial: false, user: { id: 'u', tenantId: 't', email: 'member@example.com' } }),
    };
    const sendAccessEmail = vi.fn();
    const service = new PublicTrialFlowService(repository as never, {
      issueSession: vi.fn(), sendAccessEmail, accessUrl: 'https://app.example/trial/acesso',
    });
    await expect(service.signup({ name: 'Ana', email: 'member@example.com' }))
      .resolves.toEqual({ message: 'Se for possível, enviaremos um link de acesso.' });
    expect(sendAccessEmail).not.toHaveBeenCalled();
  });

  it('Dado token sem formato válido, quando tenta acessar, então rejeita antes de criar sessão', async () => {
    const repository = { consumeToken: vi.fn() };
    const issueSession = vi.fn();
    const service = new PublicTrialFlowService(repository as never, {
      issueSession, sendAccessEmail: vi.fn(), accessUrl: 'https://app.example/trial/acesso',
    });
    await expect(service.access('bad')).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_ACCESS_LINK' });
    expect(repository.consumeToken).not.toHaveBeenCalled();
    expect(issueSession).not.toHaveBeenCalled();
  });
});
