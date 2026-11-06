import { describe, expect, it, vi } from 'vitest';
import { PublicTrialService } from '../services/core/public-trial.service.js';

describe('PublicTrialService', () => {
  it('mantém o fluxo idempotente no mesmo tenant e emite novo link', async () => {
    const repository = {
      createAccount: vi.fn().mockResolvedValue({ accountId: 'account-1', user: { id: 'user-1', tenantId: 'tenant-1', email: 'ana@example.com', name: 'Ana', role: 'owner' } }),
      issueMagicLink: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(null),
    };
    const mailer = { sendPublicTrialMagicLink: vi.fn().mockResolvedValue(undefined) };
    const service = new PublicTrialService(repository as any, mailer as any);
    await service.signup({ name: 'Ana', email: ' ANA@example.com ' });
    await service.signup({ name: 'Ana', email: 'ana@example.com' });
    expect(repository.createAccount).toHaveBeenCalledTimes(2);
    expect(repository.issueMagicLink).toHaveBeenCalledTimes(2);
    expect(mailer.sendPublicTrialMagicLink).toHaveBeenCalledTimes(1);
    expect(mailer.sendPublicTrialMagicLink.mock.calls[0][2]).toContain('#token=');
  });

  it('não falha o aceite quando o provedor de email está indisponível', async () => {
    const repository = {
      createAccount: vi.fn().mockResolvedValue({ accountId: 'account-1', user: { email: 'ana@example.com', name: 'Ana' } }),
      issueMagicLink: vi.fn().mockResolvedValue({}),
    };
    const service = new PublicTrialService(repository as any, { sendPublicTrialMagicLink: vi.fn().mockRejectedValue(new Error('smtp')) } as any);
    await expect(service.signup({ name: 'Ana', email: 'ana@example.com' })).resolves.toBeUndefined();
  });
});
