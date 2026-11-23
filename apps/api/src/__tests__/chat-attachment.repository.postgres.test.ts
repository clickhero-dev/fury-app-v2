/* Funcionalidade: anexos privados vinculados a tenant + usuário + conversa.
 * Dado Postgres descartável explicitamente configurado, quando lemos/escrevemos,
 * então o SQL real preserva ownership inclusive entre usuários do mesmo tenant. */
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
vi.mock('@fury/db', () => ({ db: {} }));
vi.mock('../lib/analytics.js', () => ({ captureServerException: vi.fn() }));
import { ChatAttachmentRepository } from '../repository/chat-attachment.repository.js';
import { ChatAttachmentService } from '../services/chat/chat-attachment.service.js';
import { ChatMediaValidator } from '../services/chat/chat-media-validator.js';
import { LocalChatPrivateStorage } from '../services/storage/chat-private-storage.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
const url = process.env.CHAT_MEDIA_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const tenant = randomUUID(), user = randomUUID(), other = randomUUID(), foreignTenant = randomUUID(), conversation = randomUUID();
let sql: ReturnType<typeof postgres>;
let repository: ChatAttachmentRepository;
let wrongUser: ChatAttachmentRepository;
let wrongTenant: ChatAttachmentRepository;
const schema = `media_${randomUUID().replace(/-/g, '')}`;
const attachment = () => ({ id: randomUUID(), filename: 'fixture.png', mimeType: 'image/png', sizeBytes: 70, storageKey: randomUUID(), metadata: { sha256: 'a'.repeat(64) } });

suite('repository em Postgres realmente isolado', () => {
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (parsed.hostname !== '127.0.0.1' || !parsed.pathname.includes('isolated')) throw new Error('Test database must be an explicit disposable localhost database');
    sql = postgres(url!, { max: 4, onnotice: () => undefined, connection: { search_path: schema } });
    await sql.unsafe(`CREATE SCHEMA ${schema}`);
    await sql.unsafe('CREATE TABLE tenants (id uuid PRIMARY KEY); CREATE TABLE users (id uuid PRIMARY KEY);');
    for (const migration of ['0059_chat.sql', '0066_chat_response_runs.sql', '0070_chat_attachments.sql']) {
      await sql.unsafe(await readFile(new URL(`../../../../packages/db/migrations/${migration}`, import.meta.url), 'utf8'));
    }
    await sql`INSERT INTO tenants VALUES (${tenant}), (${foreignTenant})`;
    await sql`INSERT INTO users VALUES (${user}), (${other})`;
    await sql`INSERT INTO chat_conversations(id,tenant_id,user_id,title) VALUES (${conversation},${tenant},${user},'synthetic')`;
    const database = drizzle(sql) as never;
    repository = new ChatAttachmentRepository(tenant, user, database);
    wrongUser = new ChatAttachmentRepository(tenant, other, database);
    wrongTenant = new ChatAttachmentRepository(foreignTenant, user, database);
  });
  afterAll(async () => { if (sql) { await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`); await sql.end(); } });

  it('owner insere e lê; outro usuário/tenant não obtém metadados', async () => {
    const item = attachment();
    await repository.withConversation(conversation, repo => repo.insert(conversation, item));
    expect(await repository.get(conversation, item.id)).toMatchObject({ id: item.id, filename: 'fixture.png' });
    expect(await wrongUser.get(conversation, item.id)).toBeUndefined();
    expect(await wrongTenant.get(conversation, item.id)).toBeUndefined();
    await expect(wrongUser.withConversation(conversation, repo => repo.insert(conversation, attachment()))).rejects.toMatchObject({ statusCode: 404 });
    await expect(wrongTenant.withConversation(conversation, repo => repo.remove(conversation, item.id))).rejects.toMatchObject({ statusCode: 404 });
    expect(await repository.get(conversation, item.id)).toBeDefined();
  });
  it('duplicação concorrente consulta o mesmo rascunho sob lock da conversa', async () => {
    const results = await Promise.all([1, 2].map(() => repository.withConversation(conversation, async repo => {
      const previous = await repo.findDraft(conversation, 'a'.repeat(64), 'fixture.png');
      return previous ?? repo.insert(conversation, attachment());
    })));
    expect(results[0].id).toBe(results[1].id);
  });
  it('remoção concorrente é idempotente e joins impedem remoção estrangeira', async () => {
    const item = { ...attachment(), filename: 'delete.png' };
    await repository.withConversation(conversation, repo => repo.insert(conversation, item));
    await wrongUser.remove(conversation, item.id);
    expect(await repository.get(conversation, item.id)).toBeDefined();
    await Promise.all([1, 2].map(() => repository.withConversation(conversation, repo => repo.remove(conversation, item.id))));
    expect(await repository.get(conversation, item.id)).toBeUndefined();
  });
  it('upload privado real deduplica; outro usuário não baixa; delete remove bytes e metadados', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'chat-upload-test-'));
    const storage = new LocalChatPrivateStorage(directory);
    const database = drizzle(sql) as never;
    const service = new ChatAttachmentService((t, u) => new ChatAttachmentRepository(t, u, database), storage, new ChatMediaValidator(), { read: vi.fn() });
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } }).png().toBuffer();
    const files = [{ buffer, originalname: 'upload.png', mimetype: 'image/png' }];
    try {
      const [first, second] = await Promise.all([service.upload(tenant, user, conversation, files), service.upload(tenant, user, conversation, files)]);
      expect(first).toEqual(second);
      const id = first.attachments[0].id;
      expect(first.attachments[0]).not.toHaveProperty('storageKey');
      expect(first.attachments[0]).not.toHaveProperty('url');
      expect((await service.download(tenant, user, conversation, id)).bytes).toEqual(buffer);
      await expect(service.download(tenant, other, conversation, id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.upload(tenant, other, conversation, files)).rejects.toMatchObject({ statusCode: 404 });
      const record = await repository.get(conversation, id);
      await Promise.all([service.remove(tenant, user, conversation, id), service.remove(tenant, user, conversation, id)]);
      expect(await repository.get(conversation, id)).toBeUndefined();
      await expect(storage.get(record!.storageKey)).rejects.toMatchObject({ statusCode: 404 });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it('arquivo associado não pode ser removido sozinho; cleanup falho preserva metadata para retry', async () => {
    const database = drizzle(sql) as never; const item = { ...attachment(), filename: 'associated.png' };
    await repository.withConversation(conversation, repo => repo.insert(conversation, item));
    const message = randomUUID();
    await sql`INSERT INTO chat_messages(id,conversation_id,role,content) VALUES (${message},${conversation},'user','')`;
    await sql`UPDATE chat_attachments SET message_id=${message} WHERE id=${item.id}`;
    const storage = { put: vi.fn(), get: vi.fn(), delete: vi.fn().mockRejectedValue(new Error('sensitive endpoint')) };
    const service = new ChatAttachmentService((t, u) => new ChatAttachmentRepository(t, u, database), storage, new ChatMediaValidator(), { read: vi.fn() });
    await expect(service.remove(tenant, user, conversation, item.id)).rejects.toMatchObject({ statusCode: 409 });
    await expect(service.cleanup(tenant, user, conversation)).rejects.toMatchObject({ statusCode: 409, code: 'CHAT_ATTACHMENT_BOUND' });
    expect(storage.delete).not.toHaveBeenCalled();
    await expect(service.cleanupDelegated(tenant, user, conversation)).rejects.toMatchObject({ statusCode: 503 });
    expect(await repository.get(conversation, item.id)).toBeDefined();
    storage.delete.mockResolvedValue(undefined);
    await service.cleanupDelegated(tenant, user, conversation);
    // Node confirms object cleanup only. Python owns all metadata deletion.
    expect(await repository.get(conversation, item.id)).toMatchObject({ messageId: message });
    await repository.withConversation(conversation, async repo => {
      for (const attachment of await repo.list(conversation)) await repo.remove(conversation, attachment.id);
    });
    await service.cleanup(tenant, user, conversation);
  });

  it('resposta ativa bloqueia cleanup e erro de leitura não fabrica conteúdo', async () => {
    const database = drizzle(sql) as never; const item = { ...attachment(), filename: 'read.png' };
    await repository.withConversation(conversation, repo => repo.insert(conversation, item));
    const message = randomUUID();
    await sql`INSERT INTO chat_messages(id,conversation_id,role,content) VALUES (${message},${conversation},'user','')`;
    const run = randomUUID();
    await sql`INSERT INTO chat_response_runs(id,conversation_id,user_message_id,lease_id,status,lease_until) VALUES (${run},${conversation},${message},${randomUUID()},'running',now()+interval '1 minute')`;
    const service = new ChatAttachmentService((t, u) => new ChatAttachmentRepository(t, u, database), { put: vi.fn(), get: vi.fn().mockRejectedValue(new Error('private')), delete: vi.fn() }, new ChatMediaValidator(), { read: vi.fn() });
    await expect(service.cleanup(tenant, user, conversation)).rejects.toMatchObject({ statusCode: 409 });
    expect(await service.read(tenant, user, conversation, [item.id], '')).toEqual({ readings: [], failures: [{ attachmentId: item.id, message: 'Não foi possível ler este anexo. Tente novamente.' }] });
    await expect(service.read(tenant, other, conversation, [item.id], '')).rejects.toMatchObject({ statusCode: 404 });
    await sql`UPDATE chat_response_runs SET status='completed' WHERE id=${run}`;
  });

  it('duplicação no mesmo lote devolve um ID, sem reservar duas cópias', async () => {
    const database = drizzle(sql) as never;
    const directory = await mkdtemp(path.join(tmpdir(), 'chat-dedup-test-'));
    const storage = new LocalChatPrivateStorage(directory);
    const service = new ChatAttachmentService((t, u) => new ChatAttachmentRepository(t, u, database), storage, new ChatMediaValidator(), { read: vi.fn() });
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'green' } }).png().toBuffer();
    const file = { buffer, originalname: 'duplicate.png' };
    try {
      const result = await service.upload(tenant, user, conversation, [file, file]);
      expect(result.attachments).toHaveLength(1);
      await service.remove(tenant, user, conversation, result.attachments[0].id);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('falha após put conserva reserva privada; reconciliação remove órfão sem expor bytes', async () => {
    const database = drizzle(sql) as never;
    const directory = await mkdtemp(path.join(tmpdir(), 'chat-pending-test-'));
    const local = new LocalChatPrivateStorage(directory);
    const storage = { get: local.get.bind(local), put: vi.fn(async (key: string, bytes: Buffer, mime: string) => { await local.put(key, bytes, mime); throw new Error('private upstream'); }), delete: vi.fn().mockRejectedValue(new Error('offline')) };
    const service = new ChatAttachmentService((t, u) => new ChatAttachmentRepository(t, u, database), storage, new ChatMediaValidator(), { read: vi.fn() });
    const buffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer();
    try {
      await expect(service.upload(tenant, user, conversation, [{ buffer, originalname: 'pending.png' }])).rejects.toMatchObject({ statusCode: 503 });
      const pending = (await repository.list(conversation)).find(item => item.filename === 'pending.png')!;
      expect(pending.metadata.uploadState).toBe('pending');
      expect(await local.get(pending.storageKey)).toEqual(buffer);
      await expect(service.download(tenant, user, conversation, pending.id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(service.cleanup(tenant, user, conversation)).rejects.toMatchObject({ statusCode: 409 });
      await sql`UPDATE chat_attachments SET created_at=now()-interval '25 hours' WHERE id=${pending.id}`;
      storage.delete.mockImplementation(local.delete.bind(local));
      await service.purgeExpired(tenant, user, conversation);
      expect(await repository.get(conversation, pending.id)).toBeUndefined();
      await expect(local.get(pending.storageKey)).rejects.toMatchObject({ statusCode: 404 });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it('migration de anexos está registrada sem remover WIP anterior', async () => {
    const migration = await readFile(new URL('../../../../packages/db/src/migrate.ts', import.meta.url), 'utf8');
    expect(migration).toContain("{ tag: '0070_chat_attachments' }");
    expect(migration).toContain("{ tag: '0069_chat_title_source' }");
  });
});
