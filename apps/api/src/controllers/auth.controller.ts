import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service.js';

const updateMeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  tenantName: z.string().min(1).max(255).optional(),
  notificationPrefs: z.object({
    campanhas: z.boolean(),
    performance: z.boolean(),
    equipe: z.boolean(),
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
  otp: z.string().regex(/^\d{6}$/, 'OTP must be a 6-digit code'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(1),
  password: z.string().min(8).max(255),
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
          emailVerified: result.user.emailVerified,
        },
        tokens: result.tokens,
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
        tokens: result.tokens,
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
          tenantId: result.user.tenantId,
          emailVerified: result.user.emailVerified,
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
    const result = await authService.verifyEmail(body);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const body = forgotPasswordSchema.parse(req.body);
    const result = await authService.forgotPassword(body);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const result = await authService.resetPassword(body);

    res.status(200).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
