import { sql } from 'drizzle-orm';
import { TenantScopedRepository } from './base.repository.js';
import { slugify } from '../lib/slug.js';
import { AppError } from '../middleware/errorHandler.js';

export interface ChatProfileValues { name?: string; tenantName?: string; businessContext?: string }
export interface ChatProfileSnapshot { name: string | null; tenantName: string; businessContext: string | null; userVersion: string; tenantVersion: string }
export interface GuidedProfileFence { conversationId: string; runId: string; leaseId: string }
type GuidedValues = Required<Pick<ChatProfileValues, 'tenantName' | 'businessContext'>>;
export class ChatProfileRepository extends TenantScopedRepository {
  async applyGuided(userId: string, values: GuidedValues, fence: GuidedProfileFence): Promise<ChatProfileSnapshot> {
    try {
      return await this.db.transaction(async tx => {
        const owned = await tx.execute(sql`SELECT id FROM chat_conversations WHERE id=${fence.conversationId}::uuid AND tenant_id=${this.tenantId}::uuid AND user_id=${userId}::uuid FOR UPDATE`);
        if (!owned.length) throw new AppError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
        await tx.execute(sql`SELECT id FROM chat_response_runs WHERE id=${fence.runId}::uuid FOR UPDATE`);
        const checkFence = async () => {
          const runs = await tx.execute(sql`SELECT user_message_id AS "messageId" FROM chat_response_runs WHERE id=${fence.runId}::uuid AND conversation_id=${fence.conversationId}::uuid AND lease_id=${fence.leaseId}::uuid AND status='running' AND lease_until>clock_timestamp()`);
          if (!runs[0]) throw new AppError(409, 'CHAT_RUN_EXPIRED', 'A execução da conversa expirou.');
          return String(runs[0].messageId);
        };
        const messageId = await checkFence();
        const receipts = await tx.execute(sql`SELECT result FROM chat_guided_setup_receipts WHERE conversation_id=${fence.conversationId}::uuid AND user_message_id=${messageId}::uuid`);
        const result = receipts[0]?.result as { profileUpdate?: GuidedValues; profileExpected?: { userVersion?: unknown; tenantVersion?: unknown } } | undefined;
        const expected = result?.profileExpected;
        if (result?.profileUpdate?.tenantName !== values.tenantName || result?.profileUpdate?.businessContext !== values.businessContext ||
            typeof expected?.userVersion !== 'string' || !/^\d{1,10}$/.test(expected.userVersion) ||
            typeof expected.tenantVersion !== 'string' || !/^\d{1,10}$/.test(expected.tenantVersion)) {
          throw new AppError(409, 'CHAT_GUIDED_RECEIPT_MISMATCH', 'Não foi possível confirmar os dados do fluxo guiado.');
        }
        const rows = await tx.execute(sql`SELECT u.xmin::text AS "userVersion",t.xmin::text AS "tenantVersion" FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=${userId}::uuid AND t.id=${this.tenantId}::uuid AND u.deleted_at IS NULL AND t.deleted_at IS NULL FOR UPDATE OF u,t`);
        if (!rows[0]) throw new AppError(409,'PROFILE_CHANGED','O perfil ou negócio mudou. Consulte novamente antes de confirmar.');
        await checkFence();
        const existing = await tx.execute(sql`SELECT result FROM chat_guided_profile_effects WHERE conversation_id=${fence.conversationId}::uuid AND user_message_id=${messageId}::uuid`);
        if (existing[0]) {
          const saved = existing[0].result as unknown as ChatProfileSnapshot;
          if (rows[0].userVersion !== saved.userVersion || rows[0].tenantVersion !== saved.tenantVersion) {
            throw new AppError(409, 'CHAT_GUIDED_PROFILE_SUPERSEDED', 'O perfil foi alterado após a atualização guiada. Consulte os dados atuais.');
          }
          return saved;
        }
        if (rows[0].userVersion !== expected.userVersion || rows[0].tenantVersion !== expected.tenantVersion) throw new AppError(409,'PROFILE_CHANGED','O perfil ou negócio mudou. Consulte novamente antes de confirmar.');
        const slug = slugify(values.tenantName);
        if (slug) {
          const others = await tx.execute(sql`SELECT slug,name FROM tenants WHERE id<>${this.tenantId}::uuid`);
          if (others.some(row => row.slug === slug || (typeof row.name === 'string' && slugify(row.name) === slug))) throw new AppError(409,'SLUG_EXISTS','Já existe um negócio com esse nome. Escolha outro nome.');
        }
        await checkFence();
        await tx.execute(sql`UPDATE tenants SET name=${values.tenantName},slug=coalesce(${slug || null},slug),business_context=${values.businessContext || null} WHERE id=${this.tenantId}::uuid`);
        const updated = await tx.execute(sql`SELECT u.name,t.name AS "tenantName",t.business_context AS "businessContext",u.xmin::text AS "userVersion",t.xmin::text AS "tenantVersion" FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.id=${userId}::uuid AND t.id=${this.tenantId}::uuid`);
        await tx.execute(sql`INSERT INTO chat_guided_profile_effects(conversation_id,user_message_id,result) VALUES(${fence.conversationId}::uuid,${messageId}::uuid,${JSON.stringify(updated[0])}::jsonb)`);
        await checkFence();
        return updated[0] as unknown as ChatProfileSnapshot;
      });
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if (e.code === '23505' || e.cause?.code === '23505') throw new AppError(409, 'SLUG_EXISTS', 'Já existe um negócio com esse nome. Escolha outro nome.');
      throw err;
    }
  }
  async snapshot(userId: string): Promise<ChatProfileSnapshot | null> {
    const rows = await this.db.execute(sql`SELECT u.name, t.name AS "tenantName", t.business_context AS "businessContext",
      u.xmin::text AS "userVersion", t.xmin::text AS "tenantVersion"
      FROM users u JOIN tenants t ON t.id=u.tenant_id
      WHERE u.id=${userId}::uuid AND t.id=${this.tenantId}::uuid AND u.deleted_at IS NULL AND t.deleted_at IS NULL`);
    return (rows[0] as unknown as ChatProfileSnapshot | undefined) ?? null;
  }
  async updateIfVersion(userId: string, userVersion: string, tenantVersion: string, values: ChatProfileValues): Promise<boolean> {
    try {
      return await this.db.transaction(async tx => {
        const rows = await tx.execute(sql`SELECT u.xmin::text AS "userVersion", t.xmin::text AS "tenantVersion"
          FROM users u JOIN tenants t ON t.id=u.tenant_id
          WHERE u.id=${userId}::uuid AND t.id=${this.tenantId}::uuid AND u.deleted_at IS NULL AND t.deleted_at IS NULL FOR UPDATE OF u,t`);
        const current = rows[0];
        if (!current || current.userVersion !== userVersion || current.tenantVersion !== tenantVersion) return false;
        if (values.tenantName !== undefined) {
          const slug = slugify(values.tenantName);
          if (slug) {
            const others = await tx.execute(sql`SELECT slug,name FROM tenants WHERE id<>${this.tenantId}::uuid`);
            if (others.some(row => row.slug === slug || (typeof row.name === 'string' && slugify(row.name) === slug))) {
              throw new AppError(409, 'SLUG_EXISTS', 'Já existe um negócio com esse nome. Escolha outro nome.');
            }
          }
          await tx.execute(sql`UPDATE tenants SET name=${values.tenantName},slug=coalesce(${slug || null},slug) WHERE id=${this.tenantId}::uuid`);
        }
        if (values.businessContext !== undefined) await tx.execute(sql`UPDATE tenants SET business_context=${values.businessContext || null} WHERE id=${this.tenantId}::uuid`);
        if (values.name !== undefined) await tx.execute(sql`UPDATE users SET name=${values.name} WHERE id=${userId}::uuid AND tenant_id=${this.tenantId}::uuid`);
        return true;
      });
    } catch (err) {
      const e = err as { code?: string; cause?: { code?: string } };
      if (e.code === '23505' || e.cause?.code === '23505') throw new AppError(409, 'SLUG_EXISTS', 'Já existe um negócio com esse nome. Escolha outro nome.');
      throw err;
    }
  }
}
