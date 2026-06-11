import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import * as metaService from '../services/meta.service.js';

const callbackQuerySchema = z.object({
  code: z.string().min(1, 'Code OAuth ausente'),
  state: z.string().min(1, 'State OAuth ausente'),
});

const authUrlQuerySchema = z.object({
  context: z.enum(['onboarding', 'settings']).default('onboarding'),
});

const connectionIdSchema = z.object({
  id: z.string().uuid('ID da conexao invalido'),
});

const selectAdAccountBodySchema = z.object({
  adAccountId: z.string().min(1, 'adAccountId obrigatorio'),
});

export async function getAuthUrl(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no token JWT.');
    }
    const { context } = authUrlQuerySchema.parse(req.query);
    const authUrl = metaService.generateMetaAuthUrl(req.user.tenantId, context);
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
  const frontendUrl = process.env.FRONTEND_URL ?? 'https://fury-app-v2-web.vercel.app';

  try {
    const query = callbackQuerySchema.parse(req.query);

    const { returnUrl } = await metaService.handleMetaOAuthCallback(query.code, query.state);

    res.redirect(`${frontendUrl}${returnUrl}`);
  } catch (error) {
    // Fluxo OAuth abandonado/cancelado/expirado nao deve travar o usuario numa
    // resposta JSON crua: redireciona de volta para a tela de integracoes.
    console.error('[OAuth Callback] ERRO:', error);
    res.redirect(`${frontendUrl}/configuracoes/integracoes?error=oauth_cancelled`);
  }
}

export async function getScopes(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const scopes = await metaService.getTenantMetaScopes(req.tenant.tenantId);
    res.status(200).json({
      success: true,
      data: { scopes },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

const pageIdParamsSchema = z.object({
  pageId: z.string().min(1, 'pageId obrigatorio'),
});

export async function getPages(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const pages = await metaService.getTenantFacebookPages(req.tenant.tenantId);
    res.status(200).json({
      success: true,
      data: pages,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPageWhatsappNumbers(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const { pageId } = pageIdParamsSchema.parse(req.params);
    const numbers = await metaService.getTenantPageWhatsappNumbers(req.tenant.tenantId, pageId);
    res.status(200).json({
      success: true,
      data: numbers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getConnections(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const connections = await metaService.getTenantMetaConnections(req.tenant.tenantId);
    res.status(200).json({
      success: true,
      data: connections,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function selectAdAccount(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const params = connectionIdSchema.parse(req.params);
    const body = selectAdAccountBodySchema.parse(req.body);
    const selectedAdAccountId = await metaService.selectAdAccount(
      req.tenant.tenantId,
      params.id,
      body.adAccountId,
    );
    res.status(200).json({
      success: true,
      data: { selectedAdAccountId },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteConnection(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const params = connectionIdSchema.parse(req.params);
    await metaService.deleteTenantMetaConnection(req.tenant.tenantId, params.id);
    res.status(200).json({
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
