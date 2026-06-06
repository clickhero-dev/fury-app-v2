import { db, plans } from '@fury/db';

async function seedPlans() {
  console.log('Seeding plans...');

  await db.insert(plans).values([
    {
      name: 'Starter',
      priceCents: 29700,
      interval: 'monthly',
      features: ['Até 5 campanhas ativas', 'Dashboard de métricas básico', 'Integração com Meta Ads', 'Relatórios mensais', 'Suporte por email'],
      isActive: true,
    },
    {
      name: 'Pro',
      priceCents: 59700,
      interval: 'monthly',
      features: ['Campanhas ilimitadas', 'Automação com regras de IA', 'Estúdio criativo completo', 'Relatórios em tempo real', 'API de integrações', 'Suporte prioritário via chat'],
      isActive: true,
    },
    {
      name: 'Enterprise',
      priceCents: 149700,
      interval: 'monthly',
      features: ['Tudo do plano Pro', 'Multi-contas e times', 'SLA 99.9% garantido', 'Gerente de conta dedicado', 'Onboarding e treinamento'],
      isActive: true,
    },
  ]).onConflictDoNothing();

  console.log('Plans seeded successfully.');
  process.exit(0);
}

seedPlans().catch((e) => { console.error(e); process.exit(1); });
