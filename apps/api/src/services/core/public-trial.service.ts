import crypto from 'node:crypto';
import { AppError } from '../../middleware/errorHandler.js';
import { generateAccessToken, generateRefreshToken } from '../../lib/jwt.js';
import { getRedis } from '../../lib/redis.js';
import { emailService } from '../email/email.service.js';
import { PublicTrialRepository } from '../../repository/public-trial.repository.js';
import { createMagicLinkToken, hashMagicLinkToken, normalizePublicTrialSignup, type PublicTrialSignup } from './public-trial-signup.js';

const REFRESH_TTL = 7 * 24 * 60 * 60;

export class PublicTrialService {
  constructor(
    private readonly repository = new PublicTrialRepository(),
    private readonly mailer: Pick<typeof emailService, 'sendPublicTrialMagicLink' | 'sendPublicTrialExistingAccount'> = emailService,
  ) {}

  async signup(input: unknown): Promise<
    | { created: true; redirectUrl: string }
    | { created: false; error: 'EMAIL_JA_CADASTRADO' }
  > {
    const data: PublicTrialSignup = normalizePublicTrialSignup(input);
    const result = await this.repository.createAccount(data);
    // Não emitimos um token novo para uma identidade existente: isso impediria
    // que o webhook alterasse o acesso de uma conta já criada.
    if (!result.accountId) {
      const baseUrl = process.env.PUBLIC_TRIAL_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
      try { await this.mailer.sendPublicTrialExistingAccount(data.email, baseUrl.replace(/\/$/, '')); }
      catch { console.error('[public-trial] falha no envio do aviso de conta existente'); }
      return { created: false, error: 'EMAIL_JA_CADASTRADO' };
    }
    const token = createMagicLinkToken();
    const link = await this.repository.issueMagicLink(result.accountId, token.hash, token.expiresAt);
    if (!link) return { created: true, redirectUrl: '' };
    const baseUrl = process.env.PUBLIC_TRIAL_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    const url = `${baseUrl.replace(/\/$/, '')}/trial/acesso#token=${token.raw}`;
    try {
      await this.mailer.sendPublicTrialMagicLink(result.user.email, result.user.name || data.name, url, result.temporaryPassword, baseUrl);
    } catch (error) {
      // O cadastro já está durável; o próximo pedido após o cooldown pode emitir
      // outro link. Nunca transformar falha do SMTP em vazamento de existência.
      console.error('[public-trial] falha no envio do acesso');
    }
    return { created: true, redirectUrl: url };
  }

  async access(rawToken: string) {
    if (!/^[a-f0-9]{64}$/i.test(rawToken)) throw new AppError(401, 'INVALID_MAGIC_LINK', 'Link inválido ou expirado.');
    const result = await this.repository.consumeMagicLink(hashMagicLinkToken(rawToken));
    if (!result) throw new AppError(401, 'INVALID_MAGIC_LINK', 'Link inválido ou expirado.');

    const accessToken = generateAccessToken({ userId: result.user.id, tenantId: result.user.tenantId, email: result.user.email, role: result.user.role });
    const refreshToken = generateRefreshToken(result.user.id);
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await getRedis().setex(`refresh:${result.user.id}`, REFRESH_TTL, hash);
    return { token: accessToken, refreshToken, user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role, tenantId: result.user.tenantId, mustChangePassword: result.user.mustChangePassword } };
  }
}
