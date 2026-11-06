/**
 * Funcionalidade: fluxo de acesso trial
 * Cenários: conta real não recebe acesso e token é trocado uma única vez.
 */
import { describe, expect, it, vi } from 'vitest';
import { PublicTrialFlowService } from '../services/billing/public-trial-flow.service.js';

describe('PublicTrialFlowService', () => {
  it('Dado email de conta existente não-trial, quando cadastra, então retorna 202 lógico sem email', async () => {
    const repository = { createOrFindAccount: vi.fn().mockResolvedValue({ created: false, isPublicTrial: false, user: { id: 'u', tenantId: 't', email: 'real@example.com' } }) };
    const sendAccessEmail = vi.fn();
    const service = new PublicTrialFlowService(repository as any, { issueSession: vi.fn(), sendAccessEmail, accessUrl: 'https://app.example/trial/acesso' });
    await expect(service.signup({ name: 'Ana', email: 'real@example.com' })).resolves.toEqual({ message: 'Se for possível, enviaremos um link de acesso.' });
    expect(sendAccessEmail).not.toHaveBeenCalled();
  });

  it('Dado token já consumido, quando tenta trocar, então não cria sessão', async () => {
    const repository = { consumeToken: vi.fn().mockResolvedValue(null) };
    const issueSession = vi.fn();
    const service = new PublicTrialFlowService(repository as any, { issueSession, sendAccessEmail: vi.fn(), accessUrl: 'https://app.example/trial/acesso' });
    await expect(service.access('a'.repeat(64))).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_ACCESS_LINK' });
    expect(issueSession).not.toHaveBeenCalled();
  });
});
