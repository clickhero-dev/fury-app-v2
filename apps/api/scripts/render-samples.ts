// Script de amostras — gera PNGs dos 5 arquétipos para VALIDAÇÃO VISUAL
// obrigatória antes do commit (Prompt 6). Usa placeholders locais (sem rede).
//
// TODO: quando houver fotos stock no R2, trocar os placeholders por URLs reais
// (foto de cena humana p/ editorial, comida apetitosa p/ photo_immersive).
//
// Run: npx ts-node scripts/render-samples.ts  (a partir de apps/api)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from '@napi-rs/canvas';
import { convertHTMLToPNG, type BrandColors } from '../src/services/studio/html-to-png.service.js';
import type { CreativeData } from '../src/services/studio/creative-data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/api/_samples/<timestamp>/
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(__dirname, '..', '_samples', stamp);
fs.mkdirSync(outDir, { recursive: true });

// ── Placeholders via canvas (sem assets externos) ───────────────────────────
function makePhoto(label: string, a: string, b: string): string {
  const c = createCanvas(1200, 1200);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 1200, 1200);
  grad.addColorStop(0, a);
  grad.addColorStop(1, b);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1200, 1200);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(180 + i * 190, 700 + (i % 2 === 0 ? -160 : 160), 150, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = 'bold 60px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 600, 600);
  const p = path.join(outDir, `_photo-${label.toLowerCase().replace(/\s+/g, '-')}.png`);
  fs.writeFileSync(p, c.toBuffer('image/png'));
  return p;
}

function makeProductMockup(): string {
  const c = createCanvas(820, 1040);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#111827';
  ctx.fillRect(120, 120, 560, 800);
  const grad = ctx.createLinearGradient(120, 0, 680, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.25)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
  grad.addColorStop(1, 'rgba(255,255,255,0.15)');
  ctx.fillStyle = grad;
  ctx.fillRect(120, 120, 560, 800);
  ctx.font = 'bold 44px sans-serif';
  ctx.fillStyle = '#FACC15';
  ctx.textAlign = 'center';
  ctx.fillText('E-BOOK', 400, 520);
  const p = path.join(outDir, '_product-mockup.png');
  fs.writeFileSync(p, c.toBuffer('image/png'));
  return p;
}

function makeHero(): string {
  const c = createCanvas(700, 900);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0EA5E9';
  ctx.beginPath();
  ctx.ellipse(350, 450, 230, 380, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = 'bold 56px sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HERO', 350, 450);
  const p = path.join(outDir, '_hero.png');
  fs.writeFileSync(p, c.toBuffer('image/png'));
  return p;
}

function makeLogo(): string {
  const size = 400;
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 10, 0, Math.PI * 2);
  ctx.fillStyle = '#1F2937';
  ctx.fill();
  ctx.font = 'bold 150px sans-serif';
  ctx.fillStyle = '#FACC15';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('FF', size / 2, size / 2 + 8);
  const p = path.join(outDir, '_logo.png');
  fs.writeFileSync(p, c.toBuffer('image/png'));
  return p;
}

async function save(name: string, data: CreativeData, brand: BrandColors) {
  try {
    const buf = await convertHTMLToPNG(data, brand);
    const out = path.join(outDir, `${name}.png`);
    fs.writeFileSync(out, buf);
    console.log(`OK  ${name}  →  ${out}`);
  } catch (err) {
    console.error(`ERR ${name}:`, (err as Error).message);
  }
}

async function run() {
  const scenePhoto = makePhoto('CENA', '#3b1d10', '#1F2937');
  const foodPhoto = makePhoto('COMIDA', '#7C2D12', '#b45309');
  const product = makeProductMockup();
  const hero = makeHero();
  const logo = makeLogo();

  const business = 'Fogo & Forno';

  // Sample 1 — editorial_headline
  await save('1_editorial_headline', {
    layout: 'editorial_headline',
    businessName: 'Dra. Ana Nutri',
    includeLogo: true,
    background_image_url: scenePhoto,
    headline: 'O PERIGO INVISÍVEL NAS FESTAS PARA QUEM TEM INTOLERÂNCIA',
    subheadline: 'Como especialista, a nutricionista Dra. Ana revela o que o cardápio esconde — e como se proteger sem abrir mão do sabor.',
    highlight_color: '#F4C430',
    brand_colors: { primary: '#D7263D', accent: '#F4C430' },
  }, { primary: '#D7263D', secondary: '#F4C430', logoUrl: logo });

  // Sample 2 — offer_burst
  await save('2_offer_burst', {
    layout: 'offer_burst',
    businessName: business,
    includeLogo: true,
    hero_image_url: hero,
    headline: '108 TEMPLATES DE EMAILS',
    offer_text: '50% OFF',
    subtitle: 'Necessidade ZERO de conhecimento de copy ou design',
    subtitle_highlight: 'ZERO',
    brand_colors: { primary: '#C8161D', accent: '#F2B81E' },
  }, { primary: '#C8161D', secondary: '#F2B81E', logoUrl: logo });

  // Sample 3 — split_diagonal_product
  await save('3_split_diagonal_product', {
    layout: 'split_diagonal_product',
    businessName: business,
    includeLogo: false,
    product_image_url: product,
    headline: 'PÁSCOA SEM GLÚTEN',
    benefits: ['15 Receitas que Funcionam', 'Tabela de Ingredientes', 'Tabelas de Farinhas Sem Glúten'],
    cta: 'SAIBA MAIS',
    price_text: 'R$ 49,90',
    brand_colors: { primary: '#F08475', dark: '#1F2937' },
  }, { primary: '#F08475' });

  // Sample 4 — photo_immersive
  await save('4_photo_immersive', {
    layout: 'photo_immersive',
    businessName: business,
    includeLogo: true,
    background_image_url: foodPhoto,
    qualifier: 'Buffet a partir de R$ 54,99',
    headline: 'Restaurante e Pizzaria',
    cta: 'CONHEÇA AGORA',
    cta_icon: 'arrow',
    brand_colors: { primary: '#D43F2A' },
  }, { primary: '#D43F2A', logoUrl: logo });

  // Sample 5a — split_horizontal_photo (institutional)
  await save('5a_split_horizontal_institutional', {
    layout: 'split_horizontal_photo',
    businessName: business,
    includeLogo: true,
    background_image_url: foodPhoto,
    tone: 'institutional',
    qualifier: 'Tradição em cada fatia desde 2008',
    headline: 'Restaurante e Pizzaria',
    cta: 'CONHEÇA AGORA',
    cta_icon: 'arrow',
    brand_colors: { primary: '#D43F2A' },
  }, { primary: '#D43F2A', logoUrl: logo });

  // Sample 5b — split_horizontal_photo (energetic)
  await save('5b_split_horizontal_energetic', {
    layout: 'split_horizontal_photo',
    businessName: business,
    includeLogo: true,
    background_image_url: foodPhoto,
    tone: 'energetic',
    qualifier: 'Buffet a partir de R$ 54,99',
    headline: 'Restaurante e Pizzaria',
    cta: 'PEÇA AGORA',
    cta_icon: 'arrow',
    brand_colors: { primary: '#D43F2A' },
  }, { primary: '#D43F2A', logoUrl: logo });

  console.log('\nAmostras em:', outDir);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
