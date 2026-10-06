import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import type { MetaHealthcheckRepository } from '../repository/meta-healthcheck.repository.js';
import type { MetaHealthcheckService } from '../services/meta/meta-healthcheck.service.js';

const userIdSchema = z.string().uuid();

export class MetaHealthcheckController {
  constructor(
    private readonly repository: Pick<MetaHealthcheckRepository, 'listUsers' | 'findUser' | 'findLatest'>,
    private readonly service: Pick<MetaHealthcheckService, 'runForTenant'>,
  ) {}

  listUsers = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await this.repository.listUsers();
      res.json({ success: true, data: users, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };

  getLatest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = userIdSchema.parse(req.query.userId);
      const user = await this.repository.findUser(userId);
      if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
      const result = await this.repository.findLatest(user.tenantId);
      res.json({ success: true, data: { user, result }, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };

  run = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = userIdSchema.parse(req.body?.userId);
      const user = await this.repository.findUser(userId);
      if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Usuário não encontrado.');
      const result = await this.service.runForTenant(user.tenantId);
      res.json({ success: true, data: result, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };
}
