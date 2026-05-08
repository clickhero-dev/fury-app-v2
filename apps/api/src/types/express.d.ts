import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        tenantId: string;
        email: string;
        role: string;
      };
      userId?: string;
      tenantId?: string;
      userRole?: string;
    }
  }
}
