import { eq, and } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db } from './client.js';
import { tenants, users, furyConfig } from './schema.js';

async function createDemoUser() {
  console.log('🌱 Criando usuário demo...');

  try {
    const email = process.env.DEMO_EMAIL || 'dev.fashion@fury.test';
    const password = process.env.DEMO_PASSWORD || 'Dev@12345';

    // Check existing
    const existing = await db.query.users.findFirst({
      where: eq(users.email, email),
    });

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
        role: 'owner',
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
