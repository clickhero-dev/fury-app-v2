// Catálogo de serviços do RBAC: prefixo de rota (relativo a /api) → key.
// Módulo novo = uma linha aqui. Sincronizado em ady_rbac_services no startup.
export interface RbacServiceEntry {
  prefix: string;
  key: string;
  description: string;
}

export const RBAC_SERVICES: readonly RbacServiceEntry[] = [
  { prefix: '/metrics', key: 'metrics', description: 'Métricas' },
  { prefix: '/automation', key: 'automation', description: 'Automações' },
  { prefix: '/studio', key: 'studio', description: 'Estúdio' },
  { prefix: '/studio/video', key: 'studio.video', description: 'Vídeos do Estúdio' },
  { prefix: '/studio/ai', key: 'studio.ai', description: 'IA do Estúdio' },
  { prefix: '/campaigns', key: 'campaigns', description: 'Campanhas' },
  { prefix: '/budget', key: 'budget', description: 'Orçamento' },
  { prefix: '/instagram', key: 'instagram', description: 'Instagram' },
  { prefix: '/dashboard', key: 'dashboard', description: 'Dashboard' },
  { prefix: '/forms', key: 'forms', description: 'Formulários' },
  { prefix: '/fury', key: 'fury', description: 'Fury Engine' },
  { prefix: '/goals', key: 'goals', description: 'Metas' },
  { prefix: '/brand-kit', key: 'brand_kit', description: 'Brand kit' },
  { prefix: '/planner', key: 'planner', description: 'Planejador' },
  { prefix: '/observability', key: 'observability', description: 'Observabilidade' },
  { prefix: '/wpp', key: 'wpp', description: 'WhatsApp' },
  { prefix: '/google', key: 'google', description: 'Google' },
  { prefix: '/meta', key: 'meta', description: 'Meta' },
  { prefix: '/v2/campaigns', key: 'campaigns', description: 'Campanhas' },
  { prefix: '/v2/leads', key: 'campaigns', description: 'Campanhas' },
  { prefix: '/v2/lead-campaigns', key: 'campaigns', description: 'Campanhas' },
  { prefix: '/v2/metrics', key: 'metrics', description: 'Métricas' },
  { prefix: '/v2/dashboard', key: 'dashboard', description: 'Dashboard' },
];

// Prefixos que nunca são bloqueados pelo RBAC
export const RBAC_EXEMPT_PREFIXES: readonly string[] = [
  '/health',
  '/auth',
  '/faqs',
  '/announcements',
  '/billing',
  '/policy',
  '/admin',
  '/admin/queues',
];

export const RBAC_ALL_KEY = 'all';
