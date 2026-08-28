import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import type { GoogleService } from '../services/google/google.service.js';
import {
  contextQuerySchema,
  oauthCallbackQuerySchema,
  connectionIdParamsSchema,
  profileIdParamsSchema,
  verificationSchema,
  categoriesQuerySchema,
  profileUpdateSchema,
  syncLogsQuerySchema,
} from '../schemas/google.schemas.js';

const GOOGLE_MEU_NEGOCIO_PATH = '/configuracoes/google-meu-negocio';

/** Controller Google — glue HTTP fino. Recebe o service no construtor (injeção). */
export class GoogleController {
  constructor(private googleService: GoogleService) {}

  getAuthUrl = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no token JWT.');
      }
      const { context } = contextQuerySchema.parse(req.query);
      const authUrl = this.googleService.generateGoogleAuthUrl(req.user.tenantId, context);
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
      const errorParam = req.query.error as string | undefined;
      if (errorParam) {
        // Usuário recusou o consentimento (access_denied) ou o Google rejeitou a requisição.
        res.redirect(`${frontendUrl}${GOOGLE_MEU_NEGOCIO_PATH}?error=oauth_cancelled`);
        return;
      }

      const query = oauthCallbackQuerySchema.parse(req.query);

      const { returnUrl } = await this.googleService.handleGoogleOAuthCallback(query.code, query.state);

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
  };

  getConnection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const connection = await this.googleService.getGoogleConnection(req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data: connection,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  disconnectConnection = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const params = connectionIdParamsSchema.parse(req.params);
      const data = await this.googleService.disconnectGoogleConnection(params.id, req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getAccounts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const data = await this.googleService.getGoogleAccounts(req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  lookup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const data = await this.googleService.lookupGoogleProfile(req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const data = await this.googleService.getGoogleSettings(req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  updateSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const data = await this.googleService.updateGoogleSettings(req.tenant.tenantId, req.body);
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getCategories = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const { query } = categoriesQuerySchema.parse(req.query);
      const client = await this.googleService.getGoogleApiClient(req.tenant.tenantId);
      const data = await this.googleService.getGoogleCategories(query ?? '', client, req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  createProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const data = await this.googleService.createProfile(req.tenant.tenantId);
      res.status(201).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const { id } = profileIdParamsSchema.parse(req.params);
      const data = await this.googleService.getVerification(id, req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  completeVerification = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const { id } = profileIdParamsSchema.parse(req.params);
      const { method } = verificationSchema.parse(req.body);
      const data = await this.googleService.completeVerification(id, req.tenant.tenantId, method);
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const { id } = profileIdParamsSchema.parse(req.params);
      const data = await this.googleService.getProfile(id, req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const { id } = profileIdParamsSchema.parse(req.params);
      const parsed = profileUpdateSchema.parse(req.body);
      const data = await this.googleService.updateProfile(id, req.tenant.tenantId, parsed);
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  syncProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const { id } = profileIdParamsSchema.parse(req.params);
      const data = await this.googleService.syncProfile(id, req.tenant.tenantId);
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  getSyncLogs = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const { id } = profileIdParamsSchema.parse(req.params);
      const { limit } = syncLogsQuerySchema.parse(req.query);
      const data = await this.googleService.getSyncLogs(id, req.tenant.tenantId, limit);
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  uploadPhoto = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const { id } = profileIdParamsSchema.parse(req.params);

      if (!req.file) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Arquivo de foto e obrigatorio.');
      }

      const fileName = `google-photos/${id}/${Date.now()}-${req.file.originalname}`;
      const data = await this.googleService.addPhoto(
        id,
        req.tenant.tenantId,
        req.file.buffer,
        fileName,
        req.file.mimetype
      );
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };

  deletePhoto = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.tenant?.tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant nao encontrado no contexto da requisicao.');
      }
      const { id } = profileIdParamsSchema.parse(req.params);
      const { url } = req.query;
      if (!url || typeof url !== 'string') {
        throw new AppError(400, 'VALIDATION_ERROR', 'URL da foto e obrigatoria.');
      }
      const data = await this.googleService.removePhoto(id, req.tenant.tenantId, url);
      res.status(200).json({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  };
}