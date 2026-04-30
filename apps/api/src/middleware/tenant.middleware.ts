import { Request, Response, NextFunction } from 'express';

export function tenantMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.userId) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'User not authenticated',
      },
    });
  }

  req.tenant = { tenantId: req.user.userId };
  next();
}
