/**
 * Fury App — Route Metadata
 * Mapping de cada rota para metadados OpenAPI.
 * Este é o ÚNICO arquivo a editar quando adicionar/alterar endpoints.
 * O script generate-swagger.ts gera swagger.json a partir daqui + introspecção do Express.
 *
 * Formato das chaves:  METHOD /api/...path...
 * Wildcards de params: use :param (ex: /api/campaigns/:id)
 * Tags disponíveis: Health, Auth, Public, Meta, Metrics, Campaigns, Budget,
 *   Studio, Automation, Fury, Dashboard, Forms, Goals, Billing, Brand Kit,
 *   Planner, OpenRouter, Observability, Superadmin, Instagram
 */

export interface RouteMeta {
  /** Descrição curta (aparece no Swagger UI) */
  summary: string;
  /** Tags para agrupar no Swagger UI */
  tags: string[];
  /** Nome do schema de request body (deve existir em swagger.spec.ts) */
  requestSchema?: string;
  /** Se true, requer Bearer token */
  auth: boolean;
  /** Descrição longa opcional */
  description?: string;
  /** Parâmetros de query */
  queryParams?: { name: string; description: string; schema: Record<string, unknown> }[];
  /** Parâmetros de path */
  pathParams?: { name: string; description: string; schema: Record<string, unknown> }[];
  /** Content-Type do request (default: application/json) */
  contentType?: string;
  /** Content-Type da resposta */
  responseType?: string;
}

export const ROUTE_METADATA: Record<string, RouteMeta> = {
  // ═══════════ Health ═══════════
  'GET /api/health': { summary: 'Health check', tags: ['Health'], auth: false },

  // ═══════════ Public ═══════════
  'GET /api/lp/:slug': { summary: 'Landing page pública WhatsApp', tags: ['Public'], auth: false },
  'GET /api/public/brand-kit/:slug':
    { summary: 'Dados públicos do brand kit por slug', tags: ['Public'], auth: false },

  // ═══════════ Auth ═══════════
  'POST /api/auth/register': { summary: 'Registrar usuário + tenant', tags: ['Auth'], auth: false, requestSchema: 'RegisterRequest' },
  'POST /api/auth/login': { summary: 'Login — retorna accessToken + refreshToken', tags: ['Auth'], auth: false, requestSchema: 'LoginRequest' },
  'POST /api/auth/refresh': { summary: 'Renovar accessToken', tags: ['Auth'], auth: false, requestSchema: 'RefreshRequest' },
  'POST /api/auth/verify-email': { summary: 'Verificar email com OTP de 6 dígitos', tags: ['Auth'], auth: false, requestSchema: 'VerifyEmailRequest' },
  'POST /api/auth/forgot-password': { summary: 'Solicitar reset de senha', tags: ['Auth'], auth: false, requestSchema: 'ForgotPasswordRequest' },
  'POST /api/auth/reset-password': { summary: 'Resetar senha com OTP', tags: ['Auth'], auth: false, requestSchema: 'ResetPasswordRequest' },
  'POST /api/auth/logout': { summary: 'Logout — invalida refresh token', tags: ['Auth'], auth: true },
  'GET /api/auth/me': { summary: 'Dados do usuário logado', tags: ['Auth'], auth: true },
  'PATCH /api/auth/me': { summary: 'Atualizar perfil/notificações', tags: ['Auth'], auth: true, requestSchema: 'UpdateMeRequest' },
  'POST /api/auth/change-password': { summary: 'Trocar senha', tags: ['Auth'], auth: true, requestSchema: 'ChangePasswordRequest' },

  // ═══════════ Meta ═══════════
  'GET /api/meta/auth/test': { summary: 'Teste de conectividade Meta Auth', tags: ['Meta'], auth: false },
  'GET /api/meta/auth/url': { summary: 'Gerar URL de autorização Meta OAuth', tags: ['Meta'], auth: true },
  'GET /api/meta/auth/callback': { summary: 'Callback OAuth do Meta', tags: ['Meta'], auth: false },
  'GET /api/meta/scopes': { summary: 'Listar escopos concedidos', tags: ['Meta'], auth: true },
  'GET /api/meta/pages': { summary: 'Listar páginas do Facebook', tags: ['Meta'], auth: true },
  'GET /api/meta/pages/:pageId/whatsapp-numbers': { summary: 'Listar números WhatsApp da página', tags: ['Meta'], auth: true },
  'GET /api/meta/businesses': { summary: 'Listar Business Managers', tags: ['Meta'], auth: true },
  'POST /api/meta/pages-by-business': { summary: 'Listar páginas por business', tags: ['Meta'], auth: true, requestSchema: 'BusinessIdsRequest' },
  'POST /api/meta/adaccounts-by-business': { summary: 'Listar ad accounts por business', tags: ['Meta'], auth: true, requestSchema: 'BusinessIdsRequest' },
  'POST /api/meta/whatsapp-by-pages': { summary: 'Listar WhatsApp numbers por páginas', tags: ['Meta'], auth: true, requestSchema: 'PageIdsRequest' },
  'POST /api/meta/save-selection': { summary: 'Salvar seleção de assets Meta', tags: ['Meta'], auth: true, requestSchema: 'SaveSelectionRequest' },
  'GET /api/meta/asset-selection': { summary: 'Obter seleção de assets salva', tags: ['Meta'], auth: true },
  'GET /api/meta/connections': { summary: 'Listar conexões Meta', tags: ['Meta'], auth: true },
  'PATCH /api/meta/connections/:id/select-account':
    { summary: 'Selecionar ad account', tags: ['Meta'], auth: true, requestSchema: 'SelectAdAccountRequest' },
  'DELETE /api/meta/connections/:id': { summary: 'Remover conexão Meta', tags: ['Meta'], auth: true },

  // ═══════════ Metrics ═══════════
  'GET /api/metrics/summary': { summary: 'Resumo de métricas (adsets)', tags: ['Metrics'], auth: true },
  'GET /api/metrics/campaigns': { summary: 'Listar métricas por campanha', tags: ['Metrics'], auth: true },
  'GET /api/metrics/campaigns/:campaignId/adsets': { summary: 'Adsets de uma campanha', tags: ['Metrics'], auth: true },
  'GET /api/metrics/campaigns/:campaignId/insights': { summary: 'Insights detalhados de campanha', tags: ['Metrics'], auth: true },
  'GET /api/metrics/daily': { summary: 'Métricas diárias', tags: ['Metrics'], auth: true },
  'GET /api/metrics/goals-progress': { summary: 'Progresso das metas', tags: ['Metrics'], auth: true },

  // ═══════════ Campaigns ═══════════
  'GET /api/campaigns': { summary: 'Listar campanhas', tags: ['Campaigns'], auth: true },
  'POST /api/campaigns/create': { summary: 'Criar campanha', tags: ['Campaigns'], auth: true, requestSchema: 'CreateCampaignRequest' },
  'POST /api/campaigns/create-wizard': { summary: 'Criar campanha via wizard', tags: ['Campaigns'], auth: true },
  'POST /api/campaigns/mcp-log': { summary: 'Log do wizard (MCP)', tags: ['Campaigns'], auth: true },
  'GET /api/campaigns/create-wizard-diag': { summary: 'Diagnóstico do wizard', tags: ['Campaigns'], auth: true },
  'POST /api/campaigns/upload-creative': { summary: 'Upload de criativo (multipart)', tags: ['Campaigns'], auth: true, contentType: 'multipart/form-data' },
  'POST /api/campaigns/suggest-text': { summary: 'Sugerir texto via IA', tags: ['Campaigns'], auth: true, requestSchema: 'SuggestTextRequest' },
  'GET /api/campaigns/meta-locations': { summary: 'Buscar localizações Meta', tags: ['Campaigns'], auth: true },
  'GET /api/campaigns/meta-interests': { summary: 'Buscar interesses Meta', tags: ['Campaigns'], auth: true },
  'GET /api/campaigns/:id': { summary: 'Detalhes da campanha', tags: ['Campaigns'], auth: true },
  'PATCH /api/campaigns/:id': { summary: 'Atualizar campanha', tags: ['Campaigns'], auth: true, requestSchema: 'UpdateCampaignRequest' },
  'PATCH /api/campaigns/:id/pause': { summary: 'Pausar campanha', tags: ['Campaigns'], auth: true },
  'PATCH /api/campaigns/:id/resume': { summary: 'Retomar campanha', tags: ['Campaigns'], auth: true },
  'PATCH /api/campaigns/:id/status': { summary: 'Atualizar status', tags: ['Campaigns'], auth: true, requestSchema: 'UpdateCampaignStatusRequest' },
  'PATCH /api/campaigns/:id/budget': { summary: 'Atualizar budget', tags: ['Campaigns'], auth: true, requestSchema: 'UpdateBudgetRequest' },
  'GET /api/campaigns/:id/insights': { summary: 'Insights da campanha', tags: ['Campaigns'], auth: true },
  'DELETE /api/campaigns/:id': { summary: 'Soft delete da campanha', tags: ['Campaigns'], auth: true },

  // ═══════════ Budget ═══════════
  'POST /api/budget/optimize': { summary: 'Disparar otimização de budget', tags: ['Budget'], auth: true },
  'GET /api/budget/suggestions': { summary: 'Listar sugestões de budget', tags: ['Budget'], auth: true },
  'POST /api/budget/suggestions/:id/apply': { summary: 'Aplicar uma sugestão', tags: ['Budget'], auth: true },
  'POST /api/budget/suggestions/:id/reject': { summary: 'Rejeitar uma sugestão', tags: ['Budget'], auth: true },
  'POST /api/budget/apply-bulk': { summary: 'Aplicar sugestões em lote', tags: ['Budget'], auth: true, requestSchema: 'ApplyBulkRequest' },
  'POST /api/budget/reject-bulk': { summary: 'Rejeitar sugestões em lote', tags: ['Budget'], auth: true, requestSchema: 'ApplyBulkRequest' },
  'GET /api/budget/config': { summary: 'Obter configuração de budget', tags: ['Budget'], auth: true },
  'PATCH /api/budget/config': { summary: 'Atualizar configuração de budget', tags: ['Budget'], auth: true, requestSchema: 'UpdateBudgetConfigRequest' },

  // ═══════════ Studio ═══════════
  'GET /api/studio/storage-check': { summary: 'Verificar storage disponível', tags: ['Studio'], auth: false },
  'GET /api/studio/assets': { summary: 'Listar assets criativos', tags: ['Studio'], auth: true },
  'GET /api/studio/assets/:assetId': { summary: 'Detalhes do asset', tags: ['Studio'], auth: true },
  'GET /api/studio/assets/:assetId/compliance-status': { summary: 'Status de compliance do asset', tags: ['Studio'], auth: true },
  'DELETE /api/studio/assets/:assetId': { summary: 'Excluir asset', tags: ['Studio'], auth: true },
  'POST /api/studio/generate-copy': { summary: 'Gerar copy via DeepSeek', tags: ['Studio'], auth: true, requestSchema: 'GenerateCreativeRequest' },
  'POST /api/studio/copy/generate': { summary: 'Gerar copy (endpoint alternativo)', tags: ['Studio'], auth: true, requestSchema: 'GenerateCreativeRequest' },
  'POST /api/studio/generate-image': { summary: 'Gerar imagem criativa', tags: ['Studio'], auth: true, requestSchema: 'GenerateImageRequest' },
  'POST /api/studio/render-creative': { summary: 'Renderizar criativo final', tags: ['Studio'], auth: true, requestSchema: 'RenderCreativeRequest' },
  'POST /api/studio/publish/:assetId': { summary: 'Publicar asset', tags: ['Studio'], auth: true, requestSchema: 'PublishAssetRequest' },
  'POST /api/studio/upload-to-meta': { summary: 'Upload para Meta Ads', tags: ['Studio'], auth: true, requestSchema: 'UploadToMetaRequest' },
  'POST /api/studio/creative/validate-context': { summary: 'Validar contexto criativo', tags: ['Studio'], auth: true },
  'POST /api/studio/creative/generate': { summary: 'Gerar criativo completo', tags: ['Studio'], auth: true, requestSchema: 'GenerateCreativeRequest' },
  'POST /api/studio/creative/regenerate': { summary: 'Regenerar criativo com feedback', tags: ['Studio'], auth: true, requestSchema: 'RegenerateCreativeRequest' },
  'POST /api/studio/select-layout': { summary: 'Selecionar layout (Layout Selector Agent)', tags: ['Studio'], auth: true, requestSchema: 'SelectLayoutRequest' },
  'POST /api/studio/preview-png': { summary: 'Preview PNG fiel (sem LLM, sem DB)', tags: ['Studio'], auth: true, requestSchema: 'PreviewCreativeRequest', responseType: 'image/png' },

  // ═══════════ Automation ═══════════
  'GET /api/automation/feed': { summary: 'SSE feed de automação', tags: ['Automation'], auth: true },
  'GET /api/automation/rules': { summary: 'Listar regras de automação', tags: ['Automation'], auth: true },
  'POST /api/automation/rules': { summary: 'Criar regra de automação', tags: ['Automation'], auth: true, requestSchema: 'CreateRuleRequest' },
  'DELETE /api/automation/rules/:id': { summary: 'Excluir regra', tags: ['Automation'], auth: true },
  'GET /api/automation/takedowns': { summary: 'Listar takedowns', tags: ['Automation'], auth: true },
  'POST /api/automation/budget-smart': { summary: 'Budget Smart (automação)', tags: ['Automation'], auth: true, requestSchema: 'BudgetSmartRequest' },

  // ═══════════ Fury ═══════════
  'GET /api/fury/live-feed': { summary: 'SSE feed do Fury Engine', tags: ['Fury'], auth: true },
  'GET /api/fury/config': { summary: 'Configuração do Fury Engine', tags: ['Fury'], auth: true },
  'PATCH /api/fury/config': { summary: 'Atualizar config do Fury Engine', tags: ['Fury'], auth: true, requestSchema: 'FuryConfigRequest' },
  'GET /api/fury/rules': { summary: 'Listar regras do Fury', tags: ['Fury'], auth: true },
  'POST /api/fury/rules': { summary: 'Criar regra do Fury', tags: ['Fury'], auth: true, requestSchema: 'CreateFuryRuleRequest' },
  'PATCH /api/fury/rules/:id': { summary: 'Atualizar regra do Fury', tags: ['Fury'], auth: true },
  'DELETE /api/fury/rules/:id': { summary: 'Excluir regra do Fury', tags: ['Fury'], auth: true },
  'GET /api/fury/scores': { summary: 'Scores do Fury Engine', tags: ['Fury'], auth: true },
  'GET /api/fury/history': { summary: 'Histórico do Fury Engine', tags: ['Fury'], auth: true },

  // ═══════════ Dashboard ═══════════
  'GET /api/dashboard/instagram-insights': { summary: 'Insights do Instagram', tags: ['Dashboard'], auth: true },

  // ═══════════ Forms ═══════════
  'POST /api/forms/start': { summary: 'Iniciar tracking de formulário', tags: ['Forms'], auth: true, requestSchema: 'FormStartRequest' },
  'POST /api/forms/complete': { summary: 'Completar formulário', tags: ['Forms'], auth: true, requestSchema: 'FormCompleteRequest' },
  'POST /api/forms/error': { summary: 'Registrar erro de formulário', tags: ['Forms'], auth: true },
  'POST /api/forms/abandoned': { summary: 'Registrar abandono de formulário', tags: ['Forms'], auth: true },

  // ═══════════ Goals ═══════════
  'GET /api/goals': { summary: 'Objetivos do tenant', tags: ['Goals'], auth: true },
  'POST /api/goals/setup': { summary: 'Criar/atualizar objetivos', tags: ['Goals'], auth: true, requestSchema: 'GoalSetupRequest' },
  'PUT /api/goals': { summary: 'Atualizar objetivos', tags: ['Goals'], auth: true, requestSchema: 'GoalSetupRequest' },
  'GET /api/goals/progress': { summary: 'Progresso dos objetivos', tags: ['Goals'], auth: true },

  // ═══════════ Billing ═══════════
  'GET /api/billing/plans': { summary: 'Listar planos disponíveis', tags: ['Billing'], auth: false },
  'POST /api/billing/webhook': { summary: 'Webhook do Asaas', tags: ['Billing'], auth: false },
  'POST /api/billing/subscribe': { summary: 'Assinar plano', tags: ['Billing'], auth: true, requestSchema: 'SubscribeRequest' },
  'GET /api/billing/subscription': { summary: 'Assinatura atual', tags: ['Billing'], auth: true },
  'GET /api/billing/invoices': { summary: 'Faturas recentes', tags: ['Billing'], auth: true },
  'DELETE /api/billing/subscription': { summary: 'Cancelar assinatura', tags: ['Billing'], auth: true },

  // ═══════════ Brand Kit ═══════════
  'GET /api/brand-kit': { summary: 'Obter brand kit', tags: ['Brand Kit'], auth: true },
  'PUT /api/brand-kit': { summary: 'Upsert brand kit', tags: ['Brand Kit'], auth: true, requestSchema: 'UpsertBrandKitRequest' },
  'POST /api/brand-kit/logo': { summary: 'Upload de logo (multipart)', tags: ['Brand Kit'], auth: true, contentType: 'multipart/form-data' },
  'POST /api/brand-kit/photos': { summary: 'Upload de fotos (multipart)', tags: ['Brand Kit'], auth: true, contentType: 'multipart/form-data' },
  'DELETE /api/brand-kit/photos': { summary: 'Remover fotos', tags: ['Brand Kit'], auth: true },

  // ═══════════ Planner ═══════════
  'POST /api/planner/generate': { summary: 'Gerar plano de conteúdo', tags: ['Planner'], auth: true, requestSchema: 'GeneratePlanRequest' },
  'GET /api/planner/jobs/:jobId': { summary: 'Status do job de geração', tags: ['Planner'], auth: true },
  'GET /api/planner/plans/latest': { summary: 'Plano mais recente', tags: ['Planner'], auth: true },
  'GET /api/planner/plans/:planId': { summary: 'Detalhes do plano', tags: ['Planner'], auth: true },
  'GET /api/planner/prerequisites': { summary: 'Pré-requisitos do planner', tags: ['Planner'], auth: true },
  'POST /api/planner/plans/confirm': { summary: 'Confirmar plano', tags: ['Planner'], auth: true, requestSchema: 'ConfirmPlanRequest' },
  'POST /api/planner/plans/revalidate': { summary: 'Revalidar plano', tags: ['Planner'], auth: true },
  'GET /api/planner/calendar': { summary: 'Calendário de posts', tags: ['Planner'], auth: true },
  'PATCH /api/planner/posts/:postId': { summary: 'Editar post', tags: ['Planner'], auth: true, requestSchema: 'EditPostRequest' },
  'PATCH /api/planner/posts/bulk-schedule': { summary: 'Agendar posts em lote', tags: ['Planner'], auth: true, requestSchema: 'BulkScheduleRequest' },
  'DELETE /api/planner/posts/bulk': { summary: 'Excluir posts em lote', tags: ['Planner'], auth: true },
  'POST /api/planner/posts': { summary: 'Criar post', tags: ['Planner'], auth: true, requestSchema: 'CreatePostRequest' },
  'POST /api/planner/posts/upload': { summary: 'Upload de mídia (multipart)', tags: ['Planner'], auth: true, contentType: 'multipart/form-data' },
  'PATCH /api/planner/posts/:postId/move': { summary: 'Mover post no calendário', tags: ['Planner'], auth: true },
  'POST /api/planner/posts/publish-due': { summary: 'Publicar posts agendados', tags: ['Planner'], auth: true },
  'POST /api/planner/cron/publish-due': { summary: 'Cron: publicar posts agendados', tags: ['Planner'], auth: false },

  // ═══════════ OpenRouter ═══════════
  'GET /api/openrouter/models': { summary: 'Listar modelos disponíveis', tags: ['OpenRouter'], auth: false },
  'POST /api/openrouter/enhance-prompt': { summary: 'Melhorar prompt via IA', tags: ['OpenRouter'], auth: true, requestSchema: 'EnhancePromptRequest' },
  'POST /api/openrouter/generate-image': { summary: 'Gerar imagem via IA', tags: ['OpenRouter'], auth: true, requestSchema: 'GenerateImageOrRequest' },
  'POST /api/openrouter/generate-video': { summary: 'Gerar vídeo via IA', tags: ['OpenRouter'], auth: true, requestSchema: 'GenerateVideoRequest' },
  'POST /api/openrouter/regenerate': { summary: 'Regenerar conteúdo', tags: ['OpenRouter'], auth: true },
  'POST /api/openrouter/regenerate-ad': { summary: 'Regenerar anúncio com máscara', tags: ['OpenRouter'], auth: true, contentType: 'multipart/form-data' },

  // ═══════════ Observability ═══════════
  'GET /api/observability/kpis': { summary: 'KPIs de observabilidade', tags: ['Observability'], auth: true },
  'GET /api/observability/kpis/list': { summary: 'Lista de KPIs disponíveis', tags: ['Observability'], auth: true },

  // ═══════════ Superadmin ═══════════
  'GET /api/admin/tenants': { summary: 'Listar tenants', tags: ['Superadmin'], auth: true },
  'GET /api/admin/tenants/:id': { summary: 'Detalhes do tenant', tags: ['Superadmin'], auth: true },
  'DELETE /api/admin/tenants/:id': { summary: 'Excluir tenant', tags: ['Superadmin'], auth: true },
  'GET /api/admin/users': { summary: 'Listar usuários', tags: ['Superadmin'], auth: true },
  'POST /api/admin/users': { summary: 'Criar usuário', tags: ['Superadmin'], auth: true, requestSchema: 'CreateUserRequest' },
  'GET /api/admin/users/check-email/:email': { summary: 'Verificar disponibilidade de email', tags: ['Superadmin'], auth: true },
  'PATCH /api/admin/users/:id': { summary: 'Atualizar usuário', tags: ['Superadmin'], auth: true, requestSchema: 'UpdateUserRequest' },
  'DELETE /api/admin/users/:id': { summary: 'Excluir usuário', tags: ['Superadmin'], auth: true },
  'POST /api/admin/setup-tenant': { summary: 'Setup completo de tenant + usuário', tags: ['Superadmin'], auth: true, requestSchema: 'SetupTenantRequest' },
  'PATCH /api/admin/tenants/:tenantId/subscription': { summary: 'Atualizar assinatura', tags: ['Superadmin'], auth: true, requestSchema: 'UpdateSubscriptionRequest' },
  'PATCH /api/admin/tenants/:tenantId/fury-config': { summary: 'Atualizar Fury Config', tags: ['Superadmin'], auth: true },
  'GET /api/admin/tenants/:tenantId/brand-kit': { summary: 'Ver brand kit do tenant', tags: ['Superadmin'], auth: true },
  'PATCH /api/admin/tenants/:tenantId/brand-kit': { summary: 'Editar brand kit do tenant', tags: ['Superadmin'], auth: true, requestSchema: 'UpsertBrandKitRequest' },
  'GET /api/admin/tenants/:tenantId/campaigns': { summary: 'Listar campanhas do tenant', tags: ['Superadmin'], auth: true },
  'PUT /api/admin/tenants/:tenantId/goals': { summary: 'Upsert goals do tenant', tags: ['Superadmin'], auth: true, requestSchema: 'GoalSetupRequest' },
  'PATCH /api/admin/tenants/:tenantId/audience': { summary: 'Atualizar audiência do tenant', tags: ['Superadmin'], auth: true },
  'GET /api/admin/plans': { summary: 'Listar planos', tags: ['Superadmin'], auth: true },
  'POST /api/admin/plans': { summary: 'Criar plano', tags: ['Superadmin'], auth: true, requestSchema: 'CreatePlanRequest' },
  'PATCH /api/admin/plans/:id': { summary: 'Atualizar plano', tags: ['Superadmin'], auth: true },
  'DELETE /api/admin/plans/:id': { summary: 'Excluir plano', tags: ['Superadmin'], auth: true },

  // ═══════════ Instagram ═══════════
  'GET /api/instagram/posts-ranked': { summary: 'Posts ranqueados do Instagram', tags: ['Instagram'], auth: true },
  'GET /api/instagram/media-proxy': { summary: 'Proxy de mídia do Instagram', tags: ['Instagram'], auth: true },
};
