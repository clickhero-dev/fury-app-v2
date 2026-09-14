import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import type { AuthService } from '../services/core/auth.service.js';
import type { SocialAuthService } from '../services/core/social-auth.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { checkEmailVerificationRateLimit, checkForgotPasswordRateLimit, checkResetPasswordRateLimit, checkSocialLoginRateLimit, checkSetPasswordRateLimit, getClientIp } from '../middleware/rate-limit.middleware.js';
import { passwordSchema } from '../lib/shared.js';

const updateMeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  tenantName: z.string().min(1).max(255).optional(),
  notificationPrefs: z.object({
    campanhas: z.boolean(),
    performance: z.boolean(),
    equipe: z.boolean(),
  }).optional(),
  audienceDefaults: z.object({
    city: z.string().optional(),
    cityKey: z.string().optional(),
    ageMin: z.number().int().min(18).max(65).optional(),
    ageMax: z.number().int().min(18).max(65).optional(),
    gender: z.enum(['all', 'male', 'female']).optional(),
    audienceInterests: z.array(z.object({
      id: z.string(),
      name: z.string(),
    })).optional(),
  }).optional(),
  businessContext: z.string().optional(),
});

const registerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: passwordSchema,
  companyName: z.string().min(1).max(255),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const verifyEmailSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d+$/, 'OTP must contain only digits'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d+$/, 'OTP must contain only digits'),
  newPassword: passwordSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

const setPasswordSchema = z.object({
  newPassword: passwordSchema,
});

type SocialProvider = 'google' | 'facebook';

function getSocialRedirectUri(req: Request | undefined, provider: SocialProvider): string {
  // Derive from the actual request host so it works in local/HMG/prod without
  // a per-environment env var. Falls back to the env var if set, then localhost.
  const envUri =
    provider === 'facebook' ? process.env.FACEBOOK_REDIRECT_URI : process.env.GOOGLE_SOCIAL_REDIRECT_URI;
  if (envUri && !envUri.includes('localhost')) return envUri;
  if (req) {
    const host = req.get('host');
    if (host) return `${req.protocol}://${host}/api/auth/${provider}/callback`;
  }
  return envUri || `http://localhost:3000/api/auth/${provider}/callback`;
}

const DEFAULT_SOCIAL_FRONTEND_URL = process.env.GOOGLE_SOCIAL_FRONTEND_URL || 'http://localhost:5173';
const SOCIAL_NONCE_COOKIE = 'social_oauth_nonce';

function defaultFrontendOrigin(): string {
  try {
    return new URL(DEFAULT_SOCIAL_FRONTEND_URL).origin;
  } catch {
    return DEFAULT_SOCIAL_FRONTEND_URL;
  }
}

/**
 * Origem de frontend aceita para o redirect pós-OAuth. **Fail-closed**:
 * - `ALLOWED_FRONTEND_ORIGINS='a,b'` → só as listadas;
 * - ausente → SOMENTE a origem do frontend default (nunca `origin`/`referer` do cliente).
 * Sempre rejeita valores não-http(s) ou não parseáveis.
 */
function isAllowedFrontendOrigin(origin: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const explicit = process.env.ALLOWED_FRONTEND_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (explicit && explicit.length > 0) return explicit.includes(parsed.origin);
  return parsed.origin === defaultFrontendOrigin();
}

/** Normaliza uma origem candidata para uso no redirect, caindo no default se inválida. */
function resolveFrontendOrigin(candidate: string | undefined): string {
  if (candidate && isAllowedFrontendOrigin(candidate)) return new URL(candidate).origin;
  return DEFAULT_SOCIAL_FRONTEND_URL;
}

function getSocialFrontendUrl(state?: SocialStatePayload): string {
  // Só confia no valor do state se ainda passar pela allowlist (a allowlist pode
  // ter mudado, e um state forjado nunca deve virar destino de redirect).
  if (state?.frontendUrl && isAllowedFrontendOrigin(state.frontendUrl)) return state.frontendUrl;
  return DEFAULT_SOCIAL_FRONTEND_URL;
}

interface SocialStatePayload {
  frontendUrl: string;
  /** Nonce CSRF: casado com o cookie HttpOnly setado no início do fluxo. */
  nonce: string;
}

function getSocialStateSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AppError(500, 'MISSING_ENV', 'JWT_SECRET obrigatorio para o state do login social.');
  }
  return secret;
}

function signSocialState(frontendUrl: string, nonce: string): string {
  return jwt.sign({ frontendUrl, nonce } as SocialStatePayload, getSocialStateSecret(), {
    algorithm: 'HS256',
    expiresIn: '10m',
  });
}

function verifySocialState(state: string): SocialStatePayload {
  try {
    return jwt.verify(state, getSocialStateSecret(), { algorithms: ['HS256'] }) as SocialStatePayload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, 'INVALID_OAUTH_STATE', 'State OAuth invalido ou expirado.');
  }
}

/** Lê um cookie do header cru (sem depender de cookie-parser). */
function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

/**
 * Inicia um fluxo OAuth social: gera nonce, grava em cookie HttpOnly e devolve o
 * `state` assinado que carrega o mesmo nonce. O callback confere state.nonce === cookie.
 */
function beginSocialFlow(req: Request, res: Response, frontendOrigin: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const isHttps = req.secure || req.get('x-forwarded-proto') === 'https';
  res.cookie(SOCIAL_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 10 * 60 * 1000,
  });
  return signSocialState(frontendOrigin, nonce);
}

/**
 * Valida o `state` do callback: obrigatório, assinado, e com nonce casando o
 * cookie. Limpa o cookie. Lança AppError em qualquer divergência (anti-CSRF).
 */
function verifySocialCallback(req: Request, res: Response): SocialStatePayload {
  const stateParam = req.query.state as string | undefined;
  if (!stateParam) {
    throw new AppError(400, 'MISSING_OAUTH_STATE', 'Requisicao de callback sem state.');
  }
  const state = verifySocialState(stateParam);
  const cookieNonce = readCookie(req, SOCIAL_NONCE_COOKIE);
  res.clearCookie(SOCIAL_NONCE_COOKIE, { path: '/api/auth' });
  if (!state.nonce || !cookieNonce || state.nonce !== cookieNonce) {
    throw new AppError(401, 'OAUTH_STATE_MISMATCH', 'Falha na verificacao anti-CSRF do login social.');
  }
  return state;
}

/** Resolve o frontend do redirect a partir do state SEM lançar — para uso em blocos catch. */
function safeFrontendUrlFromState(state: string | undefined): string {
  if (!state) return DEFAULT_SOCIAL_FRONTEND_URL;
  try {
    return getSocialFrontendUrl(verifySocialState(state));
  } catch {
    return DEFAULT_SOCIAL_FRONTEND_URL;
  }
}

/** Controller de autenticação — glue HTTP fino. Recebe os services no construtor (injeção). */
export class AuthController {
  constructor(
    private authService: AuthService,
    private socialAuthService: SocialAuthService,
    private policyService?: { getLoginState: (userId: string) => Promise<{ currentVersion: string | null; accepted: boolean }> },
  ) {}

  /** Estado do aceite da política embutido na resposta (evita over-fetching). */
  private async policyState(userId: string) {
    if (!this.policyService) return undefined;
    return this.policyService.getLoginState(userId);
  }

  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = registerSchema.parse(req.body);
      const result = await this.authService.register(body);

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            role: result.user.role,
            tenantId: result.user.tenantId,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = loginSchema.parse(req.body);
      const result = await this.authService.login(body);
      const policy = await this.policyState(result.user.id);

      res.status(200).json({
        success: true,
        data: {
          token: result.tokens.accessToken,
          refreshToken: result.tokens.refreshToken,
          user: {
            id: result.user.id,
            email: result.user.email,
            role: result.user.role,
            tenantId: result.user.tenantId,
          },
          ...(policy ? { policy } : {}),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = refreshSchema.parse(req.body);
      const result = await this.authService.refresh(body);

      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new Error('User not found in request');
      }

      await this.authService.logout(req.user.userId);

      res.status(200).json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new Error('User not found in request');
      }

      const user = await this.authService.getMe(req.user.userId);
      const policy = await this.policyState(req.user.userId);

      res.status(200).json({
        success: true,
        data: { ...user, ...(policy ? { policy } : {}) },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  updateMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new Error('User not found in request');
      }

      const body = updateMeSchema.parse(req.body);
      const user = await this.authService.updateMe(req.user.userId, body);

      res.status(200).json({
        success: true,
        data: user,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new Error('User not found in request');
      }

      const body = changePasswordSchema.parse(req.body);
      await this.authService.changePassword(req.user.userId, body.currentPassword, body.newPassword);

      res.status(200).json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  setPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new Error('User not found in request');
      }

      const { allowed } = await checkSetPasswordRateLimit(req.user.userId);
      if (!allowed) {
        throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas. Tente novamente em 15 minutos.');
      }

      const body = setPasswordSchema.parse(req.body);
      await this.authService.setInitialPassword(req.user.userId, body.newPassword);

      res.status(200).json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = verifyEmailSchema.parse(req.body);

      const { allowed, remaining } = await checkEmailVerificationRateLimit(body.email);

      if (!allowed) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'TOO_MANY_ATTEMPTS',
            message: 'Muitas tentativas de verificação. Tente novamente em 15 minutos.',
          },
          timestamp: new Date().toISOString(),
        });
      }

      const user = await this.authService.verifyEmail(body.email, body.otp);

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            tenantId: user.tenantId,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = forgotPasswordSchema.parse(req.body);

      const { allowed } = await checkForgotPasswordRateLimit(body.email);

      if (!allowed) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'TOO_MANY_ATTEMPTS',
            message: 'Muitas tentativas de redefinição. Tente novamente em 15 minutos.',
          },
          timestamp: new Date().toISOString(),
        });
      }

      await this.authService.forgotPassword(body.email);

      res.status(200).json({
        success: true,
        data: null,
        message: 'Se o email existe em nossa base, você receberá instruções para redefinir sua senha.',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = resetPasswordSchema.parse(req.body);

      const { allowed } = await checkResetPasswordRateLimit(body.email);

      if (!allowed) {
        return res.status(429).json({
          success: false,
          error: {
            code: 'TOO_MANY_ATTEMPTS',
            message: 'Muitas tentativas de redefinição. Tente novamente em 15 minutos.',
          },
          timestamp: new Date().toISOString(),
        });
      }

      const user = await this.authService.resetPassword(body.email, body.otp, body.newPassword);

      res.status(200).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            tenantId: user.tenantId,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  // Endpoint de INÍCIO do fluxo: navegação top-level (o browser vem direto aqui,
  // não via XHR). Só assim o cookie de nonce anti-CSRF (`beginSocialFlow`) é de
  // fato gravado — numa resposta a XHR cross-origin sem `withCredentials` o
  // browser descarta o Set-Cookie. Responde com 302 para o provedor.
  googleSocialUrl = async (req: Request, res: Response) => {
    const frontendOrigin = resolveFrontendOrigin(
      (req.query.origin as string) || req.get('referer') || undefined,
    );
    try {
      const { allowed } = await checkSocialLoginRateLimit(getClientIp(req));
      if (!allowed) {
        res.redirect(`${frontendOrigin}/login?error=rate_limited`);
        return;
      }
      const { getGoogleOAuthConfig } = await import('../lib/google-oauth.js');
      const { clientId } = getGoogleOAuthConfig();
      const redirectUri = getSocialRedirectUri(req, 'google');
      const state = beginSocialFlow(req, res, frontendOrigin);
      const authUrl = this.socialAuthService.generateSocialLoginUrl(redirectUri, clientId, state);
      res.redirect(authUrl);
    } catch {
      res.redirect(`${frontendOrigin}/login?error=social_login_failed`);
    }
  };

  googleSocialCallback = async (req: Request, res: Response, next: NextFunction) => {
    const redirectUri = getSocialRedirectUri(req, 'google');
    const isPost = req.method === 'POST';

    try {
      // GET (navegação top-level): anti-CSRF completo (state obrigatório + cookie nonce).
      // POST (troca de code via XHR do SPA): só valida a assinatura do state.
      const verifiedState = isPost
        ? (req.query.state ? verifySocialState(req.query.state as string) : undefined)
        : verifySocialCallback(req, res);
      const frontendUrl = getSocialFrontendUrl(verifiedState);

      if (req.query.error) {
        res.redirect(`${frontendUrl}/login?error=oauth_cancelled`);
        return;
      }

      const code = (req.query.code as string | undefined) ?? ((req.body || {}) as { code?: string }).code;
      if (!code) {
        throw new AppError(400, 'MISSING_CODE', 'Code obrigatorio para login social.');
      }

      const { allowed } = await checkSocialLoginRateLimit(getClientIp(req));
      if (!allowed) {
        throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      }

      const result = await this.socialAuthService.handleGoogleSocialLogin(code, redirectUri);
      const policy = await this.policyState(result.user.id);
      const sessionPayload = {
        token: result.tokens.accessToken,
        refreshToken: result.tokens.refreshToken,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          tenantId: result.user.tenantId,
        },
        isNewUser: result.isNewUser,
        ...(policy ? { policy } : {}),
      };

      if (isPost) {
        res.status(200).json({ success: true, data: sessionPayload, timestamp: new Date().toISOString() });
        return;
      }

      const tokenData = encodeURIComponent(JSON.stringify(sessionPayload));
      const redirectPath = result.isNewUser ? '/cadastro' : '/login';
      res.redirect(`${frontendUrl}${redirectPath}?social_login=${tokenData}`);
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'Erro ao fazer login com Google';
      const frontendUrl = safeFrontendUrlFromState(req.query.state as string | undefined);
      if (isPost) {
        return res.status(401).json({ success: false, error: { code: 'SOCIAL_LOGIN_FAILED', message } });
      }
      res.redirect(`${frontendUrl}/login?error=social_login_failed`);
    }
  };

  // Ver comentário em `googleSocialUrl`: navegação top-level, responde 302 e é
  // o único ponto onde o cookie de nonce anti-CSRF grava de verdade.
  facebookSocialUrl = async (req: Request, res: Response) => {
    const frontendOrigin = resolveFrontendOrigin(
      (req.query.origin as string) || req.get('referer') || undefined,
    );
    try {
      const { allowed } = await checkSocialLoginRateLimit(getClientIp(req));
      if (!allowed) {
        res.redirect(`${frontendOrigin}/login?error=rate_limited`);
        return;
      }
      const redirectUri = getSocialRedirectUri(req, 'facebook');
      const state = beginSocialFlow(req, res, frontendOrigin);
      const authUrl = this.socialAuthService.generateFacebookLoginUrl(redirectUri, state);
      res.redirect(authUrl);
    } catch {
      res.redirect(`${frontendOrigin}/login?error=social_login_failed`);
    }
  };

  facebookSocialCallback = async (req: Request, res: Response, next: NextFunction) => {
    const redirectUri = getSocialRedirectUri(req, 'facebook');
    const isPost = req.method === 'POST';

    try {
      const verifiedState = isPost
        ? (req.query.state ? verifySocialState(req.query.state as string) : undefined)
        : verifySocialCallback(req, res);
      const frontendUrl = getSocialFrontendUrl(verifiedState);

      if (req.query.error) {
        res.redirect(`${frontendUrl}/login?error=oauth_cancelled`);
        return;
      }

      const code = (req.query.code as string | undefined) ?? ((req.body || {}) as { code?: string }).code;
      if (!code || code.length < 10) {
        throw new AppError(400, 'MISSING_CODE', 'Code obrigatorio para login social.');
      }

      const { allowed } = await checkSocialLoginRateLimit(getClientIp(req));
      if (!allowed) {
        throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      }

      const { user, isNewUser } = await this.socialAuthService.handleFacebookSocialLogin(code, redirectUri);
      const publicUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
      };

      // SPA fez a troca do code: emite e devolve a sessão direto no corpo.
      if (isPost) {
        const tokens = await this.socialAuthService.issueSession(user);
        const policy = await this.policyState(user.id);
        res.status(200).json({
          success: true,
          data: {
            token: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: publicUser,
            isNewUser,
            ...(policy ? { policy } : {}),
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Navegação top-level: handoff id de uso único. NÃO guarda tokens no Redis —
      // só a identidade; a sessão é emitida em /auth/social/handoff.
      const handoffId = await this.socialAuthService.createSocialHandoff({ user: publicUser, isNewUser });
      const redirectPath = isNewUser ? '/cadastro' : '/login';
      res.redirect(`${frontendUrl}${redirectPath}?fb_handoff=${handoffId}`);
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'Erro ao fazer login com Facebook';
      const code = error instanceof AppError ? error.code : 'SOCIAL_LOGIN_FAILED';
      const frontendUrl = safeFrontendUrlFromState(req.query.state as string | undefined);
      if (isPost) {
        return res.status(error instanceof AppError ? error.statusCode : 401).json({
          success: false,
          error: { code, message },
        });
      }
      res.redirect(`${frontendUrl}/login?error=social_login_failed`);
    }
  };

  socialHandoff = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { allowed } = await checkSocialLoginRateLimit(getClientIp(req));
      if (!allowed) {
        throw new AppError(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
      }

      const id = ((req.body || {}) as { id?: string }).id?.trim();
      if (!id || !/^[a-f0-9]{64}$/.test(id)) {
        throw new AppError(400, 'INVALID_HANDOFF_ID', 'Identificador de sessao invalido.');
      }

      const payload = (await this.socialAuthService.consumeSocialHandoff(id)) as
        | { user: { id: string; email: string; name: string | null; role: string; tenantId: string }; isNewUser: boolean }
        | null;
      if (!payload) {
        throw new AppError(401, 'HANDOFF_EXPIRED', 'Sessao social expirada. Entre novamente.');
      }

      const tokens = await this.socialAuthService.issueSession({
        id: payload.user.id,
        tenantId: payload.user.tenantId,
        email: payload.user.email,
        role: payload.user.role,
      });

      // Paridade com login/Google: estado do aceite embutido (zero round-trip extra).
      const policy = await this.policyState(payload.user.id);

      res.status(200).json({
        success: true,
        data: {
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          user: payload.user,
          isNewUser: payload.isNewUser,
          ...(policy ? { policy } : {}),
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };
}