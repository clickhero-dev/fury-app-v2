import { randomUUID } from 'crypto';
import { AppError } from '../../middleware/errorHandler.js';
import {
  BrandKitPhotoRepository,
  type BrandKitPhoto,
  type BrandKitPhotoKind,
} from '../../repository/brand-kit-photo.repository.js';
import { uploadAsset, deleteAsset } from '../storage/storage.service.js';

type PhotoRepo = Pick<
  BrandKitPhotoRepository,
  'list' | 'create' | 'softDeleteById' | 'findBrandKit' | 'upsertTenantBrandKit'
>;
type Storage = { uploadAsset: typeof uploadAsset; deleteAsset: typeof deleteAsset };

interface UploadFile {
  buffer: Buffer;
  mimetype: string;
}

export const BRAND_KIT_PHOTO_KINDS = ['modelo', 'produto', 'equipe'] as const;

function toResponse(photo: BrandKitPhoto) {
  return { id: photo.id, kind: photo.kind, url: photo.url, created_at: photo.createdAt };
}

// confere a assinatura real do arquivo, não só o mimetype declarado
function detectImageType(buffer: Buffer): 'png' | 'jpg' | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  return null;
}

export class BrandKitPhotoService {
  constructor(
    private repoFactory: (tenantId: string) => PhotoRepo = (t) => new BrandKitPhotoRepository(t),
    private storage: Storage = { uploadAsset, deleteAsset },
  ) {}

  async list(tenantId: string, kind?: BrandKitPhotoKind) {
    const rows = await this.repoFactory(tenantId).list(kind);
    return rows.map(toResponse);
  }

  async upload(tenantId: string, kind: BrandKitPhotoKind, files: UploadFile[]) {
    if (files.length === 0) throw new AppError(400, 'NO_FILES', 'Nenhum arquivo enviado.');
    const types = files.map((f) => detectImageType(f.buffer));
    if (types.some((t) => t === null)) {
      throw new AppError(400, 'INVALID_IMAGE', 'Arquivo inválido. Envie PNG ou JPG.');
    }

    const repo = this.repoFactory(tenantId);
    // a foto é vinculada ao brand kit; cria um vazio se o tenant ainda não tem
    const brandKit = (await repo.findBrandKit()) ?? (await repo.upsertTenantBrandKit({}));

    const created: BrandKitPhoto[] = [];
    let pendingUrl: string | null = null;
    try {
      for (const [i, file] of files.entries()) {
        const ext = types[i] as 'png' | 'jpg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        pendingUrl = await this.storage.uploadAsset(file.buffer, `brand-kit/${tenantId}/library/${kind}/${randomUUID()}.${ext}`, mime);
        created.push(await repo.create({ brandKitId: brandKit.id, kind, url: pendingUrl }));
        pendingUrl = null;
      }
    } catch (err) {
      // falha no meio: o lote some da biblioteca (soft delete); arquivo sem linha é apagado
      await Promise.allSettled(created.map((p) => repo.softDeleteById(p.id)));
      if (pendingUrl) await this.storage.deleteAsset(pendingUrl).catch(() => {});
      throw err;
    }
    return created.map(toResponse);
  }

  /** Soft delete: some da biblioteca e da geração; o arquivo fica no storage (dá para restaurar). */
  async remove(tenantId: string, id: string): Promise<void> {
    const row = await this.repoFactory(tenantId).softDeleteById(id);
    if (!row) throw new AppError(404, 'PHOTO_NOT_FOUND', 'Imagem não encontrada.');
  }
}
