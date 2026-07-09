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
  logoUrl?: string;
};

export type RenderCreativeResult = {
  creativeAssetId: string;
  imageUrl: string;
  headline: string;
  cta: string;
  brandColor: string;
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

// Rounded rect for the CTA button — shape only, zero text, zero font dependency
function buildCtaShapeSvg(): Buffer {
  return Buffer.from(
    '<svg width="500" height="72" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="500" height="72" rx="36" fill="black" fill-opacity="0.25"/>' +
      '</svg>'
  );
}

export async function renderCreative(input: RenderCreativeInput): Promise<RenderCreativeResult> {
  const { tenantId, headline, cta, brandColor, imageUrl, logoUrl } = input;

  if (!headline.trim()) throw new AppError(400, 'INVALID_HEADLINE', 'Headline é obrigatória.');
  if (!cta.trim()) throw new AppError(400, 'INVALID_CTA', 'CTA é obrigatório.');
  if (!imageUrl) throw new AppError(400, 'INVALID_IMAGE', 'Imagem do produto é obrigatória.');

  const color = brandColor || '#E8631A';
  const brandRgb = hexToRgb(color);

  const productBuffer = await fetchImageBuffer(imageUrl);

  // Top 600px: product photo, cover crop
  const productResized = await sharp(productBuffer)
    .resize(1080, 600, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  // Bottom 480px: solid brand color strip (no SVG, no fonts)
  const stripBuffer = await sharp({
    create: { width: 1080, height: 480, channels: 3, background: brandRgb },
  })
    .png()
    .toBuffer();

  // CTA pill shape at y=912 (80% of strip height from strip top)
  const ctaShape = buildCtaShapeSvg();

  const composites: sharp.OverlayOptions[] = [
    { input: productResized, top: 0, left: 0 },
    { input: stripBuffer, top: 600, left: 0 },
    { input: ctaShape, top: 912, left: 290 },
  ];

  // Se tiver logo e includeLogo=true, baixa e compõe no canto superior esquerdo da faixa
  if (logoUrl) {
    try {
      const logoBuffer = await fetchImageBuffer(logoUrl);
      const logoResized = await sharp(logoBuffer)
        .resize(120, null, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      composites.push({ input: logoResized, top: 620, left: 40 });
    } catch {
      // fallback silencioso — se o logo não carregar, o anúncio ainda funciona
    }
  }

  const finalBuffer = await sharp({
    create: { width: 1080, height: 1080, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(composites)
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
        brandColor: color,
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

  return { creativeAssetId: asset.id, imageUrl: dataUrl, headline, cta, brandColor: color };
}
