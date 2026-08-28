import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { metaService } from '../services/meta/meta.service.js';

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
  const frontendUrl = process.env.FRONTEND_URL;

  if (!frontendUrl) {
    throw new AppError(500, 'SERVER_ERROR', 'URL do frontend nao encontrada');
  }

  try {
    const query = callbackQuerySchema.parse(req.query);

    const { returnUrl } = await metaService.handleMetaOAuthCallback(query.code, query.state);

    res.redirect(`${frontendUrl}${returnUrl}`);
  } catch (error) {
    // Erros de token/state OAuth redirecionam para integracoes; falhas na busca de
    // ativos sao tratadas no service e nao chegam aqui (conexao ja persistida).
    const err = error as any;
    console.error(`[OAuth Callback] ERRO — code=${err?.code || '?'} message=${err?.message || err}`, {
      stack: err?.stack?.split('\n').slice(0, 3).join(' | '),
      metaError: err?.metaError ? JSON.stringify(err.metaError).slice(0, 300) : undefined,
    });
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

const businessIdsBodySchema = z.object({
  businessIds: z.array(z.string().min(1)).min(1, 'Informe ao menos uma Business Manager'),
});

const pageIdsBodySchema = z.object({
  pageIds: z.array(z.string().min(1)),
});

const saveSelectionBodySchema = z.object({
  businessIds: z.array(z.string().min(1)).default([]),
  pageIds: z.array(z.string().min(1)).default([]),
  adAccountIds: z.array(z.string().min(1)).default([]),
  whatsappNumberIds: z.array(z.string().min(1)).default([]),
});

export async function getBusinesses(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const businesses = await metaService.getTenantBusinesses(req.tenant.tenantId);
    res.status(200).json({
      success: true,
      data: businesses,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPagesByBusiness(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const { businessIds } = businessIdsBodySchema.parse(req.body);
    const pages = await metaService.getTenantPagesByBusiness(req.tenant.tenantId, businessIds);
    res.status(200).json({
      success: true,
      data: pages,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAdAccountsByBusiness(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const { businessIds } = businessIdsBodySchema.parse(req.body);
    const adAccounts = await metaService.getTenantAdAccountsByBusiness(req.tenant.tenantId, businessIds);
    res.status(200).json({
      success: true,
      data: adAccounts,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

const whatsappByAssetsBodySchema = z.object({
  businessIds: z.array(z.string().min(1)).default([]),
  pageIds: z.array(z.string().min(1)).default([]),
});

export async function getWhatsappByPages(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const { businessIds, pageIds } = whatsappByAssetsBodySchema.parse(req.body);
    const numbers =
      businessIds.length > 0 || pageIds.length > 0
        ? await metaService.getTenantWhatsappNumbers(req.tenant.tenantId, { businessIds, pageIds })
        : [];
    res.status(200).json({
      success: true,
      data: numbers,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function saveSelection(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const selection = saveSelectionBodySchema.parse(req.body);
    await metaService.saveTenantAssetSelection(req.tenant.tenantId, selection);
    res.status(200).json({
      success: true,
      data: selection,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getAssetSelection(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.tenant?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
    }
    const selection = await metaService.getResolvedTenantAssetSelection(req.tenant.tenantId);
    res.status(200).json({
      success: true,
      data: selection,
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
