import { sql } from 'drizzle-orm';
import { db as defaultDb, type Database } from '@fury/db';
import { TenantScopedRepository } from './base.repository.js';
import { AppError } from '../middleware/errorHandler.js';
import type { MediaMetadata, ValidatedMedia } from '../services/chat/chat-media-validator.js';

export interface AttachmentRecord extends ValidatedMedia { id: string; storageKey: string; messageId: string | null; createdAt: Date }
export type NewAttachment = ValidatedMedia & { id: string; storageKey: string };
const projection = sql`a.id, a.filename, a.mime_type AS "mimeType", a.size_bytes AS "sizeBytes", a.storage_key AS "storageKey", a.message_id AS "messageId", a.created_at AS "createdAt", a.metadata`;
function record(row: Record<string, unknown>): AttachmentRecord {
  return { id: String(row.id), filename: String(row.filename), mimeType: String(row.mimeType), sizeBytes: Number(row.sizeBytes), storageKey: String(row.storageKey), messageId: row.messageId ? String(row.messageId) : null, createdAt: new Date(row.createdAt as string), metadata: row.metadata as MediaMetadata };
}

/** Constructor-bound user AND tenant. Every metadata access joins the owned conversation.
 * Writers serialize on the same conversation row used by Python begin_run. */
export class ChatAttachmentRepository extends TenantScopedRepository {
  constructor(tenantId: string, private readonly userId: string, database: Database = defaultDb) { super(tenantId, database); }
  private ownership() { return sql`c.tenant_id=${this.tenantId}::uuid AND c.user_id=${this.userId}::uuid AND a.tenant_id=c.tenant_id AND a.user_id=c.user_id`; }

  async assertOwned(conversationId: string, lock = false): Promise<void> {
    const rows = await this.db.execute(sql`SELECT id FROM chat_conversations WHERE id=${conversationId}::uuid AND tenant_id=${this.tenantId}::uuid AND user_id=${this.userId}::uuid ${lock ? sql`FOR UPDATE` : sql``}`);
    if (!rows.length) throw new AppError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
  }
  async withConversation<T>(conversationId: string, action: (repository: ChatAttachmentRepository) => Promise<T>): Promise<T> {
    return this.db.transaction(async tx => {
      await tx.execute(sql`SET LOCAL lock_timeout = '3s'`);
      await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
      const repository = new ChatAttachmentRepository(this.tenantId, this.userId, tx as unknown as Database);
      await repository.assertOwned(conversationId, true);
      return action(repository);
    });
  }
  async get(conversationId: string, attachmentId: string): Promise<AttachmentRecord | undefined> {
    const rows = await this.db.execute(sql`SELECT ${projection} FROM chat_attachments a JOIN chat_conversations c ON c.id=a.conversation_id WHERE c.id=${conversationId}::uuid AND a.id=${attachmentId}::uuid AND ${this.ownership()}`);
    return rows[0] ? record(rows[0]) : undefined;
  }
  async list(conversationId: string): Promise<AttachmentRecord[]> {
    const rows = await this.db.execute(sql`SELECT ${projection} FROM chat_attachments a JOIN chat_conversations c ON c.id=a.conversation_id WHERE c.id=${conversationId}::uuid AND ${this.ownership()} ORDER BY a.created_at,a.id`);
    return rows.map(record);
  }
  async findDraft(conversationId: string, digest: string, filename: string): Promise<AttachmentRecord | undefined> {
    const rows = await this.db.execute(sql`SELECT ${projection} FROM chat_attachments a JOIN chat_conversations c ON c.id=a.conversation_id WHERE c.id=${conversationId}::uuid AND ${this.ownership()} AND a.message_id IS NULL AND a.created_at>now()-interval '24 hours' AND a.metadata->>'sha256'=${digest} AND a.filename=${filename} LIMIT 1`);
    return rows[0] ? record(rows[0]) : undefined;
  }
  async insert(conversationId: string, item: NewAttachment): Promise<AttachmentRecord> {
    const rows = await this.db.execute(sql`INSERT INTO chat_attachments(id,tenant_id,user_id,conversation_id,filename,mime_type,size_bytes,storage_key,metadata)
      SELECT ${item.id}::uuid,c.tenant_id,c.user_id,c.id,${item.filename},${item.mimeType},${item.sizeBytes},${item.storageKey},${JSON.stringify(item.metadata)}::jsonb
      FROM chat_conversations c WHERE c.id=${conversationId}::uuid AND c.tenant_id=${this.tenantId}::uuid AND c.user_id=${this.userId}::uuid RETURNING id`);
    if (!rows.length) throw new AppError(404, 'CHAT_CONVERSATION_NOT_FOUND', 'Conversa não encontrada.');
    return (await this.get(conversationId, item.id))!;
  }
  async assertIdle(conversationId: string): Promise<void> {
    const rows = await this.db.execute(sql`SELECT r.id FROM chat_response_runs r JOIN chat_conversations c ON c.id=r.conversation_id WHERE c.id=${conversationId}::uuid AND c.tenant_id=${this.tenantId}::uuid AND c.user_id=${this.userId}::uuid AND r.status='running' AND r.lease_until>now()`);
    if (rows.length) throw new AppError(409, 'CHAT_RESPONSE_ACTIVE', 'Aguarde a resposta terminar antes de remover os anexos.');
  }
  async markReady(conversationId: string, attachmentId: string): Promise<void> {
    await this.db.execute(sql`UPDATE chat_attachments a SET metadata=jsonb_set(a.metadata,'{uploadState}','"ready"'::jsonb) FROM chat_conversations c WHERE c.id=a.conversation_id AND c.id=${conversationId}::uuid AND a.id=${attachmentId}::uuid AND ${this.ownership()}`);
  }
  async remove(conversationId: string, attachmentId: string): Promise<void> {
    await this.db.execute(sql`DELETE FROM chat_attachments a USING chat_conversations c WHERE c.id=a.conversation_id AND c.id=${conversationId}::uuid AND a.id=${attachmentId}::uuid AND ${this.ownership()}`);
  }
}
