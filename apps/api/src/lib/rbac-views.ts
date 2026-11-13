// Catálogo de telas do RBAC. Tela nova = uma linha aqui e no espelho do front (apps/web/src/lib/rbac-views.ts).
// Sincronizado em ady_rbac_views no startup. Key com "." herda o bloqueio do pai (campaigns → campaigns.create).
export interface RbacViewEntry {
  key: string;
  description: string;
  // serviços (rbac-services) bloqueados junto com a tela
  services?: string[];
  // fora do ar para todos (até super_admin) e some das permissões
  disabled?: boolean;
}

export const RBAC_VIEWS: readonly RbacViewEntry[] = [
  { key: 'dashboard', description: 'Dashboard', services: ['dashboard'] },
  { key: 'goals', description: 'Metas', services: ['goals'] },
  { key: 'campaigns', description: 'Campanhas', services: ['campaigns'] },
  { key: 'campaigns.create', description: 'Criar campanha', services: ['campaigns.create'] },
  { key: 'campaigns.rules', description: 'Regras de campanha', services: ['campaigns.rules'] },
  { key: 'leads', description: 'Leads', services: ['leads'] },
  { key: 'automation', description: 'Automações', services: ['automation'] },
  { key: 'studio', description: 'Estúdio', services: ['studio'] },
  { key: 'studio.image', description: 'Gerador de imagem', services: ['studio.image'] },
  { key: 'studio.video', description: 'Gerador de vídeo', services: ['studio.video'] },
  { key: 'planner', description: 'Planejador', services: ['planner'] },
  { key: 'calendar', description: 'Calendário', services: ['calendar'] },
  // inacabado: tirar o disabled quando for finalizado (e voltar a rota no web)
  { key: 'budget', description: 'Orçamento smart', services: ['budget'], disabled: true },
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

// serviços das telas desativadas
export const DISABLED_SERVICE_KEYS: readonly string[] = RBAC_VIEWS.filter((v) => v.disabled).flatMap((v) => v.services ?? []);

// Bloqueio pai → filho (campaigns bloqueia campaigns.create); 'all' bloqueia tudo
export function expandBlocked(raw: readonly string[], allKey = 'all'): string[] {
  const all = raw.includes(allKey);
  return RBAC_VIEWS.map((e) => e.key).filter((key) => all || raw.some((r) => key === r || key.startsWith(r + '.')));
}

// Funcionalidades que o plano pode tirar do cliente; parent = desligar o pai leva junto
export type PlanViewGroup = 'ads' | 'content';
export const PLAN_BLOCKABLE_VIEWS: readonly { key: string; group: PlanViewGroup; parent: string | null }[] = [
  { key: 'campaigns', group: 'ads', parent: null },
  { key: 'campaigns.create', group: 'ads', parent: 'campaigns' },
  { key: 'campaigns.rules', group: 'ads', parent: 'campaigns' },
  // leads vêm das campanhas
  { key: 'leads', group: 'ads', parent: 'campaigns' },
  { key: 'studio', group: 'content', parent: null },
  { key: 'studio.image', group: 'content', parent: 'studio' },
  { key: 'studio.video', group: 'content', parent: 'studio' },
  // automation e planner fora: telas ocultas (feature futura)
  { key: 'calendar', group: 'content', parent: null },
];
export const PLAN_BLOCKABLE_VIEW_KEYS: readonly string[] = PLAN_BLOCKABLE_VIEWS.map((v) => v.key);

// plano: pai bloqueado leva as filhas
export function expandPlanViews(raw: readonly string[]): string[] {
  return PLAN_BLOCKABLE_VIEWS.filter((v) => raw.includes(v.key) || (v.parent !== null && raw.includes(v.parent))).map((v) => v.key);
}

// serviços que o plano bloqueia; posts (/planner) só caem sem planejador E sem calendário
export function planServicesOf(expanded: readonly string[]): string[] {
  const out = new Set<string>();
  for (const key of expanded) {
    if (key === 'planner') out.add('planner.generate');
    else for (const svc of RBAC_VIEWS.find((v) => v.key === key)?.services ?? []) out.add(svc);
  }
  if (expanded.includes('planner') && expanded.includes('calendar')) out.add('planner');
  return [...out];
}
