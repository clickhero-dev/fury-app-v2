import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './client.js';
import * as schema from './schema.js';

const SEED_PASSPHRASE = process.env.TOKEN_ENCRYPTION_KEY || 'fury-default-key';

function encryptAccessToken(token: string): string {
  const iv = randomBytes(16);
  const key = scryptSync(SEED_PASSPHRASE, 'salt', 32);
  const cipher = createCipheriv('aes-256-cbc', key, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

async function seedDatabase() {
  console.log('🌱 Iniciando seed do banco de dados...');

  try {
    // Clear existing data
    console.log('🗑️ Limpando dados existentes...');

    await db.delete(schema.furyInsights);
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

    console.log(
      `✅ Tenants criados: ${fashionTenant.name}, ${dentalTenant.name}`
    );

    // Create users with bcrypt
    console.log('👤 Criando usuários...');

    const fashionPasswordHash = await bcrypt.hash('Dev@12345', 12);
    const dentalPasswordHash = await bcrypt.hash('Dev@12345', 12);

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

    console.log(
      `✅ Usuários criados: ${fashionUser.email}, ${dentalUser.email}`
    );

    // Create meta connections
    console.log('🔗 Criando conexões Meta...');

    await db.insert(schema.metaConnections).values([
      {
        tenantId: fashionTenant.id,
        metaUserId: 'mock_user_001',
        accessToken: encryptAccessToken('mock_access_token_dev'),
        adAccounts: [
          {
            id: 'act_123456',
            name: 'Loja Fashion SP Ads',
            account_status: 1,
            currency: 'BRL',
          },
        ] as unknown as any,
      },
      {
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
      },
    ]);

    console.log('✅ Meta connections criadas');

    // Create campaigns
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
            spend: 21000000,
            impressions: 68000,
            clicks: 1820,
            ctr: 2.68,
            cpm: 3088,
            cpa: 420000,
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
            cpa: 885000,
            roas: 1.8,
            conversions: 9,
            date_preset: 'last_7d',
          } as unknown as any,
        },
      ])
      .returning();

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
            cpa: 1220000,
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
            cpa: 1440000,
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
            cpa: 800000,
            roas: 2.1,
            conversions: 6,
            date_preset: 'last_7d',
          } as unknown as any,
        },
      ])
      .returning();

    console.log(
      `✅ ${fashionCampaigns.length + dentalCampaigns.length} campanhas criadas`
    );

    // Create client goals
    console.log('🎯 Criando objetivos de clientes...');

    await db.insert(schema.clientGoals).values([
      {
        tenantId: fashionTenant.id,
        objective: 'aumentar_vendas',
        monthlyBudget: {
          amount: 500000,
          currency: 'BRL',
        } as unknown as any,
        targetCpa: {
          amount: 500000,
          currency: 'BRL',
        } as unknown as any,
        niche: 'moda feminina',
      },
      {
        tenantId: dentalTenant.id,
        objective: 'gerar_leads',
        monthlyBudget: {
          amount: 300000,
          currency: 'BRL',
        } as unknown as any,
        targetCpa: {
          amount: 1500000,
          currency: 'BRL',
        } as unknown as any,
        niche: 'odontologia estética',
      },
    ]);

    console.log('✅ Client goals criados');

    // Create fury insights
    console.log('💡 Criando Fury Insights...');

    await db.insert(schema.furyInsights).values([
      {
        tenantId: fashionTenant.id,
        campaignId: fashionCampaigns[2].id,
        suggestionType: 'campaign_pause',
        suggestionData: {
          type: 'campaign_pause',
          priority: 'high',
          title: 'Pausar campanha com CPA acima da meta',
          description:
            'A campanha Prospecção Fria está com CPA de R$88,50, 77% acima da meta de R$50,00.',
          expectedImpact: 'Redução de 15-20% no CPA médio',
        } as unknown as any,
      },
      {
        tenantId: fashionTenant.id,
        campaignId: fashionCampaigns[1].id,
        suggestionType: 'budget_increase',
        suggestionData: {
          type: 'budget_increase',
          priority: 'medium',
          title: 'Aumentar orçamento da campanha com melhor ROAS',
          description:
            'A campanha Retargeting Carrinho tem ROAS de 5.2x.',
          expectedImpact: 'Aumento de 18-22% em conversões',
        } as unknown as any,
      },
      {
        tenantId: dentalTenant.id,
        campaignId: dentalCampaigns[0].id,
        suggestionType: 'campaign_optimize',
        suggestionData: {
          type: 'campaign_optimize',
          priority: 'high',
          title: 'Otimizar campanha de leads',
          description:
            'A campanha Leads Implante tem CPA elevado.',
          expectedImpact: 'Redução potencial de 15-25% no CPA',
        } as unknown as any,
      },
    ]);

    console.log('✅ Fury Insights criados');

    console.log('\n✅ Seed completed successfully!');
    console.log('\n📊 Summary:');
    console.log('   ✓ Tenants: 2');
    console.log('   ✓ Users: 2');
    console.log('   ✓ Meta Connections: 2');
    console.log(
      `   ✓ Campaigns: ${fashionCampaigns.length + dentalCampaigns.length}`
    );
    console.log('   ✓ Client Goals: 2');
    console.log('   ✓ Fury Insights: 3');

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