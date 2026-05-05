import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import * as metaService from '../services/meta.service.js';

const callbackQuerySchema = z.object({
  code: z.string().min(1, 'Code OAuth ausente'),
  state: z.string().min(1, 'State OAuth ausente'),
});

const connectionIdSchema = z.object({
  id: z.string().uuid('ID da conexao invalido'),
});

export async function getAuthUrl(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no token JWT.');
    }
    const authUrl = metaService.generateMetaAuthUrl(req.user.tenantId);
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
  try {
    const query = callbackQuerySchema.parse(req.query);
    await metaService.handleMetaOAuthCallback(query.code, query.state);
    res.redirect('/dashboard?connected=true');
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
