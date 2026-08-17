import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import * as googleService from '../services/google.service.js';
import {
  contextQuerySchema,
  oauthCallbackQuerySchema,
  connectionIdParamsSchema,
  profileIdParamsSchema,
  verificationSchema,
  categoriesQuerySchema,
} from '../schemas/google.schemas.js';

const GOOGLE_MEU_NEGOCIO_PATH = '/configuracoes/google-meu-negocio';

export async function getAuthUrl(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no token JWT.');
    }
    const { context } = contextQuerySchema.parse(req.query);
    const authUrl = googleService.generateGoogleAuthUrl(req.user.tenantId, context);
    res.status(200).json({
      success: true,
      data: { authUrl },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function authCallback(req: Request, res: Response, next: NextFunction) {
  const frontendUrl = process.env.FRONTEND_URL;

  if (!frontendUrl) {
    throw new AppError(500, 'SERVER_ERROR', 'URL do frontend nao encontrada');
  }

  try {
    const errorParam = req.query.error as string | undefined;
    if (errorParam) {
      // Usuário recusou o consentimento (access_denied) ou o Google rejeitou a requisição.
      res.redirect(`${frontendUrl}${GOOGLE_MEU_NEGOCIO_PATH}?error=oauth_cancelled`);
      return;
    }

    const query = oauthCallbackQuerySchema.parse(req.query);

    const { returnUrl } = await googleService.handleGoogleOAuthCallback(query.code, query.state);

    res.redirect(`${frontendUrl}${returnUrl}`);
  } catch (error) {
    const code = error instanceof AppError ? error.code : undefined;
    const errorParam =
      code === 'INVALID_OAUTH_STATE'
        ? 'invalid_state'
        : code === 'GOOGLE_TOKEN_EXCHANGE_FAILED'
          ? 'token_exchange_failed'
          : 'oauth_cancelled';

    console.error('[Google OAuth Callback] ERRO:', error);
    res.redirect(`${frontendUrl}${GOOGLE_MEU_NEGOCIO_PATH}?error=${errorParam}`);
  }
}

export async function getConnection(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const connection = await googleService.getGoogleConnection(req.tenant.tenantId);
    res.status(200).json({
      success: true,
      data: connection,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function disconnectConnection(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const params = connectionIdParamsSchema.parse(req.params);
    const data = await googleService.disconnectGoogleConnection(params.id, req.tenant.tenantId);
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAccounts(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const data = await googleService.getGoogleAccounts(req.tenant.tenantId);
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function lookup(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const data = await googleService.lookupGoogleProfile(req.tenant.tenantId);
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const data = await googleService.getGoogleSettings(req.tenant.tenantId);
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSettings(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const data = await googleService.updateGoogleSettings(req.tenant.tenantId, req.body);
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getCategories(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const { query } = categoriesQuerySchema.parse(req.query);
    const client = await googleService.getGoogleApiClient(req.tenant.tenantId);
    const data = await googleService.getGoogleCategories(query ?? '', client, req.tenant.tenantId);
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function createProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const data = await googleService.createProfile(req.tenant.tenantId);
    res.status(201).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getVerification(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const { id } = profileIdParamsSchema.parse(req.params);
    const data = await googleService.getVerification(id, req.tenant.tenantId);
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function completeVerification(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const { id } = profileIdParamsSchema.parse(req.params);
    const { method } = verificationSchema.parse(req.body);
    const data = await googleService.completeVerification(id, req.tenant.tenantId, method);
    res.status(200).json({
      success: true,
      data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}