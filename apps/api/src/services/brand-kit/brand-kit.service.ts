import { randomUUID } from 'crypto';
import { CampaignRepository } from '../../repository/campaign.repository.js';
import { uploadAsset, deleteAsset } from '../storage/storage.service.js';

type BrandKitRow = { [key: string]: any };
type BrandKitRepo = Pick<
  CampaignRepository,
  'findBrandKit' | 'upsertTenantBrandKit' | 'updateTenantBrandKit'
>;
type Storage = { uploadAsset: typeof uploadAsset; deleteAsset: typeof deleteAsset };

export const MAX_PHOTOS = 20;

function toResponse(brandKit: BrandKitRow) {
  return {
    id: brandKit.id,
    tenant_id: brandKit.tenantId,
    logo_url: brandKit.logoUrl,
    primary_color: brandKit.primaryColor,
    secondary_color: brandKit.secondaryColor,
    voice_tone: brandKit.voiceTone,
    photo_urls: (brandKit.photoUrls as string[] | null) ?? [],
    whatsapp_number: brandKit.whatsappNumber ?? null,
    created_at: brandKit.createdAt,
    updated_at: brandKit.updatedAt,
  };
}

export interface BrandKitValues {
  primaryColor?: string;
  secondaryColor?: string;
  voiceTone?: 'professional' | 'casual' | 'urgent' | 'premium';
  logoUrl?: string | null;
  photoUrls?: string[];
  whatsappNumber?: string | null;
}

interface UploadFile {
  buffer: Buffer;
  mimetype: string;
}

export class BrandKitService {
  constructor(
    private repoFactory: (tenantId: string) => BrandKitRepo = (t) => new CampaignRepository(t),
    private storage: Storage = { uploadAsset, deleteAsset },
  ) {}

  private repo(tenantId: string): BrandKitRepo {
    return this.repoFactory(tenantId);
  }

  async getBrandKit(tenantId: string): Promise<ReturnType<typeof toResponse> | null> {
    const brandKit = await this.repo(tenantId).findBrandKit();
    return brandKit ? toResponse(brandKit) : null;
  }

  async upsertBrandKit(tenantId: string, values: BrandKitValues): Promise<ReturnType<typeof toResponse>> {
    const brandKit = await this.repo(tenantId).upsertTenantBrandKit(values as any);
    return toResponse(brandKit);
  }

  /** Faz upload do logo e retorna a URL pública. */
  async uploadLogo(tenantId: string, file: UploadFile): Promise<{ url: string }> {
    const extension = file.mimetype === 'image/svg+xml' ? 'svg' : 'png';
    const fileName = `brand-kit/${tenantId}/logo/${randomUUID()}.${extension}`;
    const url = await this.storage.uploadAsset(file.buffer, fileName, file.mimetype);
    return { url };
  }

  /**
   * Faz upload das fotos respeitando MAX_PHOTOS.
   * Retorna null (em vez de lançar) quando excede o limite — o controller devolve 400.
   */
  async uploadPhotos(
    tenantId: string,
    files: UploadFile[],
  ): Promise<{ urls: string[] } | { error: string; existingPhotos: number }> {
    const existing = await this.repo(tenantId).findBrandKit();
    const existingPhotos = (existing?.photoUrls as string[] | null) ?? [];

    if (existingPhotos.length + files.length > MAX_PHOTOS) {
      return { error: `Limite de ${MAX_PHOTOS} fotos excedido. Você já tem ${existingPhotos.length} foto(s).`, existingPhotos: existingPhotos.length };
    }

    const extensionByMime: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };
    const uploadedUrls: string[] = [];
    for (const file of files) {
      const extension = extensionByMime[file.mimetype] ?? 'jpg';
      const fileName = `brand-kit/${tenantId}/photos/${randomUUID()}.${extension}`;
      const url = await this.storage.uploadAsset(file.buffer, fileName, file.mimetype);
      uploadedUrls.push(url);
    }

    const photoUrls = [...existingPhotos, ...uploadedUrls];
    await this.repo(tenantId).upsertTenantBrandKit({ photoUrls });
    return { urls: uploadedUrls };
  }

  /** Remove uma foto (do brandKit e do storage) e retorna a lista restante. */
  async deletePhoto(tenantId: string, url: string): Promise<string[]> {
    const existing = await this.repo(tenantId).findBrandKit();
    const existingPhotos = (existing?.photoUrls as string[] | null) ?? [];
    const photoUrls = existingPhotos.filter((u) => u !== url);

    if (photoUrls.length !== existingPhotos.length) {
      await this.repo(tenantId).updateTenantBrandKit({ photoUrls });
    }
    await this.storage.deleteAsset(url);
    return photoUrls;
  }
}