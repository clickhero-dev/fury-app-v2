import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import type { MetaService } from '../services/meta/meta.service.js';

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

/** Controller Meta — glue HTTP fino. Recebe o service no construtor (injeção). */
export class MetaController {
  constructor(private metaService: MetaService) {}

  getAuthUrl = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no token JWT.');
      }
      const { context } = authUrlQuerySchema.parse(req.query);
      const authUrl = this.metaService.generateMetaAuthUrl(req.user.tenantId, context);
      res.status(200).json({
        success: true,
        data: { authUrl },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  authCallback = async (req: Request, res: Response, next: NextFunction) => {
    const frontendUrl = process.env.FRONTEND_URL;

    if (!frontendUrl) {
      throw new AppError(500, 'SERVER_ERROR', 'URL do frontend nao encontrada');
    }

    try {
      const query = callbackQuerySchema.parse(req.query);

      const { returnUrl } = await this.metaService.handleMetaOAuthCallback(query.code, query.state);

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
  };

  getScopes = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const scopes = await this.metaService.getTenantMetaScopes(req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data: { scopes },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getPages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const pages = await this.metaService.getTenantFacebookPages(req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data: pages,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getPageWhatsappNumbers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const { pageId } = pageIdParamsSchema.parse(req.params);
      const numbers = await this.metaService.getTenantPageWhatsappNumbers(req.tenant.tenantId, pageId);
      res.status(200).json({
        success: true,
        data: numbers,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getBusinesses = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const businesses = await this.metaService.getTenantBusinesses(req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data: businesses,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getPagesByBusiness = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const { businessIds } = businessIdsBodySchema.parse(req.body);
      const pages = await this.metaService.getTenantPagesByBusiness(req.tenant.tenantId, businessIds);
      res.status(200).json({
        success: true,
        data: pages,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getAdAccountsByBusiness = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const { businessIds } = businessIdsBodySchema.parse(req.body);
      const adAccounts = await this.metaService.getTenantAdAccountsByBusiness(req.tenant.tenantId, businessIds);
      res.status(200).json({
        success: true,
        data: adAccounts,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getWhatsappByPages = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const { businessIds, pageIds } = whatsappByAssetsBodySchema.parse(req.body);
      const numbers =
        businessIds.length > 0 || pageIds.length > 0
          ? await this.metaService.getTenantWhatsappNumbers(req.tenant.tenantId, { businessIds, pageIds })
          : [];
      res.status(200).json({
        success: true,
        data: numbers,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  saveSelection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const selection = saveSelectionBodySchema.parse(req.body);
      await this.metaService.saveTenantAssetSelection(req.tenant.tenantId, selection);
      res.status(200).json({
        success: true,
        data: selection,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getAssetSelection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const selection = await this.metaService.getResolvedTenantAssetSelection(req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data: selection,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getConnections = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const connections = await this.metaService.getTenantMetaConnections(req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data: connections,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  selectAdAccount = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const params = connectionIdSchema.parse(req.params);
      const body = selectAdAccountBodySchema.parse(req.body);
      const selectedAdAccountId = await this.metaService.selectAdAccount(
        req.tenant.tenantId,
        params.id,
        body.adAccountId
      );
      res.status(200).json({
        success: true,
        data: { selectedAdAccountId },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  deleteConnection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const params = connectionIdSchema.parse(req.params);
      await this.metaService.deleteTenantMetaConnection(req.tenant.tenantId, params.id);
      res.status(200).json({
        success: true,
        data: null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };
}

const pageIdParamsSchema = z.object({
  pageId: z.string().min(1, 'pageId obrigatorio'),
});

const businessIdsBodySchema = z.object({
  businessIds: z.array(z.string().min(1)).min(1, 'Informe ao menos uma Business Manager'),
});

const whatsappByAssetsBodySchema = z.object({
  businessIds: z.array(z.string().min(1)).default([]),
  pageIds: z.array(z.string().min(1)).default([]),
});

const saveSelectionBodySchema = z.object({
  businessIds: z.array(z.string().min(1)).default([]),
  pageIds: z.array(z.string().min(1)).default([]),
  adAccountIds: z.array(z.string().min(1)).default([]),
  whatsappNumberIds: z.array(z.string().min(1)).default([]),
});