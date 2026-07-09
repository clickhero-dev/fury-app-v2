import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service.js';
import { checkEmailVerificationRateLimit, checkForgotPasswordRateLimit } from '../middleware/rate-limit.middleware.js';

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

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const body = registerSchema.parse(req.body);
    const result = await authService.register(body);

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
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body);

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
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const body = refreshSchema.parse(req.body);
    const result = await authService.refresh(body);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new Error('User not found in request');
    }

    await authService.logout(req.user.userId);

    res.status(200).json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new Error('User not found in request');
    }

    const user = await authService.getMe(req.user.userId);

    res.status(200).json({
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      throw new Error('User not found in request');
    }

    const body = updateMeSchema.parse(req.body);
    const user = await authService.updateMe(req.user.userId, body);

    res.status(200).json({
      success: true,
      data: user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
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

    const user = await authService.verifyEmail(body.email, body.otp);

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
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
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

    await authService.forgotPassword(body.email);

    res.status(200).json({
      success: true,
      data: null,
      message: 'Se o email existe em nossa base, você receberá instruções para redefinir sua senha.',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
