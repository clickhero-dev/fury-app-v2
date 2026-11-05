import { AppError } from '../middleware/errorHandler.js';
import { getRedis } from './redis.js';

export async function assertNotificationRateLimit(tenantId: string, callerId: string): Promise<void> {
  try {
    const redis = getRedis();
    const bucket = `notifications:create:${tenantId}:${callerId}:${Math.floor(Date.now() / 60000)}`;
    const count = await redis.incr(bucket);
    if (count === 1) await redis.expire(bucket, 70);
    if (count > 60) throw new AppError(429, 'RATE_LIMITED', 'Limite de criação de notificações atingido');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, 'RATE_LIMIT_UNAVAILABLE', 'Não foi possível validar o limite de requisições');
  }
}
