// Espelho do catálogo de telas da API (apps/api/src/lib/rbac-views.ts). Tela nova = uma linha nos dois.
// Só esconde; quem bloqueia de verdade é o servidor.
export const RBAC_VIEW_KEYS = [
  'dashboard',
  'goals',
  'campaigns',
  'campaigns.create',
  'campaigns.rules',
  'leads',
  'automation',
  'studio',
  'studio.image',
  'studio.video',
  'planner',
  'calendar',
  'budget',
  'settings',
  'settings.integrations',
  'plans',
  'subscription',
  'admin.dashboard',
  'admin.users',
  'admin.tenants',
  'admin.plans',
  'admin.tickets',
  'admin.healthchecks',
  'admin.faqs',
  'admin.announcements',
] as const;

export type RbacViewKey = (typeof RBAC_VIEW_KEYS)[number];

// Rota → tela; vale o prefixo mais longo (por segmento)
const ROUTE_VIEWS: [string, RbacViewKey][] = [
  ['/dashboard', 'dashboard'],
  ['/dashboard/metas', 'goals'],
  ['/campanhas', 'campaigns'],
  ['/campanhas/regras', 'campaigns.rules'],
  ['/criar-campanha', 'campaigns.create'],
  ['/leads', 'leads'],
  ['/automacao', 'automation'],
  ['/estudio', 'studio'],
  ['/estudio/imagem', 'studio.image'],
  ['/planejador', 'planner'],
  ['/calendario', 'calendar'],
  ['/orcamento-smart', 'budget'],
  ['/configuracoes', 'settings'],
  ['/configuracoes/integracoes', 'settings.integrations'],
  ['/planos', 'plans'],
  ['/assinatura', 'subscription'],
  ['/admin/dashboard', 'admin.dashboard'],
  ['/admin/users', 'admin.users'],
  ['/admin/tenants', 'admin.tenants'],
  ['/admin/planos', 'admin.plans'],
  ['/admin/tickets', 'admin.tickets'],
  ['/admin/healthchecks', 'admin.healthchecks'],
  ['/admin/faqs', 'admin.faqs'],
  ['/admin/avisos', 'admin.announcements'],
];

export function viewKeyForPath(pathname: string): RbacViewKey | null {
  let best: [string, RbacViewKey] | null = null;
  for (const entry of ROUTE_VIEWS) {
    const [route] = entry;
    const matches = pathname === route || pathname.startsWith(route + '/');
    if (matches && (!best || route.length > best[0].length)) best = entry;
  }
  return best ? best[1] : null;
}
