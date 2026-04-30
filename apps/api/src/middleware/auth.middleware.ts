import { Request, Response, NextFunction } from 'express';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid Authorization header',
      },
    });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());

    if (!decoded.userId) {
      throw new Error('Invalid token structure');
    }

    req.user = { userId: decoded.userId };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid token',
      },
    });
  }
}
