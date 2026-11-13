import { sql } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';
import { AppError } from '../middleware/errorHandler.js';

/** PostgreSQL transaction-scoped lock shared by all API replicas. */
export class ChatMetaLockRepository extends TenantScopedRepository {
  async withLock<T>(resourceId: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(async tx => {
        await tx.execute(sql`SET LOCAL lock_timeout = '10s'`);
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${this.tenantId}:${resourceId}`}, 0))`);
        return operation();
      });
    } catch (err) {
      const error = err as { code?: string; cause?: { code?: string } };
      if (error.code === '55P03' || error.cause?.code === '55P03') {
        throw new AppError(409, 'ACTION_BUSY', 'Há outra alteração em andamento. Tente novamente.');
      }
      throw err;
    }
  }
}
