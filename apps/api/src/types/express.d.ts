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
      tenant?: {
        tenantId: string;
      };
      // escopo do admin: partnerId null = super_admin (todos os clientes)
      adminScope?: {
        partnerId: string | null;
      };
    }
  }
}

export {};
