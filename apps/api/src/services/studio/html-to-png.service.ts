import { createCanvas, GlobalFonts, loadImage, type Image, type Canvas } from '@napi-rs/canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CreativeData } from './creative-data.js';
import type { CreativeLayout } from '@fury/shared';

// ── Registro de fontes ─────────────────────────────────────────────────────
// Os arquétipos exigem pesos pesados (ExtraBold 800) para os displays. O
// @napi-rs/canvas NÃO aceita peso numérico em register() — o peso vem da
// metadata interna (OS/2) de cada arquivo. Solução: registrar VÁRIOS arquivos
// (cada um com seu peso) sob o MESMO alias 'AppFont' e selecionar via string
// CSS de peso (ctx.font = '800 72px AppFont'). O matcher escolhe o face pelo
// peso mais próximo.
//
// Fonte bundlada no repo (Open Sans, OFL) → determinística entre macOS/Railway.
// Open Sans vai até ExtraBold (800); chamadas a '900' caem em 800 (nearest).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_FONT_DIR = path.resolve(__dirname, '../../assets/fonts');

const BUNDLED_FONTS = [
  { file: 'OpenSans-Regular.ttf', label: 'Regular(400)' },
  { file: 'OpenSans-Bold.ttf', label: 'Bold(700)' },
  { file: 'OpenSans-ExtraBold.ttf', label: 'ExtraBold(800)' },
];

// Fallbacks de sistema (Linux apt / macOS) caso os bundlados sumam.
const SYSTEM_FONT_FALLBACKS = [
  '/usr/share/fonts/truetype/open-sans/OpenSans-Regular.ttf',
  '/usr/share/fonts/truetype/open-sans/OpenSans-Bold.ttf',
  '/usr/share/fonts/truetype/open-sans/OpenSans-ExtraBold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  '/System/Library/Fonts/Supplemental/Arial Black.ttf',
];

let registeredCount = 0;
for (const f of BUNDLED_FONTS) {
  const p = path.join(BUNDLED_FONT_DIR, f.file);
  if (fs.existsSync(p)) {
    GlobalFonts.registerFromPath(p, 'AppFont');
    registeredCount++;
    console.log(`[Studio] Fonte ${f.label} registrada (bundled)`);
  } else {
    console.warn(`[Studio] Fonte ${f.label} bundled não encontrada em ${p}`);
  }
}
if (registeredCount === 0) {
  for (const p of SYSTEM_FONT_FALLBACKS) {
    if (fs.existsSync(p)) {
      GlobalFonts.registerFromPath(p, 'AppFont');
      registeredCount++;
      console.log(`[Studio] Fonte de sistema registrada (fallback): ${p}`);
    }
  }
}
const FONT = registeredCount > 0 ? 'AppFont' : 'sans-serif';
console.log(`[Studio] Usando família de fonte: ${FONT} (${registeredCount} face(s))`);

// ── Dimensões do canvas (Meta Ads 1:1) ─────────────────────────────────────
const W = 1080;
const H = 1080;
const cx = W / 2;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = any;

// Pesos como strings CSS. Black mapeia para 800 (Open Sans não tem 900).
const wRegular = 'normal';
const wBold = 'bold';
const wXBold = '800';
const wBlack = '800';
const font = (weight: string, size: number) => `${weight} ${size}px ${FONT}`;

// ── Cor / contraste (WCAG) ──────────────────────────────────────────────────

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

function hexToRgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Luminância relativa (WCAG), 0 a 1. */
function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores (1 a 21). */
function getContrastRatio(hexA: string, hexB: string): number {
  const l1 = getLuminance(hexA);
  const l2 = getLuminance(hexB);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Branco ou preto, o que tiver melhor contraste contra bgColor. */
function pickTextOn(bgColor: string): string {
  return getContrastRatio('#FFFFFF', bgColor) >= getContrastRatio('#000000', bgColor) ? '#FFFFFF' : '#000000';
}

/**
 * Garante contraste >= minRatio entre textColor e bgColor. Ajusta a luminância
 * de textColor preservando matiz/saturação; se nem no limite atingir, cai para
 * preto/branco — o que tiver melhor contraste.
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
    if (ratio > bestRatio) { best = candidate; bestRatio = ratio; }
    if (ratio >= minRatio) return candidate;
  }
  return bestRatio >= minRatio ? best : pickTextOn(bgColor);
}

/** Deriva uma versão escura da cor (mesma matiz/saturação, L=20%). */
function derivarDark(hex: string): string {
  const [h, s] = rgbToHsl(...hexToRgb(hex));
  const [r, g, b] = hslToRgb(h, s, 0.2);
  return rgbToHex(r, g, b);
}

/** Clareia a cor em deltaL na luminância HSL (0-1). */
function lightenHex(hex: string, deltaL: number): string {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const [r, g, b] = hslToRgb(h, s, Math.min(1, l + deltaL));
  return rgbToHex(r, g, b);
}

/** PRNG determinístico (LCG) — jitter reproduzível por seed (sem Math.random). */
function makeRng(seed: number): () => number {
  let s = Math.abs(Math.round(seed)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ── Primitivas de desenho ───────────────────────────────────────────────────

function drawRoundRect(ctx: Ctx, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Desenha `img` em (x,y,w,h) com crop "cover" (preenche a área, recorta excesso, centrado). */
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

/** Gradiente vertical (topo→base) numa área. Reusado pelo gradiente adaptativo. */
function drawGradientOverlay(ctx: Ctx, x: number, y: number, w: number, h: number, colorHex: string, alphaTop: number, alphaBottom: number) {
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, hexToRgba(colorHex, alphaTop));
  grad.addColorStop(1, hexToRgba(colorHex, alphaBottom));
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}

/** Logo dentro de chip claro arredondado, em tamanho fixo. */
function drawLogoBadge(ctx: Ctx, logo: Image, x: number, y: number, size: number) {
  drawRoundRect(ctx, x, y, size, size, size * 0.12);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  const pad = size * 0.14;
  drawCoverImage(ctx, logo, x + pad, y + pad, size - pad * 2, size - pad * 2);
}

// ── Utilitários novos dos arquétipos ────────────────────────────────────────

/** Vinheta radial: escurece as bordas focando o centro. */
function drawRadialVignette(ctx: Ctx, centerX = 540, centerY = 540, radius = 800, intensity = 0.3): void {
  ctx.save();
  const g = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${intensity})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** Raios divergentes do centro (efeito "sol"). Jitter determinístico por seed. */
function drawSunburst(ctx: Ctx, centerX: number, centerY: number, raysCount = 28, baseColorHex: string, opacity = 0.35): void {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const rayColor = lightenHex(baseColorHex, 0.12);
  const rng = makeRng(centerX + centerY + raysCount);
  const reach = Math.hypot(W, H); // ultrapassa as bordas
  for (let i = 0; i < raysCount; i++) {
    const baseAngle = (i / raysCount) * 360 + (rng() * 8 - 4); // jitter -4..+4
    const angularWidth = (i % 2 === 0 ? 4 : 7) * (Math.PI / 180);
    const a = baseAngle * (Math.PI / 180);
    const a1 = a - angularWidth / 2;
    const a2 = a + angularWidth / 2;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + Math.cos(a1) * reach, centerY + Math.sin(a1) * reach);
    ctx.lineTo(centerX + Math.cos(a2) * reach, centerY + Math.sin(a2) * reach);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(rayColor, opacity);
    ctx.fill();
  }
  ctx.restore(); // restaura globalCompositeOperation para 'source-over'
}

/** Estrela irregular ("explode") para selo de preço. Jitter determinístico. */
function drawStarburst(ctx: Ctx, centerX: number, centerY: number, pointsCount = 14, rExt = 95, rInt = 75, colorHex: string, rotationDeg = -8): void {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(rotationDeg * (Math.PI / 180));
  const rng = makeRng(centerX + centerY + pointsCount);
  const total = pointsCount * 2;
  ctx.beginPath();
  for (let i = 0; i < total; i++) {
    const isExt = i % 2 === 0;
    const ang = (i / total) * Math.PI * 2 - Math.PI / 2;
    const r = isExt ? rExt + (rng() * 16 - 8) : rInt; // ±8px só nas pontas externas
    const px = Math.cos(ang) * r;
    const py = Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = colorHex;
  ctx.fill();
  ctx.restore();
}

/** Divide o canvas em duas zonas por uma linha diagonal. */
function drawDiagonalSplit(ctx: Ctx, leftY = 460, rightY = 380, topColorHex: string, bottomColorHex: string): void {
  ctx.fillStyle = topColorHex;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, rightY); ctx.lineTo(0, leftY);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = bottomColorHex;
  ctx.beginPath();
  ctx.moveTo(0, leftY); ctx.lineTo(W, rightY); ctx.lineTo(W, H); ctx.lineTo(0, H);
  ctx.closePath(); ctx.fill();
}

/** Luminância média (0-1) de uma região do canvas — amostragem com passo. */
function sampleLuminanceInRegion(canvas: Canvas, x1: number, y1: number, x2: number, y2: number): number {
  const c = canvas.getContext('2d') as Ctx;
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);
  const d = c.getImageData(x1, y1, w, h).data as Uint8ClampedArray;
  let sum = 0;
  let n = 0;
  const stride = 4 * 8; // amostra 1 a cada 8 pixels
  for (let i = 0; i < d.length; i += stride) {
    sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    n++;
  }
  return n > 0 ? sum / n : 0.5;
}

/** Variância de luminância (0-1) de uma região — alto = região com "assunto". */
function sampleVarianceInRegion(canvas: Canvas, x1: number, y1: number, x2: number, y2: number): number {
  const c = canvas.getContext('2d') as Ctx;
  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);
  const d = c.getImageData(x1, y1, w, h).data as Uint8ClampedArray;
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  const stride = 4 * 8;
  for (let i = 0; i < d.length; i += stride) {
    const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    sum += lum; sum2 += lum * lum; n++;
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

/**
 * Gradiente de leitura adaptativo: amostra a luminância da faixa e calcula a
 * opacity de um overlay preto (fromY→toY) suficiente para texto branco passar
 * minContrastRatio. Limita opacity entre 0.60 e 0.92.
 */
async function drawAdaptiveReadabilityGradient(ctx: Ctx, canvas: Canvas, fromY = 540, toY = 1080, minContrastRatio = 4.5): Promise<void> {
  const avgLum = sampleLuminanceInRegion(canvas, 0, fromY, W, toY);
  // contraste = 1.05 / (bgLum_overlay + 0.05) >= minRatio
  // bgLum_overlay = avgLum * (1 - opacity)  →  opacity >= 1 - (target / avgLum)
  const targetBgLum = 1.05 / minContrastRatio - 0.05;
  let opacity = avgLum > 0 ? 1 - targetBgLum / avgLum : 0.92;
  opacity = Math.max(0.6, Math.min(0.92, opacity));
  drawGradientOverlay(ctx, 0, fromY, W, toY - fromY, '#000000', 0, opacity);
}

/** Check (✓) com traço curvo (handwritten), não geométrico perfeito. */
function drawHandwrittenCheck(ctx: Ctx, x: number, y: number, size = 24, colorHex: string): void {
  ctx.save();
  ctx.strokeStyle = colorHex;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.5);
  ctx.quadraticCurveTo(x + size * 0.35, y + size * 0.8, x + size * 0.4, y + size * 0.85);
  ctx.quadraticCurveTo(x + size * 0.55, y + size * 0.4, x + size, y);
  ctx.stroke();
  ctx.restore();
}

/** Barra editorial vertical (separador estilo revista). */
function drawEditorialBar(ctx: Ctx, x: number, yTop: number, yBottom: number, colorHex: string, width = 7): void {
  ctx.fillStyle = colorHex;
  ctx.fillRect(x, yTop, width, Math.max(0, yBottom - yTop));
}

/**
 * Quebra de texto com limite de linhas + elipse, alinhamento e retorno do
 * y-final (baseline da última linha) para posicionar elementos seguintes.
 */
function wrapTextAdvanced(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 0,
  textAlign: 'left' | 'center' | 'right' = 'left',
): { linesRendered: number; finalY: number } {
  ctx.textAlign = textAlign;
  const words = (text ?? '').split(' ').filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);

  let out = lines;
  if (maxLines > 0 && lines.length > maxLines) {
    out = lines.slice(0, maxLines);
    let last = out[maxLines - 1];
    while (last.length > 0 && ctx.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1);
    }
    out[maxLines - 1] = `${last}…`;
  }

  let cy = y;
  for (const l of out) {
    ctx.fillText(l, x, cy);
    cy += lineHeight;
  }
  return { linesRendered: out.length, finalY: y + Math.max(0, out.length - 1) * lineHeight };
}

/**
 * Subtítulo com um trecho destacado em cor de acento (offer_burst), centrado em
 * centerX/y. Quebra por palavra respeitando maxWidth e reduz a fonte se passar
 * de 2 linhas (piso 22px) — NUNCA ultrapassa a borda do canvas. O destaque é
 * preservado por palavra (overlap com o range do subtitle_highlight).
 */
function drawHighlightedSubtitle(ctx: Ctx, full: string, highlight: string | undefined, centerX: number, y: number, baseSize: number, accentColor: string, maxWidth = 960): void {
  const hlStart = highlight ? full.toLowerCase().indexOf(highlight.toLowerCase()) : -1;
  const hlEnd = hlStart >= 0 ? hlStart + highlight!.length : -1;

  // Tokeniza em palavras, marcando quais caem dentro do range do destaque.
  type Word = { text: string; hl: boolean };
  const words: Word[] = [];
  let offset = 0;
  for (const w of full.split(' ')) {
    const start = offset;
    const end = offset + w.length;
    offset = end + 1; // +1 do espaço
    if (w) words.push({ text: w, hl: hlStart >= 0 && start < hlEnd && end > hlStart });
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  type Line = { words: Word[]; width: number };
  const layout = (size: number): Line[] => {
    ctx.font = font(wRegular, size);
    const sp = ctx.measureText(' ').width;
    const wWidth = (wd: Word) => { ctx.font = font(wd.hl ? wBold : wRegular, size); return ctx.measureText(wd.text).width; };
    const lines: Line[] = [];
    let cur: Word[] = [];
    let curW = 0;
    for (const wd of words) {
      const ww = wWidth(wd);
      const add = cur.length ? sp + ww : ww;
      if (cur.length && curW + add > maxWidth) {
        lines.push({ words: cur, width: curW });
        cur = [wd];
        curW = ww;
      } else {
        cur.push(wd);
        curW += add;
      }
    }
    if (cur.length) lines.push({ words: cur, width: curW });
    return lines;
  };

  let size = baseSize;
  let lines = layout(size);
  while (lines.length > 2 && size > 22) {
    size -= 2;
    lines = layout(size);
  }

  const lineH = size * 1.25;
  let cy = y - ((lines.length - 1) * lineH) / 2;
  for (const ln of lines) {
    ctx.font = font(wRegular, size);
    const sp = ctx.measureText(' ').width;
    let x = centerX - ln.width / 2;
    for (const wd of ln.words) {
      ctx.font = font(wd.hl ? wBold : wRegular, size);
      ctx.fillStyle = wd.hl ? accentColor : '#FFFFFF';
      ctx.fillText(wd.text, x, cy);
      x += ctx.measureText(wd.text).width + sp;
    }
    cy += lineH;
  }
}

/** Reduz o tamanho da fonte até o texto caber em maxWidth (piso minSize). */
function fitFontSize(ctx: Ctx, text: string, maxWidth: number, baseSize: number, minSize: number, weight: string): number {
  let s = baseSize;
  ctx.font = font(weight, s);
  while (ctx.measureText(text).width > maxWidth && s > minSize) {
    s -= 2;
    ctx.font = font(weight, s);
  }
  return s;
}

// ── Renderers por arquétipo ─────────────────────────────────────────────────

/** editorial_headline — foto no topo, faixa preta com manchete + subheadline. */
async function drawEditorialHeadline(ctx: Ctx, data: CreativeData, canvas: Canvas, logo: Image | null): Promise<void> {
  if (!data.background_image_url) throw new Error('editorial_headline requer background_image_url');
  const img = await loadImage(data.background_image_url);

  // 1-3. Foto no topo + faixa preta inferior
  drawCoverImage(ctx, img, 0, 0, W, 640);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 640, W, 440);

  // 4. Logo sobre a foto (canto superior esquerdo)
  if (logo) drawLogoBadge(ctx, logo, 64, 36, 110);

  // 5. Manchete — cor com contraste >= 7:1 contra preto
  const headlineColor = ensureReadable(data.highlight_color || '#F4C430', '#000000', 7.0);
  ctx.fillStyle = headlineColor;
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(wBlack, 54);
  const yTopHeadline = 720 - 50;
  const r1 = wrapTextAdvanced(ctx, (data.headline || '').toUpperCase(), 100, 720, 920, 58, 5, 'left');

  // 6. Subheadline
  ctx.fillStyle = '#FFFFFF';
  ctx.font = font(wRegular, 30);
  const r2 = wrapTextAdvanced(ctx, data.subheadline || '', 100, r1.finalY + 56, 920, 39, 4, 'left');

  // 7. Barra editorial vertical
  const lPrimary = getLuminance(data.brand_colors.primary);
  const barColor = lPrimary >= 0.3 && lPrimary <= 0.65 ? data.brand_colors.primary : '#D7263D';
  drawEditorialBar(ctx, 64, yTopHeadline, r2.finalY, barColor, 7);
}

/** offer_burst — fundo na cor da marca, sunburst, badge de oferta e hero opcional. */
async function drawOfferBurst(ctx: Ctx, data: CreativeData, canvas: Canvas, logo: Image | null): Promise<void> {
  // 1. Fundo legível para texto branco
  const bg = ensureReadable(data.brand_colors.primary, '#FFFFFF', 4.5);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 2-3. Vinheta + sunburst
  drawRadialVignette(ctx, 540, 540, 800, 0.3);
  drawSunburst(ctx, 540, 540, 28, data.brand_colors.primary, 0.35);

  // 4. Headline
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(wXBold, 72);
  wrapTextAdvanced(ctx, (data.headline || '').toUpperCase(), 540, 130, 920, 86, 2, 'center');

  // 5. Badge pill (gradiente escuro)
  const pillW = 820;
  const pillH = 180;
  const pillX = 540 - pillW / 2;
  const pillY = 360 - pillH / 2;
  ctx.save();
  const grd = ctx.createLinearGradient(540, pillY, 540, pillY + pillH);
  grd.addColorStop(0, '#3A3A3A');
  grd.addColorStop(1, '#1F1F1F');
  drawRoundRect(ctx, pillX, pillY, pillW, pillH, 90);
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.restore();

  // 6. Ilhós do badge
  for (const ox of [130, 950]) {
    ctx.beginPath();
    ctx.arc(ox, 360, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#1A1A1A';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0F0F0F';
    ctx.stroke();
  }

  // 7. Offer text com auto-shrink
  const offerColor = ensureReadable(data.brand_colors.accent || '#F2B81E', '#2B2B2B', 4.5);
  const offerText = (data.offer_text || '').toUpperCase();
  let offerSize = 140;
  ctx.font = font(wBlack, offerSize);
  while (ctx.measureText(offerText).width > 700 && offerSize > 40) {
    offerSize -= 10;
    ctx.font = font(wBlack, offerSize);
  }
  ctx.fillStyle = offerColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(offerText, 540, 360);

  // 8. Subtítulo com highlight
  if (data.subtitle) {
    drawHighlightedSubtitle(ctx, data.subtitle, data.subtitle_highlight, 540, 540, 34, offerColor);
  }

  // 9. Hero image (PNG transparente)
  if (data.hero_image_url) {
    try {
      const hero = await loadImage(data.hero_image_url);
      const heroH = 480;
      const heroW = heroH * (hero.width / hero.height);
      ctx.drawImage(hero, 560 - heroW / 2, (H - 10) - heroH, heroW, heroH);
    } catch (err) {
      console.warn('[Studio] offer_burst: falha ao carregar hero_image_url:', (err as Error).message);
    }
  }

  // 10. Logo (canto superior direito)
  if (data.includeLogo !== false && logo) {
    drawLogoBadge(ctx, logo, W - 32 - 80, 32, 80);
  }
}

/** split_diagonal_product — split diagonal, mockup cruzando a linha, benefícios e CTA. */
async function drawSplitDiagonalProduct(ctx: Ctx, data: CreativeData, canvas: Canvas, logo: Image | null): Promise<void> {
  if (!data.product_image_url) throw new Error('split_diagonal_product requer product_image_url');

  // 1-2. Split diagonal
  const darkColor = data.brand_colors.dark || derivarDark(data.brand_colors.primary);
  drawDiagonalSplit(ctx, 460, 380, data.brand_colors.primary, darkColor);

  // 3. Headline
  ctx.fillStyle = '#FFFFFF';
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(wBlack, 88);
  wrapTextAdvanced(ctx, (data.headline || '').toUpperCase(), 76, 160, 420, 81, 4, 'left');

  // 4-5. Mockup do produto (com sombra projetada), cruzando a diagonal
  const prod = await loadImage(data.product_image_url);
  const prodH = 720;
  const prodW = prodH * (prod.width / prod.height);
  let yCenter = 470;
  const diagonalAtX750 = 380 + (460 - 380) * (750 / W); // ~436
  const prodTop = yCenter - prodH / 2;
  const prodBottom = yCenter + prodH / 2;
  if (prodTop > diagonalAtX750 || prodBottom < diagonalAtX750) {
    yCenter = diagonalAtX750 + prodH / 2 - prodH * 0.3;
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 20;
  ctx.drawImage(prod, 750 - prodW / 2, yCenter - prodH / 2, prodW, prodH);
  ctx.restore();

  // 6. Selo de preço
  if (data.price_text) {
    drawStarburst(ctx, 925, 155, 14, 95, 75, '#FAE04A', -8);
    ctx.save();
    ctx.translate(925, 155);
    ctx.rotate(-8 * (Math.PI / 180));
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font(wBold, 30);
    const parts = data.price_text.split(/\s+/);
    if (parts.length > 1) {
      ctx.fillText(parts[0], 0, -16);
      ctx.fillText(parts.slice(1).join(' '), 0, 18);
    } else {
      ctx.fillText(data.price_text, 0, 0);
    }
    ctx.restore();
  }

  // 7. Bullets de benefícios
  ctx.textBaseline = 'alphabetic';
  let bulletY = 620;
  for (const benefit of data.benefits || []) {
    drawHandwrittenCheck(ctx, 76, bulletY - 20, 24, data.brand_colors.primary);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = font(wRegular, 34);
    // maxWidth 360 mantém os bullets à esquerda do mockup (borda ~466px),
    // evitando colisão com textos longos.
    const r = wrapTextAdvanced(ctx, benefit, 118, bulletY, 360, 44, 2, 'left');
    bulletY = r.finalY + 46;
  }

  // 8. CTA
  drawRoundRect(ctx, 590, 780, 420, 100, 4);
  ctx.fillStyle = data.brand_colors.primary;
  ctx.fill();
  ctx.fillStyle = ensureReadable('#FFFFFF', data.brand_colors.primary, 4.5);
  ctx.font = font(wBold, 38);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((data.cta || 'SAIBA MAIS').toUpperCase(), 800, 830);

  // 9. Linha de rodapé
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(76, 990);
  ctx.lineTo(1004, 990);
  ctx.stroke();
}

/** photo_immersive — foto full-bleed, gradiente adaptativo, qualifier/headline/CTA. */
async function drawPhotoImmersive(ctx: Ctx, data: CreativeData, canvas: Canvas, logo: Image | null): Promise<void> {
  if (!data.background_image_url) throw new Error('photo_immersive requer background_image_url');
  if (!logo) throw new Error('photo_immersive requer logo');
  const img = await loadImage(data.background_image_url);
  if (img.width < 800) throw new Error('photo_immersive requer foto com pelo menos 800px de largura');
  if (img.width < 1080) console.warn('[Studio] Foto abaixo de 1080px — qualidade reduzida');

  // 2-4. Foto + vinheta + gradiente adaptativo
  drawCoverImage(ctx, img, 0, 0, W, H);
  drawRadialVignette(ctx, 540, 540, 800, 0.25);
  await drawAdaptiveReadabilityGradient(ctx, canvas, 540, 1080, 4.5);

  // 5. Logo chip (obrigatório) com sombra
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.20)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  drawRoundRect(ctx, 32, 32, 140, 140, 14);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();
  drawCoverImage(ctx, logo, 32 + 16, 32 + 16, 140 - 32, 140 - 32);

  // 6. Qualifier (com sombra de texto)
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const qualifierText = (data.qualifier || '').toUpperCase();
  ctx.font = font(wBold, fitFontSize(ctx, qualifierText, 956, 38, 24, wBold));
  ctx.fillText(qualifierText, 64, 820);

  // 7. Headline
  ctx.font = font(wXBold, 56);
  wrapTextAdvanced(ctx, (data.headline || '').toUpperCase(), 64, 890, 960, 59, 2, 'left');
  ctx.restore();

  // 8. CTA
  const ctaColor = ensureReadable(data.brand_colors.primary, '#FFFFFF', 4.5);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  drawRoundRect(ctx, 64, 940, 420, 100, 4);
  ctx.fillStyle = ctaColor;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = font(wBold, 32);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const ctaText = (data.cta || 'SAIBA MAIS').toUpperCase();
  ctx.fillText(ctaText, 64 + 32, 940 + 50);
  if (data.cta_icon === 'arrow') {
    ctx.fillText('▸', 64 + 32 + ctx.measureText(ctaText).width + 16, 940 + 50);
  }
}

/** split_horizontal_photo — zona superior sólida + foto embaixo, tom institucional/energetic. */
async function drawSplitHorizontalPhoto(ctx: Ctx, data: CreativeData, canvas: Canvas, logo: Image | null): Promise<void> {
  if (!data.background_image_url) throw new Error('split_horizontal_photo requer background_image_url');
  if (!logo) throw new Error('split_horizontal_photo requer logo');
  const img = await loadImage(data.background_image_url);

  const tone = data.tone || 'institutional';
  const SPLIT_Y = 486; // 45% do canvas = linha divisória

  // 2. Zona superior sólida (contraste branco >= 7 garantido)
  let topColor = data.top_zone_color || '#3D3D3D';
  if (data.top_zone_color && getContrastRatio('#FFFFFF', topColor) < 7) topColor = '#3D3D3D';
  ctx.fillStyle = topColor;
  ctx.fillRect(0, 0, W, SPLIT_Y);

  // 3. Zona inferior: foto cover
  drawCoverImage(ctx, img, 0, SPLIT_Y, W, H - SPLIT_Y);

  // 4. Qualifier
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const shQualifier = tone === 'energetic' ? (data.qualifier || '').toUpperCase() : (data.qualifier || '');
  const shWeight = tone === 'energetic' ? wBold : wRegular;
  ctx.font = font(shWeight, fitFontSize(ctx, shQualifier, 952, 36, 24, shWeight));
  ctx.fillText(shQualifier, 64, 130);

  // 5. Headline
  ctx.font = font(wXBold, 64);
  wrapTextAdvanced(ctx, tone === 'energetic' ? (data.headline || '').toUpperCase() : (data.headline || ''), 64, 210, 950, 67, 2, 'left');

  // 6. CTA
  let ctaBg: string;
  let ctaText: string;
  if (tone === 'institutional') {
    ctaBg = '#FFFFFF';
    ctaText = topColor;
  } else {
    ctaBg = ensureReadable(data.brand_colors.primary, '#FFFFFF', 4.5);
    ctaText = '#FFFFFF';
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.15)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  drawRoundRect(ctx, 64, 280, 360, 88, 2);
  ctx.fillStyle = ctaBg;
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = ctaText;
  ctx.font = font(wBold, 26);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const cta = (data.cta || 'SAIBA MAIS').toUpperCase();
  ctx.fillText(cta, 64 + 28, 280 + 44);
  if (data.cta_icon === 'arrow') {
    ctx.fillText('›', 64 + 28 + ctx.measureText(cta).width + 14, 280 + 44);
  }

  // 7. Logo chip (obrigatório) — heurística para não cobrir o assunto da foto
  let chipX = 64;
  if (sampleVarianceInRegion(canvas, 40, SPLIT_Y, 240, SPLIT_Y + 140) > 0.04) {
    chipX = W - 64 - 140; // região agitada → move para a direita
  }
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  drawRoundRect(ctx, chipX, SPLIT_Y - 70, 140, 140, 14);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.restore();
  drawCoverImage(ctx, logo, chipX + 18, SPLIT_Y - 70 + 18, 140 - 36, 140 - 36);
}

// ── Dispatcher ───────────────────────────────────────────────────────────────
const LAYOUT_RENDERERS: Record<CreativeLayout, (ctx: Ctx, data: CreativeData, canvas: Canvas, logo: Image | null) => Promise<void>> = {
  editorial_headline: drawEditorialHeadline,
  offer_burst: drawOfferBurst,
  split_diagonal_product: drawSplitDiagonalProduct,
  photo_immersive: drawPhotoImmersive,
  split_horizontal_photo: drawSplitHorizontalPhoto,
};
// Layouts antigos removidos. Assets com layouts legados em complianceNotes
// (product_hero, text_focus, offer_highlight, testimonial_style) não podem ser
// regenerados — a UI trata com badge "Modelo descontinuado".

export type BrandColors = {
  primary?: string | null;
  secondary?: string | null;
  logoUrl?: string | null;
};

export async function convertHTMLToPNG(data: CreativeData, brandColors?: BrandColors): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Logo (pré-carregado; renderers que o exigem validam presença).
  const includeLogo = data.includeLogo ?? true;
  let logo: Image | null = null;
  if (includeLogo && brandColors?.logoUrl) {
    try {
      logo = await loadImage(brandColors.logoUrl);
    } catch (err) {
      console.warn('=== CANVAS failed to load logo, skipping:', err);
    }
  }

  const renderer = LAYOUT_RENDERERS[data.layout as CreativeLayout];
  if (!renderer) {
    throw new Error(`Layout não suportado pelo renderer (modelo descontinuado): ${data.layout}`);
  }

  await renderer(ctx, data, canvas, logo);

  const buffer = canvas.toBuffer('image/png');
  console.log('=== CANVAS generated buffer size:', buffer.length, '| layout:', data.layout);
  return buffer;
}
