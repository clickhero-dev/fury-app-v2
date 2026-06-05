import sharp from 'sharp';
import { db, creativeAssets } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';
import { getComplianceQueue } from '../lib/queue.js';

export type RenderCreativeInput = {
  tenantId: string;
  headline: string;
  cta: string;
  brandColor: string;
  imageUrl: string;
};

export type RenderCreativeResult = {
  creativeAssetId: string;
  imageUrl: string;
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return {
    r: isNaN(r) ? 30 : r,
    g: isNaN(g) ? 30 : g,
    b: isNaN(b) ? 30 : b,
  };
}

async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith('data:')) {
    const comma = imageUrl.indexOf(',');
    if (comma === -1) throw new AppError(400, 'INVALID_DATA_URL', 'Invalid data URL format.');
    return Buffer.from(imageUrl.slice(comma + 1), 'base64');
  }
  const res = await fetch(imageUrl);
  if (!res.ok) throw new AppError(502, 'IMAGE_FETCH_FAILED', `Failed to fetch image: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function escapeSvg(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapWords(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function buildSvgOverlay(headline: string, cta: string, brandColor: string): Buffer {
  const lines = wrapWords(escapeSvg(headline), 28);
  const ctaText = escapeSvg(cta);

  let headlineEl: string;
  if (lines.length === 1) {
    headlineEl = `<text x="540" y="730" font-family="Arial, sans-serif" font-size="56" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${lines[0]}</text>`;
  } else {
    headlineEl = `
<text x="540" y="700" font-family="Arial, sans-serif" font-size="56" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${lines[0]}</text>
<text x="540" y="765" font-family="Arial, sans-serif" font-size="56" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${lines[1]}</text>`;
  }

  const ctaY = lines.length === 1 ? 850 : 890;
  const ctaPillTop = ctaY - 36;

  const svg = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="600" width="1080" height="480" fill="rgba(0,0,0,0.82)"/>
  ${headlineEl}
  <rect x="290" y="${ctaPillTop}" width="500" height="72" rx="36" fill="${brandColor}"/>
  <text x="540" y="${ctaY}" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${ctaText}</text>
</svg>`;

  return Buffer.from(svg);
}

export async function renderCreative(input: RenderCreativeInput): Promise<RenderCreativeResult> {
  const { tenantId, headline, cta, brandColor, imageUrl } = input;

  if (!headline.trim()) throw new AppError(400, 'INVALID_HEADLINE', 'Headline é obrigatória.');
  if (!cta.trim()) throw new AppError(400, 'INVALID_CTA', 'CTA é obrigatório.');
  if (!imageUrl) throw new AppError(400, 'INVALID_IMAGE', 'Imagem do produto é obrigatória.');

  const brandRgb = hexToRgb(brandColor || '#E8631A');

  const productBuffer = await fetchImageBuffer(imageUrl);

  const productResized = await sharp(productBuffer)
    .resize(1080, 600, { fit: 'cover', position: 'centre' })
    .toBuffer();

  const svgOverlay = buildSvgOverlay(headline, cta, brandColor || '#E8631A');

  const finalBuffer = await sharp({
    create: { width: 1080, height: 1080, channels: 3, background: brandRgb },
  })
    .composite([
      { input: productResized, top: 0, left: 0 },
      { input: svgOverlay, top: 0, left: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();

  const dataUrl = `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;

  const [asset] = await db
    .insert(creativeAssets)
    .values({
      tenantId,
      type: 'image',
      url: dataUrl,
      complianceStatus: 'pending_compliance',
      complianceNotes: JSON.stringify({
        headline,
        cta,
        brandColor,
        generatedAt: new Date().toISOString(),
      }),
    })
    .returning();

  const complianceQueue = await getComplianceQueue();
  await complianceQueue.add(
    'studio:compliance-check',
    { creativeAssetId: asset.id, tenantId },
    { removeOnComplete: 1000, removeOnFail: 5000 }
  );

  return { creativeAssetId: asset.id, imageUrl: dataUrl };
}
