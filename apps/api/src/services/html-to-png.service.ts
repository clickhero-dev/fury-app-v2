import { createCanvas, GlobalFonts, loadImage, type Image } from '@napi-rs/canvas';
import fs from 'fs';
import type { CreativeData } from './creative-generator.service.js';

// Register system fonts installed via nixpacks (fonts-open-sans, fonts-dejavu-core)
// in production, with macOS fallbacks so local dev also renders PT-BR accents
// (the bundled @napi-rs/canvas "sans-serif" fallback is missing accented glyphs).
const FONT_CANDIDATES = [
  // Open Sans (installed via apt fonts-open-sans)
  { path: '/usr/share/fonts/truetype/open-sans/OpenSans-Regular.ttf',    family: 'AppFont', weight: 'normal' },
  { path: '/usr/share/fonts/truetype/open-sans/OpenSans-Bold.ttf',       family: 'AppFont', weight: 'bold' },
  // DejaVu fallback (installed via apt fonts-dejavu-core)
  { path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',             family: 'AppFont', weight: 'normal' },
  { path: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',        family: 'AppFont', weight: 'bold' },
  // macOS dev fallback (full Latin/PT-BR coverage)
  { path: '/System/Library/Fonts/Supplemental/Arial.ttf',                family: 'AppFont', weight: 'normal' },
  { path: '/System/Library/Fonts/Supplemental/Arial Bold.ttf',           family: 'AppFont', weight: 'bold' },
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
const BAR_H = 12;
const PAD_X = 80;
const CONTENT_W = W - PAD_X * 2;
const cx = W / 2;

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

// ── Contraste (WCAG) ─────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const num = parseInt(h, 16) || 0;
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function mixHex(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Luminancia relativa (formula WCAG), 0 a 1. */
function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razao de contraste WCAG entre duas cores (1 a 21). */
function getContrastRatio(hexA: string, hexB: string): number {
  const l1 = getLuminance(hexA);
  const l2 = getLuminance(hexB);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Branco ou preto, o que tiver melhor contraste contra bgColor. */
function pickTextOn(bgColor: string): string {
  return getContrastRatio('#FFFFFF', bgColor) >= getContrastRatio('#000000', bgColor) ? '#FFFFFF' : '#000000';
}

/**
 * Garante contraste >= minRatio entre textColor e bgColor. Se ja for legivel,
 * retorna textColor inalterado. Senao, ajusta a luminancia de textColor
 * (clareando sobre fundo escuro, escurecendo sobre fundo claro) preservando
 * matiz/saturacao, ate atingir minRatio. Se nem no limite atingir, cai para
 * preto/branco — o que tiver melhor contraste contra bgColor.
 */
function ensureReadable(textColor: string, bgColor: string, minRatio = 4.5): string {
  if (getContrastRatio(textColor, bgColor) >= minRatio) return textColor;

  const [r, g, b] = hexToRgb(textColor);
  const [h, s, l] = rgbToHsl(r, g, b);
  const targetL = getLuminance(bgColor) > 0.5 ? 0 : 1;

  let best = textColor;
  let bestRatio = getContrastRatio(textColor, bgColor);
  const steps = 20;
  for (let i = 1; i <= steps; i++) {
    const newL = l + (targetL - l) * (i / steps);
    const [nr, ng, nb] = hslToRgb(h, s, newL);
    const candidate = rgbToHex(nr, ng, nb);
    const ratio = getContrastRatio(candidate, bgColor);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
    if (ratio >= minRatio) return candidate;
  }

  return bestRatio >= minRatio ? best : pickTextOn(bgColor);
}

/** Tom medio assumido para fotos desconhecidas, usado para estimar a cor efetiva de fundo sob um overlay. */
const PHOTO_MID = '#808080';

/** Cor efetiva de fundo quando um overlay (overlayColor, alpha) cobre uma foto de tom medio desconhecido. */
function effectiveBgOverPhoto(overlayColor: string, alpha: number): string {
  return mixHex(PHOTO_MID, overlayColor, alpha);
}

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

/** Desenha `img` em (x, y, w, h) com crop "cover" (preenche a área, recorta excesso). */
function drawCoverImage(ctx: Ctx, img: Image, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const scale = Math.max(w / img.width, h / img.height);
  const sw = img.width * scale;
  const sh = img.height * scale;
  ctx.drawImage(img, x + (w - sw) / 2, y + (h - sh) / 2, sw, sh);
  ctx.restore();
}

/** Desenha `img` recortada em circulo, centrada em (cx, cy) com raio `radius`. */
function drawCircleImage(ctx: Ctx, img: Image, circleCx: number, circleCy: number, radius: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(circleCx, circleCy, radius, 0, Math.PI * 2);
  ctx.clip();
  drawCoverImage(ctx, img, circleCx - radius, circleCy - radius, radius * 2, radius * 2);
  ctx.restore();
}

/** Overlay escuro semi-transparente sobre uma area — usado para garantir legibilidade de texto sobre foto. */
function drawDarkOverlay(ctx: Ctx, x: number, y: number, w: number, h: number, alpha: number) {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.fillRect(x, y, w, h);
}

/** Gradiente vertical (mais escuro na base) sobre uma area — da profundidade a foto e reforca a legibilidade onde fica o texto/CTA. */
function drawGradientOverlay(ctx: Ctx, x: number, y: number, w: number, h: number, colorHex: string, alphaTop: number, alphaBottom: number) {
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, hexToRgba(colorHex, alphaTop));
  grad.addColorStop(1, hexToRgba(colorHex, alphaBottom));
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

/** Botao CTA arredondado, preenchido com colors.primary; texto na cor com melhor contraste. */
function drawCtaButton(ctx: Ctx, x: number, y: number, w: number, h: number, text: string | undefined, colors: ColorScheme) {
  drawRoundRect(ctx, x, y, w, h, 14);
  ctx.fillStyle = colors.primary;
  ctx.fill();

  ctx.font = `bold 34px ${fontFamily}`;
  ctx.fillStyle = pickTextOn(colors.primary);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((text ?? 'Saiba Mais').toUpperCase(), x + w / 2, y + h / 2);
}

/** Desenha o logo dentro de um chip claro arredondado, em tamanho fixo — garante contraste do logo sobre qualquer fundo. */
function drawLogoBadge(ctx: Ctx, logo: Image, x: number, y: number, size: number) {
  drawRoundRect(ctx, x, y, size, size, size * 0.18);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  const pad = size * 0.14;
  drawCoverImage(ctx, logo, x + pad, y + pad, size - pad * 2, size - pad * 2);
}

/**
 * product_hero — produto/imagem como herói (topo), texto + CTA na metade inferior.
 * Sem imagem: area superior recebe um placeholder com circulo na cor de destaque.
 */
function drawProductHero(ctx: Ctx, data: CreativeData, colors: ColorScheme, img: Image | null, logo: Image | null) {
  const IMG_H = 540;

  if (img) {
    drawCoverImage(ctx, img, 0, 0, W, IMG_H);
    drawGradientOverlay(ctx, 0, 0, W, IMG_H, '#000000', 0.1, 0.55);
  } else {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = colors.primary;
    ctx.fillRect(0, 0, W, IMG_H);
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, IMG_H / 2, 110, 0, Math.PI * 2);
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = colors.primary;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors.primary;
    ctx.stroke();
  }

  // Metade inferior
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, IMG_H, W, H - IMG_H);

  if (img) {
    // Gradiente de transicao entre imagem e fundo
    const grad = ctx.createLinearGradient(0, IMG_H - 40, 0, IMG_H + 40);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, colors.bg);
    ctx.fillStyle = grad;
    ctx.fillRect(0, IMG_H - 40, W, 80);
  }

  // Faixa inferior
  ctx.fillStyle = colors.primary;
  ctx.fillRect(0, H - BAR_H, W, BAR_H);

  // Logo (canto superior esquerdo, sobre a imagem/placeholder)
  if (logo) {
    drawLogoBadge(ctx, logo, 32, 32, 72);
  }

  // Nome do negocio
  ctx.font = `bold 28px ${fontFamily}`;
  ctx.fillStyle = ensureReadable(colors.primary, colors.bg);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText((data.businessName ?? '').toUpperCase(), cx, 558);

  // Headline
  ctx.font = `bold 68px ${fontFamily}`;
  ctx.fillStyle = ensureReadable(colors.textPrimary, colors.bg);
  const headlineBottom = wrapText(ctx, data.headline ?? '', cx, 608, CONTENT_W, 80, 2);

  // Subheadline
  const subY = Math.max(headlineBottom + 16, 790);
  if (data.subheadline) {
    ctx.font = `34px ${fontFamily}`;
    ctx.fillStyle = ensureReadable(colors.textSecondary, colors.bg);
    wrapText(ctx, data.subheadline, cx, subY, CONTENT_W, 44, 1);
  }

  drawCtaButton(ctx, cx - 240, 960, 480, 80, data.cta, colors);
}

/**
 * text_focus — headline grande dominando a composicao, pouco/nenhum peso de imagem.
 * Com imagem: a foto entra como fundo da tela toda, mas recebe um overlay forte
 * na cor de fundo do scheme para nao competir com o texto.
 */
function drawTextFocus(ctx: Ctx, data: CreativeData, colors: ColorScheme, img: Image | null, logo: Image | null) {
  let bgTop = colors.bg;
  let bgBottom = colors.bg;

  if (img) {
    drawCoverImage(ctx, img, 0, 0, W, H);
    // Gradiente na cor de fundo do scheme, mais forte na base — da profundidade
    // a foto e mantem o texto/CTA legivel.
    drawGradientOverlay(ctx, 0, 0, W, H, colors.bg, 0.78, 0.92);
    bgTop = effectiveBgOverPhoto(colors.bg, 0.78);
    bgBottom = effectiveBgOverPhoto(colors.bg, 0.9);
  } else {
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, W, H);
  }

  // Faixas superior/inferior
  ctx.fillStyle = colors.primary;
  ctx.fillRect(0, 0, W, BAR_H);
  ctx.fillRect(0, H - BAR_H, W, BAR_H);

  // Logo (canto superior esquerdo)
  if (logo) {
    drawLogoBadge(ctx, logo, 32, 32, 64);
  }

  // Nome do negocio
  ctx.font = `bold 32px ${fontFamily}`;
  ctx.fillStyle = ensureReadable(colors.primary, bgTop);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText((data.businessName ?? '').toUpperCase(), cx, 120);

  // Headline
  ctx.font = `bold 80px ${fontFamily}`;
  ctx.fillStyle = ensureReadable(colors.textPrimary, bgTop);
  const headlineBottom = wrapText(ctx, data.headline ?? '', cx, 260, CONTENT_W, 92, 2);

  // Subheadline
  let subBottom = headlineBottom + 20;
  if (data.subheadline) {
    ctx.font = `40px ${fontFamily}`;
    ctx.fillStyle = ensureReadable(colors.textSecondary, bgTop);
    subBottom = wrapText(ctx, data.subheadline, cx, headlineBottom + 20, CONTENT_W, 52, 2);
  }

  // Linha separadora
  const sepY = Math.max(subBottom + 20, 680);
  ctx.fillStyle = colors.primary;
  ctx.fillRect(cx - 300, sepY, 600, 3);

  // Texto principal
  ctx.font = `34px ${fontFamily}`;
  ctx.fillStyle = ensureReadable(colors.textSecondary, bgBottom);
  wrapText(ctx, data.primary_text ?? '', cx, sepY + 40, CONTENT_W, 46, 2);

  drawCtaButton(ctx, cx - 240, 860, 480, 88, data.cta, colors);
}

/**
 * offer_highlight — faixa superior na cor de destaque com selo "OFERTA ESPECIAL",
 * headline grande e caixa com borda destacando a oferta, seguido de CTA.
 */
function drawOfferHighlight(ctx: Ctx, data: CreativeData, colors: ColorScheme, img: Image | null, logo: Image | null) {
  const STRIP_H = 130;
  const HEADLINE_OVERLAY_ALPHA_TOP = 0.32;

  // Corpo (atras da faixa)
  let headlineBg = colors.bg;
  if (img) {
    drawCoverImage(ctx, img, 0, STRIP_H, W, H - STRIP_H);
    drawGradientOverlay(ctx, 0, STRIP_H, W, H - STRIP_H, '#000000', HEADLINE_OVERLAY_ALPHA_TOP, 0.6);
    headlineBg = effectiveBgOverPhoto('#000000', HEADLINE_OVERLAY_ALPHA_TOP);
  } else {
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, STRIP_H, W, H - STRIP_H);
  }

  // Faixa superior
  ctx.fillStyle = colors.primary;
  ctx.fillRect(0, 0, W, STRIP_H);

  // Logo (dentro da faixa, a esquerda do nome do negocio)
  let nameX = PAD_X;
  if (logo) {
    const logoSize = 80;
    drawLogoBadge(ctx, logo, PAD_X, (STRIP_H - logoSize) / 2, logoSize);
    nameX = PAD_X + logoSize + 20;
  }

  ctx.font = `bold 30px ${fontFamily}`;
  ctx.fillStyle = pickTextOn(colors.primary);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText((data.businessName ?? '').toUpperCase(), nameX, STRIP_H / 2);

  // Selo "OFERTA ESPECIAL"
  const badgeText = 'OFERTA ESPECIAL';
  ctx.font = `bold 24px ${fontFamily}`;
  const badgeW = ctx.measureText(badgeText).width + 56;
  const badgeH = 52;
  const badgeX = W - PAD_X - badgeW;
  const badgeY = STRIP_H / 2 - badgeH / 2;
  drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.fillStyle = ensureReadable(colors.primary, '#FFFFFF');
  ctx.textAlign = 'center';
  ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);

  // Headline
  ctx.font = `bold 76px ${fontFamily}`;
  ctx.fillStyle = ensureReadable(colors.textPrimary, headlineBg);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const headlineBottom = wrapText(ctx, data.headline ?? '', cx, STRIP_H + 60, CONTENT_W, 86, 2);

  // Caixa de destaque da oferta (fundo solido para legibilidade sobre foto)
  const boxY = Math.max(headlineBottom + 30, 470);
  const boxH = 220;
  drawRoundRect(ctx, PAD_X, boxY, CONTENT_W, boxH, 16);
  ctx.fillStyle = colors.bg;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = colors.primary;
  ctx.stroke();

  const highlightText = data.subheadline || data.primary_text || '';
  ctx.font = `bold 40px ${fontFamily}`;
  ctx.fillStyle = pickTextOn(colors.bg);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const highlightBottom = wrapText(ctx, highlightText, cx, boxY + 30, CONTENT_W - 80, 48, 2);

  if (data.subheadline && data.primary_text) {
    ctx.font = `26px ${fontFamily}`;
    ctx.fillStyle = ensureReadable(colors.textSecondary, colors.bg);
    wrapText(ctx, data.primary_text, cx, Math.min(highlightBottom + 6, boxY + boxH - 70), CONTENT_W - 80, 34, 1);
  }

  drawCtaButton(ctx, cx - 240, 960, 480, 80, data.cta, colors);
}

/**
 * testimonial_style — aspas em destaque, headline como "depoimento", texto principal
 * em itálico, atribuicao (avatar com mascara circular se houver imagem) + CTA.
 */
function drawTestimonialStyle(ctx: Ctx, data: CreativeData, colors: ColorScheme, img: Image | null, logo: Image | null) {
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  // Logo (canto superior esquerdo)
  if (logo) {
    drawLogoBadge(ctx, logo, 32, 32, 64);
  }

  // Aspas de destaque
  ctx.font = `bold 160px ${fontFamily}`;
  ctx.fillStyle = ensureReadable(colors.primary, colors.bg);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('"', cx, 30);

  // Headline (frase de destaque/depoimento)
  ctx.font = `bold 60px ${fontFamily}`;
  ctx.fillStyle = ensureReadable(colors.textPrimary, colors.bg);
  const headlineBottom = wrapText(ctx, data.headline ?? '', cx, 220, CONTENT_W, 70, 2);

  // Texto principal (itálico)
  ctx.font = `italic 30px ${fontFamily}`;
  ctx.fillStyle = ensureReadable(colors.textSecondary, colors.bg);
  const primaryBottom = wrapText(ctx, data.primary_text ?? '', cx, headlineBottom + 20, CONTENT_W - 120, 42, 3);

  // Linha divisoria
  const dividerY = Math.min(primaryBottom + 30, 760);
  ctx.fillStyle = colors.primary;
  ctx.fillRect(cx - 30, dividerY, 60, 3);

  // Atribuicao: avatar (se houver imagem) + nome do negocio + subheadline
  let attribY = dividerY + 40;
  if (img) {
    const radius = 50;
    drawCircleImage(ctx, img, cx, attribY + radius, radius);
    ctx.lineWidth = 3;
    ctx.strokeStyle = colors.primary;
    ctx.beginPath();
    ctx.arc(cx, attribY + radius, radius, 0, Math.PI * 2);
    ctx.stroke();
    attribY += radius * 2 + 24;
  }

  ctx.font = `bold 26px ${fontFamily}`;
  ctx.fillStyle = ensureReadable(colors.primary, colors.bg);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText((data.businessName ?? '').toUpperCase(), cx, attribY);
  attribY += 36;

  if (data.subheadline) {
    ctx.font = `22px ${fontFamily}`;
    ctx.fillStyle = ensureReadable(colors.textSecondary, colors.bg);
    ctx.fillText(data.subheadline, cx, attribY);
    attribY += 36;
  }

  drawCtaButton(ctx, cx - 240, Math.min(attribY + 24, 960), 480, 80, data.cta, colors);
}

const LAYOUT_RENDERERS: Record<string, (ctx: Ctx, data: CreativeData, colors: ColorScheme, img: Image | null, logo: Image | null) => void> = {
  product_hero: drawProductHero,
  text_focus: drawTextFocus,
  offer_highlight: drawOfferHighlight,
  testimonial_style: drawTestimonialStyle,
};

export type BrandColors = {
  primary?: string | null;
  secondary?: string | null;
  logoUrl?: string | null;
};

export async function convertHTMLToPNG(data: CreativeData, brandColors?: BrandColors): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  // NOTA (Prompt 4): renderers ainda usam os color_schemes legados como base.
  // O novo contrato traz cores em data.brand_colors — a refatoração dos renderers
  // por arquétipo é feita no Prompt 4. Até lá, caímos no scheme legado e a cor
  // primária da marca é aplicada via brandColors (abaixo).
  const colors = { ...(COLOR_SCHEMES[data.color_scheme ?? 'brand_orange'] ?? COLOR_SCHEMES.brand_orange) };

  if (brandColors?.primary) colors.primary = brandColors.primary;
  if (brandColors?.secondary) colors.textSecondary = brandColors.secondary;

  const img = data.productImageUrl ? await loadImage(data.productImageUrl) : null;

  const includeLogo = data.includeLogo ?? true;
  let logo: Image | null = null;
  if (includeLogo && brandColors?.logoUrl) {
    try {
      logo = await loadImage(brandColors.logoUrl);
    } catch (err) {
      console.warn('=== CANVAS failed to load logo, skipping:', err);
    }
  }

  const renderer =
    LAYOUT_RENDERERS[data.layout] ?? (img ? drawProductHero : drawTextFocus);

  renderer(ctx, data, colors, img, logo);

  const buffer = canvas.toBuffer('image/png');
  console.log('=== CANVAS generated buffer size:', buffer.length, '| layout:', data.layout);
  return buffer;
}
