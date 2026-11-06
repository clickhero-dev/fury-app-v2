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
    private readonly mailer: Pick<typeof emailService, 'sendPublicTrialMagicLink'> = emailService,
  ) {}

  async signup(input: unknown): Promise<void> {
    const data: PublicTrialSignup = normalizePublicTrialSignup(input);
    const result = await this.repository.createAccount(data);
    if (!result.accountId) return; // conta existente que não é trial público
    const token = createMagicLinkToken();
    await this.repository.issueMagicLink(result.accountId, token.hash, token.expiresAt);
    const baseUrl = process.env.PUBLIC_TRIAL_FRONTEND_URL || process.env.APP_URL || 'http://localhost:5173';
    const url = `${baseUrl.replace(/\/$/, '')}/trial/acesso#token=${token.raw}`;
    try {
      await this.mailer.sendPublicTrialMagicLink(result.user.email, result.user.name || data.name, url);
    } catch (error) {
      // O cadastro já está durável; o próximo pedido após o cooldown pode emitir
      // outro link. Nunca transformar falha do SMTP em vazamento de existência.
      console.error('[public-trial] falha no envio do acesso');
    }
  }

  async access(rawToken: string) {
    if (!/^[a-f0-9]{64}$/i.test(rawToken)) throw new AppError(401, 'INVALID_MAGIC_LINK', 'Link inválido ou expirado.');
    const result = await this.repository.consumeMagicLink(hashMagicLinkToken(rawToken));
    if (!result) throw new AppError(401, 'INVALID_MAGIC_LINK', 'Link inválido ou expirado.');

    const accessToken = generateAccessToken({ userId: result.user.id, tenantId: result.user.tenantId, email: result.user.email, role: result.user.role });
    const refreshToken = generateRefreshToken(result.user.id);
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await getRedis().setex(`refresh:${result.user.id}`, REFRESH_TTL, hash);
    return { token: accessToken, refreshToken, user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role, tenantId: result.user.tenantId } };
  }
}
