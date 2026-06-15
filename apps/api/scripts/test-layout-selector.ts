// Script de teste do Layout Selector Agent — roda 5 cenários e reporta o
// arquétipo escolhido, confiança, justificativa e headline sugerida.
//
// Run: DEEPSEEK_API_KEY=sk-... node --loader ts-node/esm apps/api/scripts/test-layout-selector.ts
import 'dotenv/config';
import { selectLayout, type LayoutSelectorInput } from '../src/services/layout-selector.service.js';

type Scenario = {
  nome: string;
  esperado: string;
  input: LayoutSelectorInput;
};

const BRAND: LayoutSelectorInput['brand'] = {
  primary_color: '#EA580C',
  accent_color: '#FACC15',
};

const SCENARIOS: Scenario[] = [
  {
    nome: '1. Curso de Finanças (oferta numérica, sem mockup/logo)',
    esperado: 'offer_burst',
    input: {
      tenantId: 'test',
      briefing: {
        product: 'Curso de Finanças Pessoais',
        promise: 'Livre-se das dívidas em 3 meses',
        offer: '50% OFF',
        audience: 'endividados entre 25-40 anos',
        objective: 'conversion',
      },
      assets: { hasProductImage: false, hasLogo: false },
      brand: BRAND,
    },
  },
  {
    nome: '2. Páscoa Sem Glúten (mockup e-book + logo)',
    esperado: 'split_diagonal_product',
    input: {
      tenantId: 'test',
      briefing: {
        product: 'E-book Páscoa Sem Glúten',
        promise: 'Receitas saborosas sem restrição',
        audience: 'intolerantes ao glúten',
        objective: 'conversion',
      },
      assets: { hasProductImage: true, productImageUrl: 'https://example.com/ebook-mockup.png', hasLogo: true },
      brand: BRAND,
    },
  },
  {
    nome: '3. Restaurante Fogo & Forno (foto de pizza + logo)',
    esperado: 'photo_immersive ou split_horizontal_photo',
    input: {
      tenantId: 'test',
      briefing: {
        product: 'Restaurante Fogo & Forno',
        promise: 'Pizzas artesanais direto do forno — buffet a partir de R$ 54,99',
        audience: 'famílias da região, 25-55 anos',
        objective: 'consideration',
      },
      assets: { hasProductImage: true, productImageUrl: 'https://example.com/pizza.jpg', hasLogo: true },
      brand: BRAND,
    },
  },
  {
    nome: '4. Nutricionista Dra. Ana (conteúdo, foto de cena, logo)',
    esperado: 'editorial_headline',
    input: {
      tenantId: 'test',
      briefing: {
        product: 'Conteúdo da Nutricionista Dra. Ana',
        promise: 'O perigo invisível nas festas para quem tem intolerância alimentar',
        audience: 'mulheres 30-50 com intolerância alimentar',
        objective: 'content',
      },
      assets: { hasProductImage: false, hasLogo: true },
      brand: BRAND,
    },
  },
  {
    nome: '5. Sérum Facial Premium (oferta "GRÁTIS" + foto produto + logo)',
    esperado: 'offer_burst',
    input: {
      tenantId: 'test',
      briefing: {
        product: 'Sérum Facial Premium',
        promise: 'Pele renovada em 30 dias',
        offer: 'GRÁTIS uma amostra',
        audience: 'mulheres 25-45 interessadas em beleza',
        objective: 'conversion',
      },
      assets: { hasProductImage: true, productImageUrl: 'https://example.com/serum.png', hasLogo: true },
      brand: BRAND,
    },
  },
];

async function run() {
  if (!process.env.DEEPSEEK_API_KEY) {
    console.error('DEEPSEEK_API_KEY não configurada — exporte a chave antes de rodar.');
    process.exit(1);
  }

  for (const sc of SCENARIOS) {
    const out = await selectLayout(sc.input);
    const ok = sc.esperado.includes(out.layout) ? '✅' : '⚠️';
    console.log(`\n${ok} ${sc.nome}`);
    console.log(`   esperado:   ${sc.esperado}`);
    console.log(`   escolhido:  ${out.layout}  (confidence ${out.confidence})`);
    console.log(`   justificativa: ${out.justification}`);
    console.log(`   headline sugerida: ${out.suggested_fields.headline ?? '(nenhuma)'}`);
  }
  console.log('\nConcluído.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
