import { AppError } from '../../middleware/errorHandler.js';
import type { UserDTO } from '../../lib/shared.js';
import { PublicTrialRepository } from '../../repository/public-trial.repository.js';
import { createMagicLinkToken, hashMagicLinkToken, normalizePublicTrialSignup } from './public-trial.service.js';

export const PUBLIC_TRIAL_ACCEPTED_MESSAGE = 'Se for possível, enviaremos um link de acesso.';
type Session = { user: UserDTO; tokens: { accessToken: string; refreshToken: string } };

export class PublicTrialFlowService {
  constructor(private readonly repository: PublicTrialRepository, private readonly deps: {
    issueSession: (user: any) => Promise<Session>;
    sendAccessEmail: (to: string, name: string, url: string) => Promise<void>;
    accessUrl: string;
    now?: () => Date;
  }) {}

  async signup(input: unknown) {
    const signup = normalizePublicTrialSignup(input);
    const result = await this.repository.createOrFindAccount(signup);
    // Existing non-trial users deliberately get the same answer but no side effect.
    if (!result.isPublicTrial) return { message: PUBLIC_TRIAL_ACCEPTED_MESSAGE };
    const token = createMagicLinkToken();
    const now = this.deps.now?.() ?? new Date();
    if (!result.accountId) return { message: PUBLIC_TRIAL_ACCEPTED_MESSAGE };
    await this.repository.issueToken(result.accountId, hashMagicLinkToken(token), new Date(now.getTime() + 15 * 60 * 1000));
    await this.deps.sendAccessEmail(result.user.email, result.user.name || signup.name, `${this.deps.accessUrl}#token=${token}`);
    return { message: PUBLIC_TRIAL_ACCEPTED_MESSAGE };
  }

  async access(token: string): Promise<Session> {
    if (!/^[a-f0-9]{64}$/i.test(token)) throw new AppError(401, 'INVALID_ACCESS_LINK', 'Link inválido ou expirado.');
    const user = await this.repository.consumeToken(hashMagicLinkToken(token), this.deps.now?.() ?? new Date());
    if (!user) throw new AppError(401, 'INVALID_ACCESS_LINK', 'Link inválido ou expirado.');
    return this.deps.issueSession(user);
  }
}
