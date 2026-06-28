import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        tenantId: string;
        email: string;
        role: string;
        isSuperadmin: boolean;
      };
      tenant?: {
        tenantId: string;
      };
    }
  }
}

export {};
