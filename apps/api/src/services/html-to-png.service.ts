import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import fs from 'fs';
import type { CreativeData } from './creative-generator.service.js';

// Register system fonts installed via nixpacks (fonts-open-sans, fonts-dejavu-core)
const FONT_CANDIDATES = [
  // Open Sans (installed via apt fonts-open-sans)
  { path: '/usr/share/fonts/truetype/open-sans/OpenSans-Regular.ttf',    family: 'AppFont', weight: 'normal' },
  { path: '/usr/share/fonts/truetype/open-sans/OpenSans-Bold.ttf',       family: 'AppFont', weight: 'bold' },
  // DejaVu fallback (installed via apt fonts-dejavu-core)
  { path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',             family: 'AppFont', weight: 'normal' },
  { path: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',        family: 'AppFont', weight: 'bold' },
];

let fontFamily = 'sans-serif';

for (const f of FONT_CANDIDATES) {
  if (fs.existsSync(f.path)) {
    GlobalFonts.registerFromPath(f.path, f.family);
    fontFamily = f.family;
    console.log('=== CANVAS registered font:', f.path);
  }
}

console.log('=== CANVAS using font family:', fontFamily);

const W = 1080;
const H = 1080;

type ColorScheme = {
  bg: string;
  primary: string;
  textPrimary: string;
  textSecondary: string;
};

const COLOR_SCHEMES: Record<string, ColorScheme> = {
  brand_orange: { bg: '#0F0F0F', primary: '#EA580C', textPrimary: '#FFFFFF', textSecondary: '#CCCCCC' },
  dark_premium:  { bg: '#0A0A0A', primary: '#C9A84C', textPrimary: '#FFFFFF', textSecondary: '#AAAAAA' },
  clean_white:   { bg: '#F8F8F8', primary: '#2563EB', textPrimary: '#111111', textSecondary: '#555555' },
  bold_contrast: { bg: '#111111', primary: '#EA580C', textPrimary: '#FFFFFF', textSecondary: '#AAAAAA' },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any;

function wrapText(
  ctx: Ctx,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3,
): number {
  const words = text.split(' ');
  let line = '';
  let y = startY;
  let lineCount = 0;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      if (lineCount >= maxLines - 1) {
        // truncate last line
        let truncated = line;
        while (truncated.length > 0 && ctx.measureText(`${truncated}...`).width > maxWidth) {
          truncated = truncated.slice(0, -1);
        }
        ctx.fillText(`${truncated}...`, x, y);
        return y + lineHeight;
      }
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
      lineCount++;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}

function drawRoundRect(ctx: Ctx, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export async function convertHTMLToPNG(data: CreativeData): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const colors = COLOR_SCHEMES[data.color_scheme] ?? COLOR_SCHEMES.brand_orange;

  const cx = W / 2;
  const BAR_H = 12;
  const PAD_X = 80;
  const CONTENT_W = W - PAD_X * 2;

  if (data.productImageUrl) {
    // ── Layout COM imagem ─────────────────────────────────────────────────
    // Top half: product image with cover crop
    const img = await loadImage(data.productImageUrl);
    const IMG_H = 540;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, IMG_H);
    ctx.clip();
    const scale = Math.max(W / img.width, IMG_H / img.height);
    const sw = img.width * scale;
    const sh = img.height * scale;
    ctx.drawImage(img, (W - sw) / 2, (IMG_H - sh) / 2, sw, sh);
    ctx.restore();

    // Dark overlay
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, W, IMG_H);

    // Bottom half background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, IMG_H, W, H - IMG_H);

    // Gradient fade between image and background
    const grad = ctx.createLinearGradient(0, IMG_H - 40, 0, IMG_H + 40);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, colors.bg);
    ctx.fillStyle = grad;
    ctx.fillRect(0, IMG_H - 40, W, 80);

    // Bottom bar
    ctx.fillStyle = colors.primary;
    ctx.fillRect(0, H - BAR_H, W, BAR_H);

    // Business name                                        y=558
    ctx.font = `bold 28px ${fontFamily}`;
    ctx.fillStyle = colors.primary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText((data.businessName ?? '').toUpperCase(), cx, 558);

    // Headline                                             y=608
    ctx.font = `bold 68px ${fontFamily}`;
    ctx.fillStyle = colors.textPrimary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const headlineBottom = wrapText(ctx, data.headline ?? '', cx, 608, CONTENT_W, 80, 2);

    // Subheadline                                          y=max(headlineBottom+16, 790)
    const subY = Math.max(headlineBottom + 16, 790);
    if (data.subheadline) {
      ctx.font = `34px ${fontFamily}`;
      ctx.fillStyle = colors.textSecondary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      wrapText(ctx, data.subheadline, cx, subY, CONTENT_W, 44, 1);
    }

    // CTA button                                          y=960
    const BTN_W = 480;
    const BTN_H = 80;
    const BTN_X = cx - BTN_W / 2;
    const BTN_Y = 960;

    drawRoundRect(ctx, BTN_X, BTN_Y, BTN_W, BTN_H, 14);
    ctx.fillStyle = colors.primary;
    ctx.fill();

    ctx.font = `bold 34px ${fontFamily}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((data.cta ?? 'Saiba Mais').toUpperCase(), cx, BTN_Y + BTN_H / 2);

  } else {
    // ── Layout SEM imagem (original) ─────────────────────────────────────
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);

    // Top bar
    ctx.fillStyle = colors.primary;
    ctx.fillRect(0, 0, W, BAR_H);

    // Bottom bar
    ctx.fillStyle = colors.primary;
    ctx.fillRect(0, H - BAR_H, W, BAR_H);

    // Business name                                        y=120
    ctx.font = `bold 32px ${fontFamily}`;
    ctx.fillStyle = colors.primary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText((data.businessName ?? '').toUpperCase(), cx, 120);

    // Headline                                             y=260
    ctx.font = `bold 80px ${fontFamily}`;
    ctx.fillStyle = colors.textPrimary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const headlineBottom = wrapText(ctx, data.headline ?? '', cx, 260, CONTENT_W, 92, 2);

    // Subheadline
    let subBottom = headlineBottom + 20;
    if (data.subheadline) {
      ctx.font = `40px ${fontFamily}`;
      ctx.fillStyle = colors.textSecondary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      subBottom = wrapText(ctx, data.subheadline, cx, headlineBottom + 20, CONTENT_W, 52, 2);
    }

    // Separator line                                       y=max(subBottom+20, 680)
    const sepY = Math.max(subBottom + 20, 680);
    ctx.fillStyle = colors.primary;
    ctx.fillRect(cx - 300, sepY, 600, 3);

    // Primary text                                         y=sepY+40
    ctx.font = `34px ${fontFamily}`;
    ctx.fillStyle = colors.textSecondary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    wrapText(ctx, data.primary_text ?? '', cx, sepY + 40, CONTENT_W, 46, 2);

    // CTA button                                           y=860
    const BTN_W = 480;
    const BTN_H = 88;
    const BTN_X = cx - BTN_W / 2;
    const BTN_Y = 860;

    drawRoundRect(ctx, BTN_X, BTN_Y, BTN_W, BTN_H, 14);
    ctx.fillStyle = colors.primary;
    ctx.fill();

    ctx.font = `bold 36px ${fontFamily}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((data.cta ?? 'Saiba Mais').toUpperCase(), cx, BTN_Y + BTN_H / 2);
  }

  const buffer = canvas.toBuffer('image/png');
  console.log('=== CANVAS generated buffer size:', buffer.length);
  return buffer;
}
