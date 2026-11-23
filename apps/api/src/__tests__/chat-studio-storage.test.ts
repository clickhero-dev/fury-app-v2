import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { ChatStudioStorage } from '../services/storage/chat-studio-storage.js';
import { ChatAttachmentService } from '../services/chat/chat-attachment.service.js';

describe('armazenamento de imagens do chat no Estúdio', () => {
  it('salva, lê e remove bytes sintéticos no bucket do Estúdio', async () => {
    const bytes = Buffer.from('imagem sintética');
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetObjectCommand) return { Body: { async *[Symbol.asyncIterator]() { yield bytes; } } };
      return {};
    });
    const legacy = { put: vi.fn(), get: vi.fn(), delete: vi.fn() };
    const storage = new ChatStudioStorage({ send } as never, legacy);
    const key = storage.newKey('image/jpeg');
    await storage.put(key, bytes, 'image/jpeg');
    expect(send.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    expect((send.mock.calls[0][0] as PutObjectCommand).input).toMatchObject({ Bucket: 'fury-studio-assets', Key: key, Body: bytes, ContentType: 'image/jpeg' });
    expect(await storage.get(key)).toEqual(bytes);
    await storage.delete(key);
    expect(send.mock.calls[2][0]).toBeInstanceOf(DeleteObjectCommand);
    expect(legacy.get).not.toHaveBeenCalled();
  });

  it('mantém anexos anteriores e arquivos não imagem no armazenamento privado', async () => {
    const legacy = { put: vi.fn(), get: vi.fn().mockResolvedValue(Buffer.from('antigo')), delete: vi.fn() };
    const send = vi.fn();
    const storage = new ChatStudioStorage({ send } as never, legacy);
    const oldKey = randomUUID();
    expect(storage.newKey('application/pdf')).not.toContain('/');
    expect(await storage.get(oldKey)).toEqual(Buffer.from('antigo'));
    await storage.delete(oldKey);
    expect(legacy.delete).toHaveBeenCalledWith(oldKey);
    expect(send).not.toHaveBeenCalled();
  });

  it('não aceita chaves inválidas nem expõe falhas do provedor', async () => {
    const storage = new ChatStudioStorage({ send: vi.fn().mockRejectedValue(new Error('segredo')) } as never,
      { put: vi.fn(), get: vi.fn(), delete: vi.fn() });
    await expect(storage.put('studio/../secret', Buffer.from('x'), 'image/jpeg')).rejects.toMatchObject({ statusCode: 503 });
    await expect(storage.put(storage.newKey('image/jpeg'), Buffer.from('x'), 'image/jpeg')).rejects.toMatchObject({ statusCode: 503, message: 'Armazenamento privado indisponível.' });
  });

  it('usa a chave do Estúdio no upload do serviço', async () => {
    const send = vi.fn().mockResolvedValue({});
    const storage = new ChatStudioStorage({ send } as never, { put: vi.fn(), get: vi.fn(), delete: vi.fn() });
    let saved: any;
    const repo = {
      assertOwned: vi.fn(), list: vi.fn().mockResolvedValue([]),
      insert: vi.fn(async (_conversation, item) => { saved = { ...item, messageId: null, createdAt: new Date() }; return saved; }),
      get: vi.fn(async () => saved), markReady: vi.fn(),
      withConversation: vi.fn(async (_conversation, callback) => callback(repo)),
    };
    const validator = { attachment: vi.fn().mockResolvedValue({ filename: 'foto.jpeg', mimeType: 'image/jpeg', sizeBytes: 4, metadata: {} }) };
    const service = new ChatAttachmentService(() => repo as never, storage, validator as never, { read: vi.fn() });
    const result = await service.upload(randomUUID(), randomUUID(), randomUUID(), [{ originalname: 'foto.jpeg', mimetype: 'image/jpeg', buffer: Buffer.from('seed') }]);
    expect(saved.storageKey).toMatch(/^chat-images\/[0-9a-f-]{36}$/);
    expect((send.mock.calls[0][0] as PutObjectCommand).input.Key).toBe(saved.storageKey);
    expect(result.attachments[0]).not.toHaveProperty('storageKey');
  });

  it('mapeia objeto ausente e falha de leitura sem vazar erros', async () => {
    const send = vi.fn().mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } }).mockRejectedValueOnce(new Error('secret'));
    const storage = new ChatStudioStorage({ send } as never, { put: vi.fn(), get: vi.fn(), delete: vi.fn() });
    const key = storage.newKey('image/png');
    await expect(storage.get(key)).rejects.toMatchObject({ statusCode: 404 });
    await expect(storage.get(key)).rejects.toMatchObject({ statusCode: 503, message: 'Armazenamento privado indisponível.' });
  });
});
