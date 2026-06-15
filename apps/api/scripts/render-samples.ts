// Temporary script — generates sample PNGs for the 4 creative layouts so the
// renderer output can be visually inspected before committing.
// Run with: node --loader ts-node/esm apps/api/scripts/render-samples.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from '@napi-rs/canvas';
import { convertHTMLToPNG, type BrandColors } from '../src/services/html-to-png.service.js';
import type { CreativeData } from '../src/services/creative-generator.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '_samples');
fs.mkdirSync(outDir, { recursive: true });

// NOTA (Prompt 4): os renderers por arquétipo ainda não foram implementados.
// Este script compila com o novo contrato, mas a saída visual só fica correta
// após o Prompt 4 reescrever os renderers e este script.
const LAYOUTS: CreativeData['layout'][] = [
  'editorial_headline',
  'offer_burst',
  'split_diagonal_product',
  'photo_immersive',
  'split_horizontal_photo',
];

const baseData: Omit<CreativeData, 'layout' | 'productImageUrl' | 'includeLogo'> = {
  headline: 'Buffet a partir de R$ 54,99',
  primary_text: 'Pizza artesanal, massas frescas e sobremesas todos os dias da semana, em um ambiente acolhedor para toda a família.', // @deprecated legado — renderer atual ainda lê
  subheadline: 'Válido de segunda a sexta',
  cta: 'Conheça agora',
  color_scheme: 'brand_orange', // @deprecated legado
  businessName: 'Fogo & Forno',
  brand_colors: { primary: '#EA580C' },
};

// Cor de marca legível — roxo claro, contraste suficiente sobre fundo escuro.
const GOOD_BRAND_COLORS: BrandColors = { primary: '#A78BFA', secondary: '#CCCCCC' };

// Cor de marca propositalmente ilegível — roxo escuro #6D28D9 sobre fundo escuro
// (contraste ~2:1, abaixo do minimo de 4.5:1). Usada para provar o guard de contraste.
const BAD_BRAND_COLORS: BrandColors = { primary: '#6D28D9', secondary: '#3F3F46' };

// Generate a local placeholder "product photo" so we don't depend on network access.
function makePlaceholderImage(): string {
  const c = createCanvas(1200, 1200);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 1200, 1200);
  grad.addColorStop(0, '#7C2D12');
  grad.addColorStop(1, '#FACC15');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 1200);

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(200 + i * 180, 600 + (i % 2 === 0 ? -150 : 150), 140, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.font = 'bold 70px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FOTO DO PRODUTO', 600, 600);

  const imgPath = path.join(outDir, '_placeholder-product.png');
  fs.writeFileSync(imgPath, c.toBuffer('image/png'));
  return imgPath;
}

// Generate a local placeholder logo (circular mark) so we don't depend on network access.
function makePlaceholderLogo(): string {
  const size = 400;
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');

  // fundo transparente, marca circular escura — testa o chip claro do logo
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
  ctx.fillStyle = '#1F2937';
  ctx.fill();

  ctx.font = 'bold 160px sans-serif';
  ctx.fillStyle = '#FACC15';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FF', size / 2, size / 2 + 10);

  const imgPath = path.join(outDir, '_placeholder-logo.png');
  fs.writeFileSync(imgPath, c.toBuffer('image/png'));
  return imgPath;
}

async function run() {
  const placeholderPath = makePlaceholderImage();
  const logoPath = makePlaceholderLogo();

  for (const layout of LAYOUTS) {
    // Sem foto, sem logo, cor de marca legivel
    const a: CreativeData = { ...baseData, layout, includeLogo: false };
    fs.writeFileSync(
      path.join(outDir, `${layout}_sem-foto_sem-logo_cor-ok.png`),
      await convertHTMLToPNG(a, GOOD_BRAND_COLORS),
    );

    // Com foto, sem logo, cor de marca legivel
    const b: CreativeData = { ...baseData, layout, productImageUrl: placeholderPath, includeLogo: false };
    fs.writeFileSync(
      path.join(outDir, `${layout}_com-foto_sem-logo_cor-ok.png`),
      await convertHTMLToPNG(b, GOOD_BRAND_COLORS),
    );

    // Com foto, com logo, cor de marca legivel
    const c: CreativeData = { ...baseData, layout, productImageUrl: placeholderPath, includeLogo: true };
    fs.writeFileSync(
      path.join(outDir, `${layout}_com-foto_com-logo_cor-ok.png`),
      await convertHTMLToPNG(c, { ...GOOD_BRAND_COLORS, logoUrl: logoPath }),
    );

    // Com foto, com logo, cor de marca PROPOSITALMENTE ilegivel (guard deve corrigir)
    const d: CreativeData = { ...baseData, layout, productImageUrl: placeholderPath, includeLogo: true };
    fs.writeFileSync(
      path.join(outDir, `${layout}_com-foto_com-logo_cor-RUIM.png`),
      await convertHTMLToPNG(d, { ...BAD_BRAND_COLORS, logoUrl: logoPath }),
    );

    console.log(`OK: ${layout} (4 variantes)`);
  }

  console.log('\nAmostras salvas em:', outDir);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
