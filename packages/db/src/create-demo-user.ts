import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db } from './client.js';
import { tenants, users, furyConfig, plans, subscriptions } from './schema.js';

async function createDemoUser() {
  console.log('🌱 Criando usuário demo...');

  try {
    const email = process.env.DEMO_EMAIL || 'demo@fury.test';
    const password = process.env.DEMO_PASSWORD || 'Dev@12345';

    // Check existing
    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existing && existing.role !== 'demo') {
      throw new Error(`O e-mail ${email} já pertence a uma conta não-demo; escolha DEMO_EMAIL exclusivo.`);
    }

    if (existing) {
      console.log(`✅ Usuário demo já existe: ${existing.email}`);
      process.exit(0);
    }

    // Criar tenant demo
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: 'Fashion Demo',
        slug: 'fashion-demo',
      })
      .returning();

    console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

    // Criar usuário demo com bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    const [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email,
        passwordHash,
        role: 'demo',
        name: 'Fashion Demo',
      })
      .returning();

    console.log(`✅ Usuário: ${user.email}`);

    // Criar config FURY
    await db.insert(furyConfig).values({
      tenantId: tenant.id,
      targetRoas: '4.00',
      targetCpa: '50.00',
      targetCtr: '3.00',
      targetBudgetUtilization: '80.00',
    });

    // Plano próprio da demonstração: ativo, sem cobrança e sem expiração.
    let demoPlan = await db.query.plans.findFirst({ where: eq(plans.name, 'Demo') });
    if (!demoPlan) {
      [demoPlan] = await db.insert(plans).values({
        name: 'Demo',
        priceCents: 0,
        interval: 'monthly',
        features: { demo: true },
        limits: {},
        isActive: true,
      }).returning();
    }
    await db.insert(subscriptions).values({
      tenantId: tenant.id,
      planId: demoPlan.id,
      status: 'active',
      isNonExpirable: true,
    });

    console.log('✅ Config FURY criada');
    console.log('\n🔐 Credenciais demo:');
    console.log(`   Email: ${email}`);
    console.log(`   Senha: ${password}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

createDemoUser();
