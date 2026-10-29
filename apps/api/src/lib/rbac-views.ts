// Catálogo de telas do RBAC. Tela nova = uma linha aqui e no espelho do front (apps/web/src/lib/rbac-views.ts).
// Sincronizado em ady_rbac_views no startup. Key com "." herda o bloqueio do pai (campaigns → campaigns.create).
export interface RbacViewEntry {
  key: string;
  description: string;
  // serviços (rbac-services) bloqueados junto com a tela
  services?: string[];
}

export const RBAC_VIEWS: readonly RbacViewEntry[] = [
  { key: 'dashboard', description: 'Dashboard', services: ['dashboard'] },
  { key: 'goals', description: 'Metas', services: ['goals'] },
  { key: 'campaigns', description: 'Campanhas', services: ['campaigns'] },
  { key: 'campaigns.create', description: 'Criar campanha' },
  { key: 'campaigns.rules', description: 'Regras de campanha' },
  { key: 'leads', description: 'Leads' },
  { key: 'automation', description: 'Automações', services: ['automation'] },
  { key: 'studio', description: 'Estúdio', services: ['studio'] },
  { key: 'studio.image', description: 'Gerador de imagem' },
  { key: 'studio.video', description: 'Gerador de vídeo', services: ['studio.video'] },
  { key: 'planner', description: 'Planejador', services: ['planner'] },
  { key: 'calendar', description: 'Calendário' },
  { key: 'budget', description: 'Orçamento smart', services: ['budget'] },
  { key: 'settings', description: 'Configurações' },
  { key: 'settings.integrations', description: 'Integrações' },
  { key: 'plans', description: 'Planos' },
  { key: 'subscription', description: 'Assinatura' },
  { key: 'admin.dashboard', description: 'Admin: dashboard' },
  { key: 'admin.users', description: 'Admin: usuários' },
  { key: 'admin.tenants', description: 'Admin: clientes' },
  { key: 'admin.plans', description: 'Admin: planos' },
  { key: 'admin.tickets', description: 'Admin: tickets' },
  { key: 'admin.healthchecks', description: 'Admin: healthchecks' },
  { key: 'admin.faqs', description: 'Admin: FAQs' },
  { key: 'admin.announcements', description: 'Admin: avisos' },
];
