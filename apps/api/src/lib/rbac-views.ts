// Catálogo de telas do RBAC. Tela nova = uma linha aqui e no espelho do front (apps/web/src/lib/rbac-views.ts).
// Sincronizado em ady_rbac_views no startup. Key com "." herda o bloqueio do pai (campaigns → campaigns.create).
export interface RbacViewEntry {
  key: string;
  description: string;
}

export const RBAC_VIEWS: readonly RbacViewEntry[] = [
  { key: 'dashboard', description: 'Dashboard' },
  { key: 'goals', description: 'Metas' },
  { key: 'campaigns', description: 'Campanhas' },
  { key: 'campaigns.create', description: 'Criar campanha' },
  { key: 'campaigns.rules', description: 'Regras de campanha' },
  { key: 'leads', description: 'Leads' },
  { key: 'automation', description: 'Automações' },
  { key: 'studio', description: 'Estúdio' },
  { key: 'studio.image', description: 'Gerador de imagem' },
  { key: 'planner', description: 'Planejador' },
  { key: 'calendar', description: 'Calendário' },
  { key: 'budget', description: 'Orçamento smart' },
  { key: 'settings', description: 'Configurações' },
  { key: 'settings.integrations', description: 'Integrações' },
  { key: 'plans', description: 'Planos' },
  { key: 'admin.dashboard', description: 'Admin: dashboard' },
  { key: 'admin.users', description: 'Admin: usuários' },
  { key: 'admin.tenants', description: 'Admin: clientes' },
  { key: 'admin.plans', description: 'Admin: planos' },
  { key: 'admin.tickets', description: 'Admin: tickets' },
  { key: 'admin.healthchecks', description: 'Admin: healthchecks' },
  { key: 'admin.faqs', description: 'Admin: FAQs' },
  { key: 'admin.announcements', description: 'Admin: avisos' },
];
