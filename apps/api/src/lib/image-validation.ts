import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { uploadAsset, deleteAsset } from '../services/storage/storage.service.js';
import type { AgentContext } from '../agents/types.js';

export type PostType = 'feed' | 'carousel' | 'image' | 'stories';

interface ExpectedDimensions {
  width: number;
  height: number;
  aspectRatio: string;
}

const POST_TYPE_DIMENSIONS: Record<PostType, ExpectedDimensions> = {
  feed: { width: 1080, height: 1080, aspectRatio: '1:1' },
  carousel: { width: 1080, height: 1080, aspectRatio: '1:1' },
  image: { width: 1080, height: 1080, aspectRatio: '1:1' },
  stories: { width: 1080, height: 1920, aspectRatio: '9:16' },
};

const MIN_SIZE_MB = 0.5;
const MAX_SIZE_MB = 1000;
const MIN_SIZE_BYTES = MIN_SIZE_MB * 1024 * 1024;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const DIMENSION_TOLERANCE = 0.1;

export function getExpectedDimensions(postType: PostType): ExpectedDimensions {
  return POST_TYPE_DIMENSIONS[postType] ?? POST_TYPE_DIMENSIONS.feed;
}

export function getAspectRatio(postType: PostType): string {
  return getExpectedDimensions(postType).aspectRatio;
}

export function getResolution(postType: PostType): string {
  const dim = getExpectedDimensions(postType);
  return `${dim.width}x${dim.height}`;
}

// FLUX.2 Klein 4B compatible resolution mapping
// Accepts: "512" | "1K" | "2K" | "4K"
// 1K = ~1024px, 2K = ~2048px, 4K = ~4096px
export function getFluxResolution(postType: PostType): string {
  // Map post types to FLUX resolution tiers
  // 1080px → 1K (1024), 1920px → 2K (2048)
  const dim = getExpectedDimensions(postType);
  const maxDim = Math.max(dim.width, dim.height);
  if (maxDim <= 1024) return '1K';
  if (maxDim <= 2048) return '2K';
  return '4K';
}

// FLUX.2 Klein 4B compatible aspect ratios
// Accepts: "1:1" | "16:9" | "9:16" | "4:3" | "3:4"
export function getFluxAspectRatio(postType: PostType): string {
  const ar = getAspectRatio(postType);
  // FLUX accepts standard ratios, our aspect ratios are already compatible
  return ar;
}

function dimensionsMatch(
  actualWidth: number,
  actualHeight: number,
  expectedWidth: number,
  expectedHeight: number,
  tolerance = DIMENSION_TOLERANCE
): boolean {
  const widthOk = Math.abs(actualWidth - expectedWidth) / expectedWidth <= tolerance;
  const heightOk = Math.abs(actualHeight - expectedHeight) / expectedHeight <= tolerance;
  return widthOk && heightOk;
}

export async function validateAndUploadImage(
  base64DataUrl: string,
  postType: PostType,
  dayIndex: number,
  tenantId: string
): Promise<{
  imageUrl: string;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp';
  sizeBytes: number;
  postType: PostType;
  aspectRatio: string;
  validated: boolean;
}> {
  const base64Data = base64DataUrl.split(',')[1] ?? base64DataUrl;
  const buffer = Buffer.from(base64Data, 'base64');

  const sizeBytes = buffer.length;
  const sizeMB = sizeBytes / (1024 * 1024);

  if (sizeBytes < MIN_SIZE_BYTES) {
    throw new Error(`Imagem muito pequena: ${sizeMB.toFixed(2)} MB (mínimo ${MIN_SIZE_MB} MB)`);
  }
  if (sizeBytes > MAX_SIZE_BYTES) {
    throw new Error(`Imagem muito grande: ${sizeMB.toFixed(2)} MB (máximo ${MAX_SIZE_MB} MB)`);
  }

  const metadata = await sharp(buffer).metadata();
  const rawFormat = metadata.format ?? 'png';
  const allowedFormats = ['jpeg', 'png', 'webp'] as const;
  const format = allowedFormats.includes(rawFormat as any) ? rawFormat : 'png';
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (!allowedFormats.includes(format as any)) {
    throw new Error(`Formato de imagem inválido: ${rawFormat}. Permitidos: jpeg, png, webp`);
  }

  const formatAsserted = format as 'jpeg' | 'png' | 'webp';

  const expected = getExpectedDimensions(postType);
  if (!dimensionsMatch(width, height, expected.width, expected.height)) {
    throw new Error(
      `Dimensões incorretas para ${postType}: ${width}x${height} (esperado ~${expected.width}x${expected.height} ±${(DIMENSION_TOLERANCE * 100).toFixed(0)}%)`
    );
  }

  const fileName = `planner/${tenantId}/${dayIndex}-${randomUUID()}.${formatAsserted}`;
  const mimeType = `image/${formatAsserted === 'jpeg' ? 'jpeg' : formatAsserted}`;
  const imageUrl = await uploadAsset(buffer, fileName, mimeType);

  return {
    imageUrl,
    width,
    height,
    format: formatAsserted,
    sizeBytes,
    postType,
    aspectRatio: expected.aspectRatio,
    validated: true,
  };
}

export async function deleteGeneratedImages(imageUrls: string[]): Promise<void> {
  for (const url of imageUrls) {
    try {
      await deleteAsset(url);
    } catch (err) {
      console.warn('[image-validation] Failed to delete image:', url, err);
    }
  }
}