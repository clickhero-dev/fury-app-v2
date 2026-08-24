/**
 * Fury App — OpenAPI 3.0 Specification
 * Documentação completa de todos os endpoints da API.
 * Disponibilizada em /docs via swagger-ui-express.
 */

export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Fury App API',
    version: '1.0.0',
    description:
      'API da plataforma Fury — gestão de campanhas Meta Ads, métricas, studio criativo, ' +
      'automação, planejador, billing e administração multi-tenant.',
    contact: {
      name: 'Fury Team',
      email: 'diogommtdes@gmail.com',
    },
  },
  servers: [
    {
      url: '/',
      description: '.Relative (usa o host do deploy)',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT obtido em POST /api/auth/login. Enviar como `Authorization: Bearer <token>`.',
      },
      asaasWebhook: {
        type: 'apiKey',
        in: 'header',
        name: 'asaas-access-token',
        description: 'Token de webhook do Asaas configurado em ASAAS_WEBHOOK_TOKEN.',
      },
    },
    responses: {
      UnauthorizedError: {
        description: 'Token ausente ou inválido',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      ForbiddenError: {
        description: 'Usuário autenticado mas sem contexto de tenant',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      NotFoundError: {
        description: 'Recurso não encontrado',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      ValidationError: {
        description: 'Erro de validação (Zod)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ValidationError' },
          },
        },
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'NOT_FOUND' },
              message: { type: 'string', example: 'Resource not found' },
            },
          },
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      ValidationError: {
        type: 'object',
        properties: {
          error: { type: 'string', example: 'Validation error' },
          details: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'array', items: { type: 'string' } },
                message: { type: 'string' },
                code: { type: 'string' },
              },
            },
          },
        },
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {},
          timestamp: { type: 'string', format: 'date-time' },
        },
      },
      // ── Auth ──────────────────────────────────
      RegisterRequest: {
        type: 'object',
        required: ['name', 'email', 'password', 'companyName'],
        properties: {
          name: { type: 'string', example: 'João Silva' },
          email: { type: 'string', format: 'email', example: 'joao@empresa.com' },
          password: { type: 'string', minLength: 8, example: '12345678' },
          companyName: { type: 'string', example: 'Empresa LTDA' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'joao@empresa.com' },
          password: { type: 'string', example: '12345678' },
        },
      },
      AuthTokens: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  role: { type: 'string', enum: ['superadmin', 'admin', 'user', 'mock'] },
                },
              },
            },
          },
        },
      },
      RefreshRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
      VerifyEmailRequest: {
        type: 'object',
        required: ['email', 'otp'],
        properties: {
          email: { type: 'string', format: 'email' },
          otp: { type: 'string', pattern: '^\\d{6}$', example: '123456' },
        },
      },
      ForgotPasswordRequest: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
        },
      },
      ResetPasswordRequest: {
        type: 'object',
        required: ['email', 'otp', 'newPassword'],
        properties: {
          email: { type: 'string', format: 'email' },
          otp: { type: 'string', pattern: '^\\d{6}$' },
          newPassword: { type: 'string', minLength: 8 },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 },
        },
      },
      UpdateMeRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          tenantName: { type: 'string' },
          notificationPrefs: {
            type: 'object',
            properties: {
              campanhas: { type: 'boolean' },
              performance: { type: 'boolean' },
              equipe: { type: 'boolean' },
            },
          },
          audienceDefaults: {
            type: 'object',
            properties: {
              city: { type: 'string' },
              cityKey: { type: 'string' },
              ageMin: { type: 'integer', minimum: 18, maximum: 65 },
              ageMax: { type: 'integer', minimum: 18, maximum: 65 },
              gender: { type: 'string', enum: ['all', 'male', 'female'] },
            },
          },
          businessContext: { type: 'string' },
        },
      },
      // ── Goals ─────────────────────────────────
      GoalSetupRequest: {
        type: 'object',
        required: ['objective', 'niche', 'mainProduct', 'monthlyBudget', 'targetCpa'],
        properties: {
          objective: { type: 'string', example: 'gerar leads' },
          niche: { type: 'string', example: 'pet shop' },
          mainProduct: { type: 'string', example: 'ração premium' },
          monthlyBudget: { type: 'number', exclusiveMinimum: 0, example: 3000 },
          targetCpa: { type: 'number', exclusiveMinimum: 0, example: 25 },
        },
      },
      // ── Brand Kit ─────────────────────────────
      UpsertBrandKitRequest: {
        type: 'object',
        properties: {
          primary_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', example: '#E8631A' },
          secondary_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', example: '#f5f5f5' },
          voice_tone: { type: 'string', enum: ['professional', 'casual', 'urgent', 'premium'] },
          logo_url: { type: 'string', format: 'uri', nullable: true },
          photo_urls: { type: 'array', items: { type: 'string', format: 'uri' } },
          whatsapp_number: { type: 'string', pattern: '^\\d{10,15}$', nullable: true, example: '5511999999999' },
        },
      },
      // ── Billing ───────────────────────────────
      SubscribeRequest: {
        type: 'object',
        required: ['planId', 'customerName', 'customerEmail', 'customerCpfCnpj'],
        properties: {
          planId: { type: 'string', format: 'uuid' },
          billingType: { type: 'string', enum: ['BOLETO', 'PIX', 'CREDIT_CARD'], default: 'PIX' },
          customerName: { type: 'string', minLength: 2 },
          customerEmail: { type: 'string', format: 'email' },
          customerCpfCnpj: { type: 'string', minLength: 11, description: 'CPF (11 dígitos) ou CNPJ (14 dígitos)' },
        },
      },
      AsaasWebhookEvent: {
        type: 'object',
        properties: {
          event: { type: 'string' },
          payment: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              status: { type: 'string', enum: ['RECEIVED', 'CONFIRMED', 'OVERDUE', 'PENDING'] },
              subscription: { type: 'string' },
            },
          },
        },
      },
      // ── Campaigns ─────────────────────────────
      CreateCampaignRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          objective: { type: 'string', enum: ['OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC', 'OUTCOME_ENGAGEMENT', 'OUTCOME_LEADS', 'OUTCOME_SALES'] },
          budgetDaily: { type: 'number' },
          budgetLifetime: { type: 'number' },
          startTime: { type: 'string', format: 'date-time' },
          endTime: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['ACTIVE', 'PAUSED'] },
        },
      },
      UpdateCampaignRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          budgetDaily: { type: 'number' },
          budgetLifetime: { type: 'number' },
          status: { type: 'string' },
        },
      },
      UpdateBudgetRequest: {
        type: 'object',
        required: ['budgetDaily'],
        properties: {
          budgetDaily: { type: 'number', exclusiveMinimum: 0 },
        },
      },
      UpdateCampaignStatusRequest: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['ACTIVE', 'PAUSED'] },
        },
      },
      // ── Studio ────────────────────────────────
      GenerateCreativeRequest: {
        type: 'object',
        properties: {
          product: { type: 'string' },
          promise: { type: 'string' },
          offer: { type: 'string' },
          audience: { type: 'string' },
          layout: { type: 'string', enum: ['editorial_headline', 'offer_burst', 'split_diagonal_product', 'photo_immersive', 'split_horizontal_photo'] },
          hasProductImage: { type: 'boolean', default: false },
          headline: { type: 'string', maxLength: 120 },
          subheadline: { type: 'string', maxLength: 160 },
          qualifier: { type: 'string', maxLength: 60 },
          offer_text: { type: 'string', maxLength: 20 },
          subtitle: { type: 'string', maxLength: 200 },
          subtitle_highlight: { type: 'string', maxLength: 30 },
          benefits: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 4 },
          cta: { type: 'string', maxLength: 24 },
          cta_icon: { type: 'string', enum: ['arrow', 'phone', 'whatsapp', 'none'] },
          price_text: { type: 'string', maxLength: 20 },
          tone: { type: 'string', enum: ['institutional', 'energetic'] },
          top_zone_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
          highlight_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
          includeLogo: { type: 'boolean', default: true },
          skipCopy: { type: 'boolean', description: 'Quando true, NÃO chama o LLM — renderiza direto com os textos do body' },
          background_image_url: { type: 'string' },
          product_image_url: { type: 'string' },
          hero_image_url: { type: 'string' },
        },
      },
      RegenerateCreativeRequest: {
        type: 'object',
        required: ['assetId', 'feedback'],
        properties: {
          assetId: { type: 'string', format: 'uuid' },
          feedback: { type: 'string', minLength: 1 },
        },
      },
      SelectLayoutRequest: {
        type: 'object',
        required: ['product', 'promise', 'audience'],
        properties: {
          product: { type: 'string', minLength: 1 },
          promise: { type: 'string', minLength: 1 },
          offer: { type: 'string' },
          audience: { type: 'string', minLength: 1 },
          objective: { type: 'string', enum: ['awareness', 'consideration', 'conversion', 'content'] },
          hasProductImage: { type: 'boolean', default: false },
          productImageUrl: { type: 'string' },
          background_image_url: { type: 'string' },
        },
      },
      PreviewCreativeRequest: {
        type: 'object',
        required: ['layout'],
        properties: {
          layout: { type: 'string', enum: ['editorial_headline', 'offer_burst', 'split_diagonal_product', 'photo_immersive', 'split_horizontal_photo'] },
          headline: { type: 'string', maxLength: 120 },
          qualifier: { type: 'string', maxLength: 60 },
          offer_text: { type: 'string', maxLength: 20 },
          subheadline: { type: 'string', maxLength: 160 },
          subtitle: { type: 'string', maxLength: 200 },
          subtitle_highlight: { type: 'string', maxLength: 30 },
          benefits: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 4 },
          cta: { type: 'string', maxLength: 24 },
          cta_icon: { type: 'string', enum: ['arrow', 'phone', 'whatsapp', 'none'] },
          price_text: { type: 'string', maxLength: 20 },
          tone: { type: 'string', enum: ['institutional', 'energetic'] },
          top_zone_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
          highlight_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
          includeLogo: { type: 'boolean' },
        },
      },
      GenerateImageRequest: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string' },
          size: { type: 'string', enum: ['1024x1024', '1792x1024', '1024x1792'] },
        },
      },
      RenderCreativeRequest: {
        type: 'object',
        properties: {
          layout: { type: 'string' },
          headline: { type: 'string' },
          subheadline: { type: 'string' },
          cta: { type: 'string' },
        },
      },
      PublishAssetRequest: {
        type: 'object',
        properties: {
          caption: { type: 'string' },
        },
      },
      UploadToMetaRequest: {
        type: 'object',
        required: ['assetId', 'adAccountId'],
        properties: {
          assetId: { type: 'string', format: 'uuid' },
          adAccountId: { type: 'string' },
        },
      },
      // ── Automation ───────────────────────────
      CreateRuleRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          trigger: { type: 'string' },
          ruleType: { type: 'string' },
          isActive: { type: 'boolean', default: true },
          enabled: { type: 'boolean', default: true },
          threshold: { type: 'number', minimum: 0 },
          action: { type: 'string' },
        },
      },
      BudgetSmartRequest: {
        type: 'object',
        properties: {
          campaignId: { type: 'string' },
          action: { type: 'string' },
        },
      },
      // ── Fury Engine ───────────────────────────
      FuryConfigRequest: {
        type: 'object',
        properties: {
          benchmarks: { type: 'object' },
          thresholds: { type: 'object' },
        },
      },
      CreateFuryRuleRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          condition: { type: 'string' },
          action: { type: 'string' },
          enabled: { type: 'boolean' },
        },
      },
      // ── Budget ────────────────────────────────
      UpdateBudgetConfigRequest: {
        type: 'object',
        properties: {
          autoOptimize: { type: 'boolean' },
          maxDailyBudget: { type: 'number' },
          minRoi: { type: 'number' },
        },
      },
      ApplyBulkRequest: {
        type: 'object',
        required: ['suggestionIds'],
        properties: {
          suggestionIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
        },
      },
      // ── Meta ──────────────────────────────────
      SaveSelectionRequest: {
        type: 'object',
        properties: {
          pageId: { type: 'string' },
          adAccountId: { type: 'string' },
          whatsappNumberId: { type: 'string' },
        },
      },
      SelectAdAccountRequest: {
        type: 'object',
        required: ['adAccountId'],
        properties: {
          adAccountId: { type: 'string' },
        },
      },
      BusinessIdsRequest: {
        type: 'object',
        required: ['businessIds'],
        properties: {
          businessIds: { type: 'array', items: { type: 'string' } },
        },
      },
      PageIdsRequest: {
        type: 'object',
        required: ['pageIds'],
        properties: {
          pageIds: { type: 'array', items: { type: 'string' } },
        },
      },
      // ── Planner ───────────────────────────────
      GeneratePlanRequest: {
        type: 'object',
        properties: {
          objective: { type: 'string' },
          niche: { type: 'string' },
          monthlyBudget: { type: 'number' },
          audience: { type: 'string' },
        },
      },
      ConfirmPlanRequest: {
        type: 'object',
        properties: {
          planId: { type: 'string', format: 'uuid' },
        },
      },
      EditPostRequest: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          scheduledAt: { type: 'string', format: 'date-time' },
        },
      },
      CreatePostRequest: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          scheduledAt: { type: 'string', format: 'date-time' },
          platform: { type: 'string' },
        },
      },
      BulkScheduleRequest: {
        type: 'object',
        required: ['postIds', 'scheduledAt'],
        properties: {
          postIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
          scheduledAt: { type: 'string', format: 'date-time' },
        },
      },
      // ── OpenRouter ────────────────────────────
      EnhancePromptRequest: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string' },
          model: { type: 'string' },
        },
      },
      GenerateImageOrRequest: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string' },
          model: { type: 'string' },
          size: { type: 'string' },
        },
      },
      GenerateVideoRequest: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: { type: 'string' },
          model: { type: 'string' },
          duration: { type: 'integer' },
        },
      },
      // ── Superadmin ────────────────────────────
      CreateUserRequest: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8 },
          role: { type: 'string' },
          tenantId: { type: 'string', format: 'uuid' },
        },
      },
      SetupTenantRequest: {
        type: 'object',
        required: ['tenantName', 'userName', 'userEmail', 'planId'],
        properties: {
          tenantName: { type: 'string' },
          userName: { type: 'string' },
          userEmail: { type: 'string', format: 'email' },
          planId: { type: 'string', format: 'uuid' },
          password: { type: 'string' },
          codigo: { type: 'string' },
        },
      },
      UpdateUserRequest: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          role: { type: 'string' },
          active: { type: 'boolean' },
        },
      },
      UpdateSubscriptionRequest: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'trial', 'past_due', 'cancelled', 'inactive'] },
          planId: { type: 'string', format: 'uuid' },
        },
      },
      CreatePlanRequest: {
        type: 'object',
        required: ['name', 'priceCents', 'interval'],
        properties: {
          name: { type: 'string' },
          priceCents: { type: 'integer' },
          interval: { type: 'string', enum: ['monthly', 'yearly'] },
          isActive: { type: 'boolean' },
          limits: { type: 'object' },
        },
      },
      // ── Forms ─────────────────────────────────
      FormStartRequest: {
        type: 'object',
        properties: {
          formType: { type: 'string' },
          step: { type: 'string' },
        },
      },
      FormCompleteRequest: {
        type: 'object',
        properties: {
          formType: { type: 'string' },
          formData: { type: 'object' },
        },
      },
    },
  },
  tags: [
    { name: 'Health', description: 'Health check' },
    { name: 'Auth', description: 'Autenticação e gestão de usuário' },
    { name: 'Public', description: 'Endpoints públicos sem autenticação' },
    { name: 'Meta', description: 'Integração Meta Ads (Facebook/Instagram)' },
    { name: 'Metrics', description: 'Métricas de campanhas' },
    { name: 'Campaigns', description: 'Gestão de campanhas' },
    { name: 'Budget', description: 'Otimização de orçamento' },
    { name: 'Studio', description: 'Studio criativo (geração de criativos)' },
    { name: 'Automation', description: 'Automação e regras' },
    { name: 'Fury', description: 'Fury Engine — scores, regras e live feed' },
    { name: 'Dashboard', description: 'Dados do dashboard' },
    { name: 'Forms', description: 'Tracking de formulários' },
    { name: 'Goals', description: 'Configuração de objetivos' },
    { name: 'Billing', description: 'Assinaturas e pagamentos (Asaas)' },
    { name: 'Brand Kit', description: 'Configuração de identidade visual' },
    { name: 'Planner', description: 'Planejador de conteúdo' },
    { name: 'OpenRouter', description: 'Geração de IA via OpenRouter' },
    { name: 'Observability', description: 'KPIs de observabilidade' },
    { name: 'Superadmin', description: 'Administração multi-tenant (superadmin)' },
    { name: 'Instagram', description: 'Integração Instagram' },
  ],
  paths: {},
} as const;
