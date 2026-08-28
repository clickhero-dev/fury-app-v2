import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import type { AuthService } from '../services/core/auth.service.js';
import type { SocialAuthService } from '../services/core/social-auth.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { checkEmailVerificationRateLimit, checkForgotPasswordRateLimit, checkResetPasswordRateLimit } from '../middleware/rate-limit.middleware.js';

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
  }).optional(),
  businessContext: z.string().optional(),
});

const registerSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  password: z.string().min(8).max(255),
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
  newPassword: z.string().min(8).max(255),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(255),
});

function getSocialRedirectUri(req?: Request): string {
  // Derive from the actual request host so it works in local/HMG/prod without
  // a per-environment env var. Falls back to the env var if set, then localhost.
  const envUri = process.env.GOOGLE_SOCIAL_REDIRECT_URI;
  if (envUri && !envUri.includes('localhost')) return envUri;
  if (req) {
    const host = req.get('host');
    if (host) return `${req.protocol}://${host}/api/auth/google/callback`;
  }
  return envUri || 'http://localhost:3000/api/auth/google/callback';
}

function getSocialFrontendUrl(state?: SocialStatePayload): string {
  // Prefer the frontend URL captured in the OAuth state (set by the initiating env)
  if (state?.frontendUrl) return state.frontendUrl;
  return process.env.GOOGLE_SOCIAL_FRONTEND_URL || 'http://localhost:5173';
}

interface SocialStatePayload {
  frontendUrl: string;
}

function signSocialState(frontendUrl: string): string {
  const secret = process.env.JWT_SECRET || 'fallback';
  return jwt.sign({ frontendUrl } as SocialStatePayload, secret, { expiresIn: '10m' });
}

function verifySocialState(state: string): SocialStatePayload {
  try {
    const secret = process.env.JWT_SECRET || 'fallback';
    return jwt.verify(state, secret) as SocialStatePayload;
  } catch {
    throw new AppError(401, 'INVALID_OAUTH_STATE', 'State OAuth invalido ou expirado.');
  }
}

/** Controller de autenticação — glue HTTP fino. Recebe os services no construtor (injeção). */
export class AuthController {
  constructor(
    private authService: AuthService,
    private socialAuthService: SocialAuthService,
  ) {}

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

      res.status(200).json({
        success: true,
        data: user,
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

  googleSocialUrl = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { getGoogleOAuthConfig } = await import('../lib/google-oauth.js');
      const { clientId } = getGoogleOAuthConfig();
      const redirectUri = getSocialRedirectUri(req);

      // Accept frontend URL from query or header — enables multi-env without hardcoding
      const frontendOrigin = (req.query.origin as string)
        || req.get('origin')
        || req.get('referer')
        || 'http://localhost:5173';
      const state = signSocialState(frontendOrigin);

      const authUrl = this.socialAuthService.generateSocialLoginUrl(redirectUri, clientId, state);
      res.status(200).json({
        success: true,
        data: { authUrl },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  googleSocialCallback = async (req: Request, res: Response, next: NextFunction) => {
    const redirectUri = getSocialRedirectUri(req);

    try {
      const errorParam = req.query.error as string | undefined;
      const stateParam = req.query.state as string | undefined;
      const verifiedState = stateParam ? verifySocialState(stateParam) : undefined;
      const frontendUrl = getSocialFrontendUrl(verifiedState);

      if (errorParam) {
        res.redirect(`${frontendUrl}/login?error=oauth_cancelled`);
        return;
      }

      const code = req.query.code as string | undefined;
      if (!code) {
        const { code: bodyCode } = (req.body || {}) as { code?: string };
        if (!bodyCode) {
          const { AppError } = await import('../middleware/errorHandler.js');
          throw new AppError(400, 'MISSING_CODE', 'Code obrigatorio para login social.');
        }
        const result = await this.socialAuthService.handleGoogleSocialLogin(bodyCode, redirectUri);
        res.status(200).json({
          success: true,
          data: {
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
          },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await this.socialAuthService.handleGoogleSocialLogin(code, redirectUri);
      const tokenData = encodeURIComponent(JSON.stringify({
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
      }));
      const redirectPath = result.isNewUser ? '/cadastro' : '/login';
      res.redirect(`${frontendUrl}${redirectPath}?social_login=${tokenData}`);
    } catch (error) {
      const { AppError } = await import('../middleware/errorHandler.js');
      const message = error instanceof AppError ? error.message : 'Erro ao fazer login com Google';
      const stateParam = req.query.state as string | undefined;
      const verifiedState = stateParam ? verifySocialState(stateParam) : undefined;
      const frontendUrl = getSocialFrontendUrl(verifiedState);
      if (req.method === 'POST') {
        return res.status(401).json({ success: false, error: { code: 'SOCIAL_LOGIN_FAILED', message } });
      }
      res.redirect(`${frontendUrl}/login?error=social_login_failed`);
    }
  };
}