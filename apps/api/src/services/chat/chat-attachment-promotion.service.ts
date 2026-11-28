import { AppError } from '../../middleware/errorHandler.js';
import type { ChatAttachmentService } from './chat-attachment.service.js';
import type { BrandKitService } from '../brand-kit/brand-kit.service.js';
import type { BrandKitPhotoService } from '../brand-kit/brand-kit-photo.service.js';
import type { BrandKitPhotoKind } from '../../repository/brand-kit-photo.repository.js';

export class ChatAttachmentPromotionService {
  constructor(
    private readonly attachments: Pick<ChatAttachmentService, 'download'>,
    private readonly brand: Pick<BrandKitService, 'importChatLogo'>,
    private readonly photos: Pick<BrandKitPhotoService, 'upload'>,
  ) {}

  async logo(tenantId: string, userId: string, conversationId: string, attachmentId: string) {
    const { bytes, attachment } = await this.attachments.download(tenantId, userId, conversationId, attachmentId);
    const result = await this.brand.importChatLogo(tenantId, { buffer: bytes, mimetype: attachment.mimeType });
    return { kind: 'logo' as const, ...result };
  }

  async library(tenantId: string, userId: string, conversationId: string, attachmentId: string, kind: BrandKitPhotoKind) {
    const { bytes, attachment } = await this.attachments.download(tenantId, userId, conversationId, attachmentId);
    if (!['image/png', 'image/jpeg'].includes(attachment.mimeType)) throw new AppError(400, 'PHOTO_INVALID_IMAGE', 'Envie uma foto em PNG ou JPG.');
    const photos = await this.photos.upload(tenantId, kind, [{ buffer: bytes, mimetype: attachment.mimeType }]);
    return { kind: 'library' as const, photos };
  }
}
