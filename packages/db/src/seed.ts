import crypto from 'node:crypto';
import { db } from './client.js';
import * as schema from './schema.js';

const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update('fury-dev-seed-key-do-not-use-in-production')
  .digest();

function encryptAccessToken(token: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Simple hash function using crypto
function simpleHash(password: string): string {
  const salt = crypto.randomBytes(16);
  const iterations = 10000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256');
  return salt.toString('hex') + ':' + hash.toString('hex') + ':' + iterations;
}

async function seedDatabase() {
  console.log('🌱 Iniciando seed do banco de dados...');

  try {
    // Clear existing data
    console.log('🗑️  Limpando dados existentes...');
    await db.delete(schema.furyInsights);
    await db.delete(schema.furyConfig);
    await db.delete(schema.clientGoals);
    await db.delete(schema.campaigns);
    await db.delete(schema.metaConnections);
    await db.delete(schema.users);
    await db.delete(schema.tenants);

    // Create tenants
    console.log('👥 Criando tenants...');
    const fashionTenant = (
      await db
        .insert(schema.tenants)
        .values({
          name: 'Loja Fashion SP',
          slug: 'loja-fashion-sp',
        })
        .returning()
    )[0];

    const dentalTenant = (
      await db
        .insert(schema.tenants)
        .values({
          name: 'Clínica Dental Rio',
          slug: 'clinica-dental-rio',
        })
        .returning()
    )[0];

    console.log(`✅ Tenants criados: ${fashionTenant.name}, ${dentalTenant.name}`);

    // Create fury configs
    console.log('⚙️  Criando configurações FURY...');
    await db.insert(schema.furyConfig).values([
      {
        tenantId: fashionTenant.id,
        targetRoas: '4.00',
        targetCpa: '50.00',
        targetCtr: '3.00',
        targetBudgetUtilization: '80.00',
      },
      {
        tenantId: dentalTenant.id,
        targetRoas: '3.00',
        targetCpa: '150.00',
        targetCtr: '2.00',
        targetBudgetUtilization: '80.00',
      },
    ]);
    console.log('✅ Configurações FURY criadas');

    // Create users with simple hash
    console.log('👤 Criando usuários...');
    const fashionPasswordHash = simpleHash('Dev@12345');
    const dentalPasswordHash = simpleHash('Dev@12345');

    const fashionUser = (
      await db
        .insert(schema.users)
        .values({
          tenantId: fashionTenant.id,
          email: 'dev.fashion@fury.test',
          passwordHash: fashionPasswordHash,
          role: 'owner',
        })
        .returning()
    )[0];

    const dentalUser = (
      await db
        .insert(schema.users)
        .values({
          tenantId: dentalTenant.id,
          email: 'dev.dental@fury.test',
          passwordHash: dentalPasswordHash,
          role: 'owner',
        })
        .returning()
    )[0];

    console.log(`✅ Usuários criados: ${fashionUser.email}, ${dentalUser.email}`);

    // Create meta connections
    console.log('🔗 Criando conexões Meta...');
    const fashionMetaConnection = (
      await db
        .insert(schema.metaConnections)
        .values({
          tenantId: fashionTenant.id,
          metaUserId: 'mock_user_001',
          accessToken: encryptAccessToken('mock_access_token_dev'),
          adAccounts: [
            {
              id: 'act_111111111',
              name: 'Loja Fashion SP Ads',
              account_status: 1,
              currency: 'BRL',
            },
          ] as unknown as any,
        })
        .returning()
    )[0];

    const dentalMetaConnection = (
      await db
        .insert(schema.metaConnections)
        .values({
          tenantId: dentalTenant.id,
          metaUserId: 'mock_user_002',
          accessToken: encryptAccessToken('mock_access_token_dev'),
          adAccounts: [
            {
              id: 'act_222222222',
              name: 'Clínica Dental Rio Ads',
              account_status: 1,
              currency: 'BRL',
            },
          ] as unknown as any,
        })
        .returning()
    )[0];

    console.log(`✅ Meta connections criadas`);

    // Create campaigns for fashion tenant
    console.log('📢 Criando campanhas...');
    const fashionCampaigns = await db
      .insert(schema.campaigns)
      .values([
        {
          tenantId: fashionTenant.id,
          metaCampaignId: 'meta_camp_fashion_001',
          name: 'Campanha Verão 2026',
          status: 'active' as any,
          metrics: {
            spend: 21000000, // 210,000 em centavos
            impressions: 68000,
            clicks: 1820,
            ctr: 2.68,
            cpm: 3088,
            cpa: 420000, // 4,200 em centavos
            roas: 4.1,
            conversions: 50,
            date_preset: 'last_7d',
          } as unknown as any,
        },
        {
          tenantId: fashionTenant.id,
          metaCampaignId: 'meta_camp_fashion_002',
          name: 'Retargeting Carrinho',
          status: 'active' as any,
          metrics: {
            spend: 15000000,
            impressions: 42000,
            clicks: 1520,
            ctr: 3.62,
            cpm: 3571,
            cpa: 350000,
            roas: 5.2,
            conversions: 43,
            date_preset: 'last_7d',
          } as unknown as any,
        },
        {
          tenantId: fashionTenant.id,
          metaCampaignId: 'meta_camp_fashion_003',
          name: 'Prospecção Fria',
          status: 'paused' as any,
          metrics: {
            spend: 8000000,
            impressions: 28000,
            clicks: 680,
            ctr: 2.43,
            cpm: 2857,
            cpa: 885000, // 8,850 - 77% acima da meta
            roas: 1.8,
            conversions: 9,
            date_preset: 'last_7d',
          } as unknown as any,
        },
      ])
      .returning();

    // Create campaigns for dental tenant
    const dentalCampaigns = await db
      .insert(schema.campaigns)
      .values([
        {
          tenantId: dentalTenant.id,
          metaCampaignId: 'meta_camp_dental_001',
          name: 'Leads Implante',
          status: 'active' as any,
          metrics: {
            spend: 12000000,
            impressions: 35000,
            clicks: 980,
            ctr: 2.8,
            cpm: 3429,
            cpa: 1220000, // 12,200
            roas: 3.2,
            conversions: 10,
            date_preset: 'last_7d',
          } as unknown as any,
        },
        {
          tenantId: dentalTenant.id,
          metaCampaignId: 'meta_camp_dental_002',
          name: 'Awareness Clareamento',
          status: 'active' as any,
          metrics: {
            spend: 9000000,
            impressions: 52000,
            clicks: 1250,
            ctr: 2.4,
            cpm: 1731,
            cpa: 1440000, // 14,400
            roas: 2.8,
            conversions: 6,
            date_preset: 'last_7d',
          } as unknown as any,
        },
        {
          tenantId: dentalTenant.id,
          metaCampaignId: 'meta_camp_dental_003',
          name: 'Retargeting Site',
          status: 'paused' as any,
          metrics: {
            spend: 5000000,
            impressions: 18000,
            clicks: 450,
            ctr: 2.5,
            cpm: 2778,
            cpa: 800000, // 8,000
            roas: 2.1,
            conversions: 6,
            date_preset: 'last_7d',
          } as unknown as any,
        },
      ])
      .returning();

    console.log(`✅ ${fashionCampaigns.length + dentalCampaigns.length} campanhas criadas`);

    // Create client goals
    console.log('🎯 Criando objetivos de clientes...');
    await db.insert(schema.clientGoals).values([
      {
        tenantId: fashionTenant.id,
        objective: 'aumentar_vendas',
        monthlyBudget: { amount: 500000, currency: 'BRL' } as unknown as any,
        targetCpa: { amount: 500000, currency: 'BRL' } as unknown as any, // 5,000
        niche: 'moda feminina',
      },
      {
        tenantId: dentalTenant.id,
        objective: 'gerar_leads',
        monthlyBudget: { amount: 300000, currency: 'BRL' } as unknown as any,
        targetCpa: { amount: 1500000, currency: 'BRL' } as unknown as any, // 15,000
        niche: 'odontologia estética',
      },
    ]);

    console.log(`✅ Client goals criados`);

    // Create fury insights
    console.log('💡 Criando Fury Insights...');
    const fashionInsights = await db
      .insert(schema.furyInsights)
      .values([
        {
          tenantId: fashionTenant.id,
          campaignId: fashionCampaigns[2].id, // Prospecção Fria
          suggestionType: 'campaign_pause',
          suggestionData: {
            type: 'campaign_pause',
            priority: 'high',
            title: 'Pausar campanha com CPA acima da meta',
            description:
              'A campanha Prospecção Fria está com CPA de R$88,50, 77% acima da meta de R$50,00. Recomendamos pausar para revisar a segmentação.',
            expectedImpact: 'Redução de 15-20% no CPA médio',
          } as unknown as any,
        },
        {
          tenantId: fashionTenant.id,
          campaignId: fashionCampaigns[1].id, // Retargeting Carrinho
          suggestionType: 'budget_increase',
          suggestionData: {
            type: 'budget_increase',
            priority: 'medium',
            title: 'Aumentar orçamento da campanha com melhor ROAS',
            description:
              'A campanha Retargeting Carrinho tem ROAS de 5.2x. Recomendamos aumentar o orçamento em 20% para maximizar retorno.',
            expectedImpact: 'Aumento de 18-22% em conversões',
          } as unknown as any,
        },
        {
          tenantId: fashionTenant.id,
          campaignId: fashionCampaigns[0].id, // Campanha Verão
          suggestionType: 'audience_expansion',
          suggestionData: {
            type: 'audience_expansion',
            priority: 'medium',
            title: 'Expandir público-alvo',
            description:
              'A campanha Verão 2026 tem bom desempenho. Considere expandir para públicos lookalike baseados em conversores.',
            expectedImpact: 'Crescimento potencial de 10-15% em impressões',
          } as unknown as any,
        },
      ])
      .returning();

    const dentalInsights = await db
      .insert(schema.furyInsights)
      .values([
        {
          tenantId: dentalTenant.id,
          campaignId: dentalCampaigns[0].id, // Leads Implante
          suggestionType: 'campaign_optimize',
          suggestionData: {
            type: 'campaign_optimize',
            priority: 'high',
            title: 'Otimizar campanha de leads de implante',
            description:
              'A campanha Leads Implante tem CPA de R$12,20. Sugerimos revisar creative assets e públicos para reduzir custo.',
            expectedImpact: 'Redução potencial de 15-25% no CPA',
          } as unknown as any,
        },
        {
          tenantId: dentalTenant.id,
          campaignId: dentalCampaigns[1].id, // Awareness Clareamento
          suggestionType: 'campaign_pause',
          suggestionData: {
            type: 'campaign_pause',
            priority: 'medium',
            title: 'Analisar desempenho da campanha Awareness',
            description:
              'A campanha está em fase LEARNING com CPA acima da meta. Recomendamos pausar temporariamente para ajustes.',
            expectedImpact: 'Economia de 20-30% em gastos com publicidade',
          } as unknown as any,
        },
        {
          tenantId: dentalTenant.id,
          campaignId: dentalCampaigns[2].id, // Retargeting Site
          suggestionType: 'reactivate_campaign',
          suggestionData: {
            type: 'reactivate_campaign',
            priority: 'low',
            title: 'Reativar campanha de retargeting',
            description:
              'A campanha Retargeting Site está pausada. Considere reativá-la com orçamento reduzido e segmentação refinada.',
            expectedImpact: 'Recuperação de 5-10% em conversões',
          } as unknown as any,
        },
      ])
      .returning();

    console.log(`✅ ${fashionInsights.length + dentalInsights.length} Fury Insights criados`);

    console.log('\n✅ Seed completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   ✓ Tenants: 2`);
    console.log(`   ✓ Users: 2 (owners)`);
    console.log(`   ✓ Meta Connections: 2`);
    console.log(`   ✓ Campaigns: ${fashionCampaigns.length + dentalCampaigns.length}`);
    console.log(`   ✓ Client Goals: 2`);
    console.log(`   ✓ Fury Insights: ${fashionInsights.length + dentalInsights.length}`);
    console.log('\n🔐 Default credentials:');
    console.log('   Fashion: dev.fashion@fury.test / Dev@12345');
    console.log('   Dental:  dev.dental@fury.test / Dev@12345');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
}

seedDatabase();
