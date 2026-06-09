import { createCanvas, loadImage } from '@napi-rs/canvas';
import type { CreativeData } from './creative-generator.service.js';

const W = 1080;
const H = 1080;

type ColorScheme = {
  bg: string;
  text: string;
  accent: string;
  ctaBg: string;
  ctaText: string;
  secondary: string;
};

const COLOR_SCHEMES: Record<CreativeData['color_scheme'], ColorScheme> = {
  brand_orange: { bg: '#0F0F0F', text: '#FFFFFF', accent: '#EA580C', ctaBg: '#EA580C', ctaText: '#FFFFFF', secondary: '#F97316' },
  dark_premium:  { bg: '#0A0A0A', text: '#FFFFFF', accent: '#C9A84C', ctaBg: '#C9A84C', ctaText: '#0A0A0A', secondary: '#E2C97E' },
  clean_white:   { bg: '#FFFFFF', text: '#111827', accent: '#2563EB', ctaBg: '#2563EB', ctaText: '#FFFFFF', secondary: '#3B82F6' },
  bold_contrast: { bg: '#1A1A2E', text: '#FFFFFF', accent: '#16A34A', ctaBg: '#16A34A', ctaText: '#FFFFFF', secondary: '#22C55E' },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any;

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawCTA(ctx: Ctx, text: string, cx: number, y: number, colors: ColorScheme): number {
  const fontSize = 28;
  ctx.font = `bold ${fontSize}px sans-serif`;
  const label = text.toUpperCase();
  const textW = ctx.measureText(label).width;
  const padX = 60;
  const padY = 22;
  const btnW = textW + padX * 2;
  const btnH = fontSize + padY * 2;
  const x = cx - btnW / 2;

  roundRect(ctx, x, y, btnW, btnH, 8);
  ctx.fillStyle = colors.ctaBg;
  ctx.fill();

  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = colors.ctaText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, y + btnH / 2);
  return btnH;
}

function drawLines(ctx: Ctx, lines: string[], x: number, startY: number, lineHeight: number, align: 'left' | 'center') {
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
}

function drawImagePlaceholder(ctx: Ctx, x: number, y: number, w: number, h: number, colors: ColorScheme) {
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, hexToRgba(colors.accent, 0.2));
  grad.addColorStop(1, hexToRgba(colors.secondary, 0.1));
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, 100, 0, Math.PI * 2);
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 3;
  ctx.stroke();
}

async function drawProductHero(ctx: Ctx, data: CreativeData, colors: ColorScheme) {
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  const imgH = 520;
  if (data.productImageUrl) {
    try {
      const img = await loadImage(data.productImageUrl);
      ctx.drawImage(img, 0, 0, W, imgH);
    } catch {
      drawImagePlaceholder(ctx, 0, 0, W, imgH, colors);
    }
  } else {
    drawImagePlaceholder(ctx, 0, 0, W, imgH, colors);
  }

  const padX = 60;
  let y = imgH + 32;

  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = colors.accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(data.businessName.toUpperCase(), padX, y);
  y += 36;

  ctx.font = 'bold 58px sans-serif';
  ctx.fillStyle = colors.text;
  const headlineLines = wrapText(ctx, data.headline, W - padX * 2);
  ctx.font = 'bold 58px sans-serif';
  const hlSlice = headlineLines.slice(0, 2);
  drawLines(ctx, hlSlice, padX, y, 66, 'left');
  y += hlSlice.length * 66 + 16;

  if (data.subheadline) {
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = colors.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(data.subheadline, padX, y);
    y += 36;
  }

  ctx.font = '24px sans-serif';
  ctx.fillStyle = hexToRgba(colors.text, 0.75);
  const ptLines = wrapText(ctx, data.primary_text, W - padX * 2);
  drawLines(ctx, ptLines.slice(0, 2), padX, y, 36, 'left');
  y += ptLines.slice(0, 2).length * 36 + 28;

  drawCTA(ctx, data.cta, padX + 240, y, colors);
}

async function drawTextFocus(ctx: Ctx, data: CreativeData, colors: ColorScheme) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, colors.bg);
  grad.addColorStop(0.5, hexToRgba(colors.accent, 0.13));
  grad.addColorStop(1, colors.bg);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  let y = 160;

  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = colors.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(data.businessName.toUpperCase(), cx, y);
  y += 44;

  ctx.fillStyle = colors.accent;
  ctx.fillRect(cx - 40, y, 80, 4);
  y += 36;

  ctx.font = 'bold 74px sans-serif';
  ctx.fillStyle = colors.text;
  const hlLines = wrapText(ctx, data.headline, W - 200);
  ctx.font = 'bold 74px sans-serif';
  const hlSlice = hlLines.slice(0, 3);
  drawLines(ctx, hlSlice, cx, y, 82, 'center');
  y += hlSlice.length * 82 + 36;

  if (data.subheadline) {
    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = colors.accent;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(data.subheadline, cx, y);
    y += 52;
  }

  ctx.font = '28px sans-serif';
  ctx.fillStyle = hexToRgba(colors.text, 0.8);
  const ptLines = wrapText(ctx, data.primary_text, W - 200);
  drawLines(ctx, ptLines.slice(0, 3), cx, y, 42, 'center');
  y += ptLines.slice(0, 3).length * 42 + 52;

  drawCTA(ctx, data.cta, cx, y, colors);
}

async function drawOfferHighlight(ctx: Ctx, data: CreativeData, colors: ColorScheme) {
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  const barH = 88;
  ctx.fillStyle = colors.accent;
  ctx.fillRect(0, 0, W, barH);

  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = colors.ctaText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(data.businessName.toUpperCase(), 60, barH / 2);

  const badgeLabel = 'OFERTA ESPECIAL';
  ctx.font = 'bold 18px sans-serif';
  const badgeW = ctx.measureText(badgeLabel).width + 48;
  const badgeH = 40;
  const badgeX = W - 60 - badgeW;
  const badgeY = (barH - badgeH) / 2;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 20);
  ctx.fillStyle = colors.ctaText;
  ctx.fill();
  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = colors.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeLabel, badgeX + badgeW / 2, badgeY + badgeH / 2);

  const cx = W / 2;
  let y = barH + 80;

  ctx.font = 'bold 70px sans-serif';
  ctx.fillStyle = colors.text;
  const hlLines = wrapText(ctx, data.headline, W - 120);
  ctx.font = 'bold 70px sans-serif';
  const hlSlice = hlLines.slice(0, 2);
  drawLines(ctx, hlSlice, cx, y, 78, 'center');
  y += hlSlice.length * 78 + 32;

  const accentText = data.subheadline || data.primary_text;
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = colors.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(accentText.substring(0, 80), cx, y);
  y += 52;

  const boxPadX = 48;
  const boxPadY = 32;
  const boxW = W - 120;
  const boxX = (W - boxW) / 2;
  ctx.font = '26px sans-serif';
  ctx.fillStyle = hexToRgba(colors.text, 0.8);
  const ptLines = wrapText(ctx, data.primary_text, boxW - boxPadX * 2);
  const ptSlice = ptLines.slice(0, 3);
  const boxH = ptSlice.length * 40 + boxPadY * 2;
  roundRect(ctx, boxX, y, boxW, boxH, 16);
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = '26px sans-serif';
  ctx.fillStyle = hexToRgba(colors.text, 0.8);
  drawLines(ctx, ptSlice, cx, y + boxPadY, 40, 'center');
  y += boxH + 52;

  drawCTA(ctx, data.cta, cx, y, colors);
}

async function drawTestimonialStyle(ctx: Ctx, data: CreativeData, colors: ColorScheme) {
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2;
  let y = 80;

  ctx.font = 'bold 160px sans-serif';
  ctx.fillStyle = hexToRgba(colors.accent, 0.3);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('"', cx, y);
  y += 130;

  ctx.font = 'bold 62px sans-serif';
  ctx.fillStyle = colors.text;
  const hlLines = wrapText(ctx, data.headline, W - 160);
  ctx.font = 'bold 62px sans-serif';
  const hlSlice = hlLines.slice(0, 3);
  drawLines(ctx, hlSlice, cx, y, 70, 'center');
  y += hlSlice.length * 70 + 40;

  ctx.font = 'italic 28px sans-serif';
  ctx.fillStyle = hexToRgba(colors.text, 0.8);
  const ptLines = wrapText(ctx, data.primary_text, W - 200);
  drawLines(ctx, ptLines.slice(0, 3), cx, y, 42, 'center');
  y += ptLines.slice(0, 3).length * 42 + 40;

  ctx.fillStyle = colors.accent;
  ctx.fillRect(cx - 30, y, 60, 3);
  y += 36;

  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = colors.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(data.businessName.toUpperCase(), cx, y);
  y += 36;

  if (data.subheadline) {
    ctx.font = '22px sans-serif';
    ctx.fillStyle = hexToRgba(colors.text, 0.6);
    ctx.fillText(data.subheadline, cx, y);
    y += 36;
  }
  y += 24;

  drawCTA(ctx, data.cta, cx, y, colors);
}

export async function convertHTMLToPNG(data: CreativeData): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const colors = COLOR_SCHEMES[data.color_scheme] ?? COLOR_SCHEMES.brand_orange;

  switch (data.layout) {
    case 'product_hero':      await drawProductHero(ctx, data, colors); break;
    case 'text_focus':        await drawTextFocus(ctx, data, colors); break;
    case 'offer_highlight':   await drawOfferHighlight(ctx, data, colors); break;
    case 'testimonial_style': await drawTestimonialStyle(ctx, data, colors); break;
    default:                  await drawTextFocus(ctx, data, colors);
  }

  return canvas.toBuffer('image/png');
}
