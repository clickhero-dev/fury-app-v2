import { describe, expect, it, vi } from 'vitest';
import { ChatAttachmentPromotionService } from '../services/chat/chat-attachment-promotion.service.js';

const attachment = { id: 'a', filename: 'logo.png', mimeType: 'image/png', sizeBytes: 4 };

describe('ChatAttachmentPromotionService', () => {
  it('promove uma logo pertencente à conversa sem expor sua URL privada', async () => {
    const download = vi.fn(async () => ({ bytes: Buffer.from('png'), attachment }));
    const importChatLogo = vi.fn(async () => ({ url: 'https://cdn/logo.png', colors: { primaryColor: '#112233', secondaryColor: '#445566' } }));
    const service = new ChatAttachmentPromotionService({ download } as any, { importChatLogo } as any, {} as any);
    await expect(service.logo('tenant', 'user', 'conversation', 'attachment')).resolves.toEqual(expect.objectContaining({ kind: 'logo', colors: expect.any(Object) }));
    expect(download).toHaveBeenCalledWith('tenant', 'user', 'conversation', 'attachment');
    expect(importChatLogo).toHaveBeenCalledWith('tenant', { buffer: expect.any(Buffer), mimetype: 'image/png' });
  });

  it('classifica uma foto da empresa na biblioteca correta', async () => {
    const upload = vi.fn(async () => [{ id: 'photo', kind: 'empresa' }]);
    const service = new ChatAttachmentPromotionService({ download: async () => ({ bytes: Buffer.from('png'), attachment }) } as any, {} as any, { upload } as any);
    await service.library('tenant', 'user', 'conversation', 'attachment', 'empresa');
    expect(upload).toHaveBeenCalledWith('tenant', 'empresa', [{ buffer: expect.any(Buffer), mimetype: 'image/png' }]);
  });
});
