import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
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

  // Background
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  // Top bar
  ctx.fillStyle = colors.primary;
  ctx.fillRect(0, 0, W, BAR_H);

  // Bottom bar
  ctx.fillStyle = colors.primary;
  ctx.fillRect(0, H - BAR_H, W, BAR_H);

  // Business name
  ctx.font = `bold 32px ${fontFamily}`;
  ctx.fillStyle = colors.primary;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText((data.businessName ?? '').toUpperCase(), cx, 120);

  // Headline
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

  // Separator line
  const sepY = Math.max(subBottom + 20, 680);
  ctx.fillStyle = colors.primary;
  ctx.fillRect(cx - 300, sepY, 600, 3);

  // Primary text
  ctx.font = `34px ${fontFamily}`;
  ctx.fillStyle = colors.textSecondary;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  wrapText(ctx, data.primary_text ?? '', cx, sepY + 40, CONTENT_W, 46, 2);

  // CTA button
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

  const buffer = canvas.toBuffer('image/png');
  console.log('=== CANVAS generated buffer size:', buffer.length);
  return buffer;
}
