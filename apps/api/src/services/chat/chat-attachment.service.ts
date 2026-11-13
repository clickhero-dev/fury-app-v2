import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../../middleware/errorHandler.js';
import type { ChatAttachmentRepository, AttachmentRecord, NewAttachment } from '../../repository/chat-attachment.repository.js';
import { type ChatPrivateStorage, storageUnavailable } from '../storage/chat-private-storage.js';
import { type ChatMediaValidator, type MediaInput, MiB, mediaLimit } from './chat-media-validator.js';
import type { ChatAttachmentReader } from './chat-attachment-reader.js';

export interface PublicAttachment { id: string; filename: string; mimeType: string; sizeBytes: number; pageCount?: number; durationSeconds?: number }
export function publicAttachment(item: AttachmentRecord): PublicAttachment {
  return { id: item.id, filename: item.filename, mimeType: item.mimeType, sizeBytes: item.sizeBytes,
    ...(item.metadata.pageCount ? { pageCount: item.metadata.pageCount } : {}),
    ...(item.metadata.durationSeconds ? { durationSeconds: item.metadata.durationSeconds } : {}) };
}
const notFound = () => new AppError(404, 'CHAT_ATTACHMENT_NOT_FOUND', 'Anexo não encontrado.');
const busy = () => new AppError(409, 'CHAT_UPLOAD_PENDING', 'O envio do anexo ainda está em andamento. Tente novamente.');
const expired = (item: AttachmentRecord) => !item.messageId && Date.now() - item.createdAt.getTime() >= 24 * 60 * 60 * 1000;
const uploading = (item: AttachmentRecord) => item.metadata.uploadState === 'pending' && Date.now() - item.createdAt.getTime() < 90_000;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

type UploadResult = { attachments: PublicAttachment[] };
export class ChatAttachmentService {
  private readonly inflight = new Map<string, Promise<UploadResult>>();
  constructor(
    private readonly repository: (tenantId: string, userId: string) => ChatAttachmentRepository,
    private readonly storage: ChatPrivateStorage,
    private readonly validator: ChatMediaValidator,
    private readonly reader: Pick<ChatAttachmentReader, 'read'>,
  ) {}
  async assertOwned(tenantId: string, userId: string, conversationId: string): Promise<void> { await this.repository(tenantId, userId).assertOwned(conversationId); }

  async upload(tenantId: string, userId: string, conversationId: string, files: MediaInput[]): Promise<UploadResult> {
    if (!files.length || files.length > 3) throw new AppError(400, 'CHAT_FILES_REQUIRED', 'Selecione de um a três arquivos.');
    if (files.reduce((sum, file) => sum + file.buffer.length, 0) > 60 * MiB) throw mediaLimit();
    await this.assertOwned(tenantId, userId, conversationId);
    const key = JSON.stringify([tenantId, userId, conversationId, files.map(file => [file.originalname, hash(file.buffer)])]);
    const previous = this.inflight.get(key); if (previous) return previous;
    const work = this.performUpload(tenantId, userId, conversationId, files);
    this.inflight.set(key, work);
    try { return await work; } finally { this.inflight.delete(key); }
  }

  private async performUpload(tenantId: string, userId: string, conversationId: string, files: MediaInput[]): Promise<UploadResult> {
    const validated: Array<{ file: MediaInput; item: NewAttachment }> = [];
    for (const file of files) {
      const value = await this.validator.attachment(file);
      validated.push({ file, item: { ...value, id: randomUUID(), storageKey: randomUUID(), metadata: { ...value.metadata, sha256: hash(file.buffer), uploadState: 'pending' } } });
    }
    const repository = this.repository(tenantId, userId);
    const reserved = await repository.withConversation(conversationId, async repo => {
      await this.purgeExpiredLocked(repo, conversationId);
      const current = (await repo.list(conversationId)).filter(item => !item.messageId);
      const output: AttachmentRecord[] = []; const created: typeof validated = [];
      for (const value of validated) {
        const duplicate = current.find(item => item.metadata.sha256 === value.item.metadata.sha256 && item.filename === value.item.filename);
        if (duplicate) {
          if (duplicate.metadata.uploadState === 'pending' && !created.some(value => value.item.id === duplicate.id)) throw busy();
          output.push(duplicate); continue;
        }
        if (current.length >= 3 || current.reduce((sum, item) => sum + item.sizeBytes, 0) + value.item.sizeBytes > 60 * MiB) throw mediaLimit();
        const inserted = await repo.insert(conversationId, value.item);
        current.push(inserted); output.push(inserted); created.push(value);
      }
      return { output, created };
    });
    // Reservation commits BEFORE object writes: crash/failure leaves a tenant-owned, reconcilable pending row.
    try {
      for (const { file, item } of reserved.created) await this.storage.put(item.storageKey, file.buffer, item.mimeType);
      await repository.withConversation(conversationId, async repo => {
        for (const { item } of reserved.created) {
          if (!await repo.get(conversationId, item.id)) throw notFound();
          await repo.markReady(conversationId, item.id);
        }
      });
    } catch {
      // Keep pending metadata if deletion fails, so retries/explicit orphan cleanup can find the object.
      try {
        await repository.withConversation(conversationId, async repo => {
          for (const { item } of reserved.created) { await this.storage.delete(item.storageKey); await repo.remove(conversationId, item.id); }
        });
      } catch { /* Metadata remains pending; never return upload success. */ }
      throw storageUnavailable();
    }
    return { attachments: [...new Map(reserved.output.map(item => [item.id, publicAttachment(item)])).values()] };
  }

  private async bytes(item: AttachmentRecord): Promise<Buffer> {
    const bytes = await this.storage.get(item.storageKey);
    if (bytes.length !== item.sizeBytes || (item.metadata.sha256 && hash(bytes) !== item.metadata.sha256)) throw storageUnavailable();
    return bytes;
  }
  async download(tenantId: string, userId: string, conversationId: string, attachmentId: string) {
    const item = await this.repository(tenantId, userId).get(conversationId, attachmentId);
    if (!item || expired(item) || item.metadata.uploadState === 'pending') throw notFound();
    return { attachment: publicAttachment(item), bytes: await this.bytes(item) };
  }
  async remove(tenantId: string, userId: string, conversationId: string, attachmentId: string): Promise<void> {
    await this.repository(tenantId, userId).withConversation(conversationId, async repo => {
      const item = await repo.get(conversationId, attachmentId);
      if (!item) return; // Idempotent only after conversation ownership was checked.
      if (item.messageId) throw new AppError(409, 'CHAT_ATTACHMENT_BOUND', 'Anexo já associado a uma mensagem.');
      if (uploading(item)) throw busy();
      await this.storage.delete(item.storageKey);
      await repo.remove(conversationId, attachmentId);
    });
  }
  async cleanup(tenantId: string, userId: string, conversationId: string): Promise<void> {
    await this.repository(tenantId, userId).withConversation(conversationId, async repo => {
      await repo.assertIdle(conversationId);
      const items = await repo.list(conversationId);
      // Human bulk cleanup is draft-only, just like the individual DELETE.
      // Associated evidence can only be removed with the entire conversation by Python.
      if (items.some(item => item.messageId)) throw new AppError(409, 'CHAT_ATTACHMENT_BOUND', 'Anexo já associado a uma mensagem.');
      if (items.some(uploading)) throw busy();
      try { for (const item of items) await this.storage.delete(item.storageKey); }
      catch { throw storageUnavailable(); }
      for (const item of items) await repo.remove(conversationId, item.id);
    });
  }
  /** Python owns the conversation row lock and final metadata deletion.
   * Only call after verified chatbot delegation; ordinary human cleanup must stay locked.
   * Reads are ownership-scoped but must not acquire a second lock or mutate metadata.
   */
  async cleanupDelegated(tenantId: string, userId: string, conversationId: string): Promise<void> {
    const repo = this.repository(tenantId, userId);
    await repo.assertOwned(conversationId);
    await repo.assertIdle(conversationId);
    const items = await repo.list(conversationId);
    if (items.some(uploading)) throw busy();
    try { for (const item of items) await this.storage.delete(item.storageKey); }
    catch { throw storageUnavailable(); }
  }
  /** Explicit/request-bound reconciliation; no detached timer or background task. */
  async purgeExpired(tenantId: string, userId: string, conversationId: string): Promise<void> {
    await this.repository(tenantId, userId).withConversation(conversationId, repo => this.purgeExpiredLocked(repo, conversationId));
  }
  private async purgeExpiredLocked(repo: ChatAttachmentRepository, conversationId: string): Promise<void> {
    for (const item of await repo.list(conversationId)) {
      if (expired(item) || (!item.messageId && item.metadata.uploadState === 'pending' && !uploading(item))) {
        await this.storage.delete(item.storageKey); await repo.remove(conversationId, item.id);
      }
    }
  }
  async read(tenantId: string, userId: string, conversationId: string, attachmentIds: string[], question: string, signal?: AbortSignal) {
    const repo = this.repository(tenantId, userId);
    await repo.assertOwned(conversationId);
    const items = await Promise.all(attachmentIds.map(id => repo.get(conversationId, id)));
    if (items.some(item => !item || expired(item) || item.metadata.uploadState === 'pending')) throw notFound();
    if (items.reduce((sum, item) => sum + item!.sizeBytes, 0) > 60 * MiB) throw mediaLimit();
    const readings: Array<{ attachmentId: string; filename: string; content: string }> = [];
    const failures: Array<{ attachmentId: string; message: string }> = [];
    // Bounded to three; sequential reads keep native media copies/provider costs bounded.
    for (const item of items as AttachmentRecord[]) {
      try {
        if (signal?.aborted) throw new Error('aborted');
        const content = await this.reader.read(tenantId, item, await this.bytes(item), question, signal);
        readings.push({ attachmentId: item.id, filename: item.filename, content });
      } catch { failures.push({ attachmentId: item.id, message: 'Não foi possível ler este anexo. Tente novamente.' }); }
    }
    return { readings, failures };
  }
}
