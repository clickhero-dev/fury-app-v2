import { sql } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';
import type { ChatAction } from '../services/core/chat-approval.service.js';

export class ChatApprovalRepository extends TenantScopedRepository {
  async unknown(approvalId: string, userId: string): Promise<void> {
    await this.db.execute(sql`UPDATE chat_approvals SET status='unknown', result='{"error":"Não foi possível confirmar o resultado. Verifique a ação antes de tentar novamente."}'::jsonb
      WHERE id=${approvalId}::uuid AND tenant_id=${this.tenantId}::uuid AND user_id=${userId}::uuid AND status='executing'`);
  }
  async fail(approvalId: string, userId: string): Promise<void> {
    await this.db.execute(sql`UPDATE chat_approvals SET status='failed', result='{"error":"Não foi possível confirmar o resultado. Verifique os dados antes de tentar novamente."}'::jsonb
      WHERE id=${approvalId}::uuid AND tenant_id=${this.tenantId}::uuid AND user_id=${userId}::uuid AND status='executing'`);
  }
  async complete(approvalId: string, userId: string): Promise<void> {
    await this.db.execute(sql`UPDATE chat_approvals SET status = 'completed',
      result = CASE WHEN status='unknown' AND result='{"error":"Não foi possível confirmar o resultado. Verifique a ação antes de tentar novamente."}'::jsonb THEN NULL ELSE result END
      WHERE id = ${approvalId}::uuid AND tenant_id = ${this.tenantId}::uuid
        AND user_id = ${userId}::uuid AND status IN ('executing','unknown')`);
  }
  async consume(action: ChatAction): Promise<boolean> {
    if (action.tenantId !== this.tenantId) return false;
    const result = await this.db.execute(sql`
      UPDATE chat_approvals SET status = 'executing', execution_started_at = now()
      WHERE id = ${action.approvalId}::uuid AND tenant_id = ${this.tenantId}::uuid
        AND user_id = ${action.userId}::uuid AND method = ${action.method} AND path = ${action.path}
        AND body = ${JSON.stringify(action.body ?? {})}::jsonb
        AND status = 'approved' AND expires_at > now()
      RETURNING id
    `);
    return result.length === 1;
  }
}
