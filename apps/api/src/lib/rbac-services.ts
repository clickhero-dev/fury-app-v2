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
  // funcionalidades do plano (somam às keys acima)
  { prefix: '/v2/leads', key: 'leads', description: 'Leads' },
  { prefix: '/v2/lead-campaigns', key: 'leads', description: 'Leads' },
  { prefix: '/campaigns/leads', key: 'leads', description: 'Leads' },
  { prefix: '/campaigns/lead-campaigns', key: 'leads', description: 'Leads' },
  { prefix: '/campaigns/create', key: 'campaigns.create', description: 'Criar campanha' },
  { prefix: '/campaigns/create-wizard', key: 'campaigns.create', description: 'Criar campanha' },
  { prefix: '/campaigns/suggest-text', key: 'campaigns.create', description: 'Criar campanha' },
  { prefix: '/campaigns/upload-creative', key: 'campaigns.create', description: 'Criar campanha' },
  { prefix: '/automation/rules', key: 'campaigns.rules', description: 'Regras de campanha' },
  { prefix: '/studio/ai/generate-image', key: 'studio.image', description: 'Gerador de imagem' },
  { prefix: '/studio/ai/regenerate', key: 'studio.image', description: 'Gerador de imagem' },
  { prefix: '/studio/ai/regenerate-ad', key: 'studio.image', description: 'Gerador de imagem' },
  { prefix: '/studio/generate-image', key: 'studio.image', description: 'Gerador de imagem' },
  { prefix: '/studio/render-creative', key: 'studio.image', description: 'Gerador de imagem' },
  { prefix: '/studio/creative', key: 'studio.image', description: 'Gerador de imagem' },
  { prefix: '/studio/select-layout', key: 'studio.image', description: 'Gerador de imagem' },
  { prefix: '/studio/preview-png', key: 'studio.image', description: 'Gerador de imagem' },
  { prefix: '/studio/ai/generate-video', key: 'studio.video', description: 'Vídeos do Estúdio' },
  { prefix: '/planner/calendar', key: 'calendar', description: 'Calendário' },
  // geração do planejador; posts (/planner/posts) são do planejador e do calendário
  { prefix: '/planner/generate', key: 'planner.generate', description: 'Gerar planejamento' },
  { prefix: '/planner/plans', key: 'planner.generate', description: 'Gerar planejamento' },
  { prefix: '/planner/jobs', key: 'planner.generate', description: 'Gerar planejamento' },
  { prefix: '/planner/agent-labels', key: 'planner.generate', description: 'Gerar planejamento' },
  { prefix: '/planner/prerequisites', key: 'planner.generate', description: 'Gerar planejamento' },
  { prefix: '/planner/quota', key: 'planner.generate', description: 'Gerar planejamento' },
];

// Buscas da Meta usadas em Configurações › Público: caminho exato, só leitura, só a key meta
export const RBAC_SERVICE_OVERRIDES: readonly { path: string; key: string }[] = [
  { path: '/campaigns/meta-locations', key: 'meta' },
  { path: '/campaigns/meta-interests', key: 'meta' },
  { path: '/campaigns/meta-city-by-coords', key: 'meta' },
];

// Rotas com parâmetro no meio (prefixo não alcança): soma a key
export const RBAC_SERVICE_PATTERNS: readonly { pattern: RegExp; key: string }[] = [
  { pattern: /^\/(v2\/)?campaigns\/[^/]+\/leads(\/|$)/, key: 'leads' },
];

// Prefixos que nunca são bloqueados pelo RBAC
export const RBAC_EXEMPT_PREFIXES: readonly string[] = [
  '/health',
  '/public',
  '/auth',
  // Conversa requer autenticação; ações delegadas verificam o RBAC da rota de destino.
  '/chat',
  '/faqs',
  '/announcements',
  // sino: isolado por cliente/usuário no próprio controller
  '/notifications',
  '/billing',
  '/policy',
  '/admin',
  '/admin/queues',
  '/rbac',
];

export const RBAC_ALL_KEY = 'all';
