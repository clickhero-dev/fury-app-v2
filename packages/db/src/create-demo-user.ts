import crypto from 'node:crypto';
import { db } from './client.js';
import { tenants, users, furyConfig } from './schema.js';

function simpleHash(password: string): string {
  const salt = crypto.randomBytes(16);
  const iterations = 10000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256');
  return salt.toString('hex') + ':' + hash.toString('hex') + ':' + iterations;
}

async function createDemoUser() {
  console.log('🌱 Criando usuário demo...');

  try {
    // Criar tenant demo
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: 'Fashion Demo',
        slug: 'fashion-demo',
      })
      .returning();

    console.log(`✅ Tenant criado: ${tenant.name} (${tenant.id})`);

    // Criar usuário demo
    const passwordHash = simpleHash('Dev@12345');
    const [user] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: 'dev.faury.test',
        passwordHash,
        role: 'owner',
      })
      .returning();

    console.log(`✅ Usuário criado: ${user.email}`);

    // Criar config FURY para o tenant
    await db.insert(furyConfig).values({
      tenantId: tenant.id,
      targetRoas: '4.00',
      targetCpa: '50.00',
      targetCtr: '3.00',
      targetBudgetUtilization: '80.00',
    });

    console.log('✅ Config FURY criada');
    console.log('\n🔐 Credenciais demo criadas:');
    console.log('   Email: dev.fashion@fury.test');
    console.log('   Senha: Dev@12345');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

createDemoUser();
