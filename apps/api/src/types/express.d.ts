declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
      };
      tenant?: {
        tenantId: string;
      };
    }
  }
}

export {};
