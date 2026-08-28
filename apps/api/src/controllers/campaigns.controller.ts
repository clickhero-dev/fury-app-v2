import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { uploadAsset } from '../services/storage/storage.service.js';
import { CampaignsService, campaignsService } from '../services/campaigns/campaigns.service.js';
import { CampaignRepository } from '../repository/campaign.repository.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  getCampaignsCache,
  setCampaignsCache,
  invalidateCampaignsCache,
} from '../lib/campaigns-cache.js';
import { openrouterService, type ChatMessage } from '../services/llms/openrouter.service.js';
import { emailService } from '../services/email/email.service.js';
import { sendToTenant } from '../services/email/notify.js';

const createCampaignSchema = z.object({
  name: z.string().min(3, 'Campaign name must be at least 3 characters'),
  objective: z.enum(['OUTCOME_SALES', 'OUTCOME_LEADS', 'OUTCOME_TRAFFIC', 'OUTCOME_AWARENESS']),
  dailyBudget: z.number().int().min(500, 'Minimum budget is R$5.00 (500 cents)'),
  adAccountId: z.string().min(1),
});

const updateBudgetSchema = z.object({
  dailyBudget: z.number().int().min(500, 'Minimum budget is R$5.00 (500 cents)'),
});

const getCampaignsSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const updateCampaignSchema = z.object({
  name: z.string().min(3).optional(),
  budget: z
    .object({
      amount: z.number().int().min(500),
      type: z.enum(['daily', 'lifetime']),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    })
    .optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']),
});

const insightsSchema = z.object({
  date_range: z.enum(['last_7d', 'last_30d', 'last_90d', 'custom']).default('last_30d'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

const createWizardSchema = z
  .object({
    objective: z.enum(['visits', 'engagement', 'messages', 'whatsapp', 'whatsapp_conv']),

    creative_asset_id: z.string().min(1).optional(),
    creative_upload_url: z.string().min(1).optional(),
    creative_instagram_media_id: z.string().min(1).optional(),
    creative_media_url: z.string().min(1).optional(),
    headline: z.string().min(1).max(40),
    primary_text: z.string().min(1).max(125),
    destination_url: z.string().regex(/^https?:\/\//, 'URL inválida. Use http:// ou https://').optional(),

    location_city: z.string().min(1),
    location_city_key: z.string().min(1).optional(),
    location_radius_km: z.number().int().min(1).default(30).optional(),
    age_min: z.number().int().min(18).max(65),
    age_max: z.number().int().min(18).max(65),
    gender: z.enum(['all', 'male', 'female']),
    audience_interests: z.array(z.object({ id: z.string(), name: z.string() })).optional(),

    daily_budget_brl: z.number().min(7),
    duration_days: z.number().int().min(1).optional(),

    whatsapp_page_id: z.string().min(1).optional(),
    whatsapp_page_name: z.string().min(1).optional(),
    whatsapp_phone_number_id: z.string().min(1).optional(),
    whatsapp_phone_number: z.string().min(1).optional(),
    destinations: z.array(z.enum(['whatsapp', 'instagram_direct', 'messenger'])).optional(),
    instagram_user_id: z.string().min(1).optional(),
    instagram_username: z.string().min(1).optional(),
  })
  .refine(
    (data) => Boolean(data.creative_asset_id || data.creative_upload_url || data.creative_instagram_media_id),
    {
      message: 'Selecione uma imagem da galeria, envie um arquivo ou escolha um post do Instagram.',
      path: ['creative_asset_id'],
    }
  )
  .refine((data) => data.age_max >= data.age_min, {
    message: 'A idade máxima deve ser maior ou igual à idade mínima.',
    path: ['age_max'],
  })
  .refine((data) => data.objective !== 'visits' || Boolean(data.destination_url), {
    message: 'Informe o link de destino para o objetivo Visitas.',
    path: ['destination_url'],
  })
  .refine(
    (data) => {
      if (data.objective !== 'whatsapp') return true;
      return Boolean(data.whatsapp_page_id) && Boolean(data.destinations && data.destinations.length > 0);
    },
    {
      message: 'Selecione a Página do Facebook e ao menos um destino para receber as mensagens.',
      path: ['whatsapp_page_id'],
    }
  )
  .refine(
    (data) => {
      if (data.objective !== 'whatsapp') return true;
      if (!data.destinations?.includes('whatsapp')) return true;
      return Boolean(data.whatsapp_phone_number_id);
    },
    {
      message: 'Selecione o número de WhatsApp que receberá as mensagens.',
      path: ['whatsapp_phone_number_id'],
    }
  )
  .refine(
    (data) => {
      if (data.objective !== 'whatsapp') return true;
      if (!data.destinations?.includes('instagram_direct')) return true;
      return Boolean(data.instagram_user_id);
    },
    {
      message: 'Conecte uma conta do Instagram à Página no Meta Business para usar Instagram Direct.',
      path: ['instagram_user_id'],
    }
  );

const metaLocationsSchema = z.object({
  q: z.string().min(2, 'Digite ao menos 2 caracteres'),
});

const suggestTextSchema = z.object({
  imageUrl: z.string().url(),
});

const HEADLINE_MAX_LENGTH = 40;
const PRIMARY_TEXT_MAX_LENGTH = 125;

// Nemotron (free) primeiro; se falhar, cai pro Gemini 2.5 Flash Lite (pago).
const SUGGESTION_MODELS: { id: string; maxAttempts: number }[] = [
  { id: 'nvidia/nemotron-nano-12b-v2-vl:free', maxAttempts: 3 },
  { id: 'google/gemini-2.5-flash-lite', maxAttempts: 2 },
];

interface AdCopySuggestion {
  headline: string;
  primaryText: string;
}

function parseAdCopy(raw: string): AdCopySuggestion | null {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    const headline = String(parsed.headline || '').trim();
    const primaryText = String(parsed.primaryText || '').trim();
    if (!headline || !primaryText) return null;
    return { headline, primaryText };
  } catch {
    return null;
  }
}

// Retorna null (por esgotar tentativas ou erro de API) quando o chamador deve tentar o próximo modelo.
async function tryGenerateAdCopy(
  systemPrompt: string,
  promptText: string,
  imageUrl: string,
  model: string,
  maxAttempts: number,
): Promise<AdCopySuggestion | null> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: promptText },
        { type: 'image_url', image_url: { url: imageUrl } },
      ],
    },
  ];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let raw: string;
    try {
      raw = await openrouterService.chat(messages, { model, max_tokens: 256 });
    } catch (err) {
      console.warn(`[suggestText] modelo ${model} falhou:`, (err as Error).message);
      return null;
    }

    const parsed = parseAdCopy(raw);

    if (
      parsed &&
      parsed.headline.length <= HEADLINE_MAX_LENGTH &&
      parsed.primaryText.length <= PRIMARY_TEXT_MAX_LENGTH
    ) {
      return parsed;
    }

    const issues: string[] = [];
    if (!parsed) {
      issues.push('a resposta anterior não veio em JSON válido');
    } else {
      if (parsed.headline.length > HEADLINE_MAX_LENGTH) {
        issues.push(`headline ficou com ${parsed.headline.length} caracteres (máximo ${HEADLINE_MAX_LENGTH})`);
      }
      if (parsed.primaryText.length > PRIMARY_TEXT_MAX_LENGTH) {
        issues.push(`primary_text ficou com ${parsed.primaryText.length} caracteres (máximo ${PRIMARY_TEXT_MAX_LENGTH})`);
      }
    }

    messages.push(
      { role: 'assistant', content: raw },
      {
        role: 'user',
        content: `Isso não serve: ${issues.join('; ')}. Reescreva mais curto SEM cortar frases no meio — construa headline e primary_text que já nasçam dentro do limite. Responda APENAS com o JSON {"headline":"...","primaryText":"..."}, sem markdown.`,
      },
    );
  }

  return null;
}

async function generateAdCopyWithinLimits(
  systemPrompt: string,
  promptText: string,
  imageUrl: string,
): Promise<AdCopySuggestion | null> {
  for (const { id: model, maxAttempts } of SUGGESTION_MODELS) {
    const result = await tryGenerateAdCopy(systemPrompt, promptText, imageUrl, model, maxAttempts);
    if (result) return result;
  }
  return null;
}

// mirrors ALLOWED_MEDIA_HOSTS em instagram.controller.ts — evita SSRF via imageUrl do cliente.
const IMAGE_URL_ALLOWED_HOSTS = [/(^|\.)cdninstagram\.com$/, /(^|\.)fbcdn\.net$/];

function isAllowedImageUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;

  if (process.env.R2_PUBLIC_URL) {
    try {
      if (parsed.origin === new URL(process.env.R2_PUBLIC_URL).origin) return true;
    } catch {
      /* R2_PUBLIC_URL mal configurada, ignora */
    }
  }

  // Nunca derivar de req.protocol/req.get('host') aqui — o requisitante os controla.
  if (process.env.PUBLIC_BASE_URL) {
    try {
      if (parsed.origin === new URL(process.env.PUBLIC_BASE_URL).origin && parsed.pathname.startsWith('/studio-assets/')) {
        return true;
      }
    } catch {
      /* PUBLIC_BASE_URL mal configurada, ignora */
    }
  }

  return IMAGE_URL_ALLOWED_HOSTS.some((pattern) => pattern.test(parsed.hostname));
}

/**
 * Controller de campanhas / Meta Ads — glue HTTP fino.
 * Injeta o service classe e um factory de repositório tenant-bound (DI/composition root).
 */
export class CampaignsController {
  constructor(
    private campaignsService: CampaignsService,
    private repoFactory: (tenantId: string) => CampaignRepository,
  ) {}

  createCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = createCampaignSchema.parse(req.body);
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const campaign = await this.campaignsService.createCampaign({
        tenantId,
        ...data,
      });

      res.status(201).json({
        success: true,
        data: campaign,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  pauseCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      if (!id) {
        throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
      }

      const result = await this.campaignsService.pauseCampaign({ tenantId, campaignId: id });

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  resumeCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      if (!id) {
        throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
      }

      const result = await this.campaignsService.resumeCampaign({ tenantId, campaignId: id });

      res.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  updateBudget = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = updateBudgetSchema.parse(req.body);
      const { id } = req.params;
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      if (!id) {
        throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
      }

      const campaign = await this.campaignsService.updateCampaignBudget({
        tenantId,
        campaignId: id,
        dailyBudget: data.dailyBudget,
      });

      res.json({
        success: true,
        data: campaign,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      if (!id) {
        throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
      }

      const detail = await this.campaignsService.getCampaignPanelDetail({ tenantId, campaignId: id });

      if (!detail) {
        return res.status(404).json({ error: 'Campanha não encontrada' });
      }

      return res.json(detail);
    } catch (err) {
      next(err);
    }
  };

  getCampaigns = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = getCampaignsSchema.parse(req.query);
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const cacheKey = { tenantId, status: query.status, limit: query.limit, offset: query.offset };
      const cached = await getCampaignsCache(cacheKey);

      if (cached) {
        return res.json({
          success: true,
          data: cached.items,
          pagination: {
            total: cached.total,
            limit: query.limit,
            offset: query.offset,
          },
          timestamp: new Date().toISOString(),
        });
      }

      const result = await this.campaignsService.getCampaigns({
        tenantId,
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      });

      await setCampaignsCache(cacheKey, result);

      res.json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  updateCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const data = updateCampaignSchema.parse(req.body);
      const tenantId = req.tenant?.tenantId || '';

      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      if (!id) {
        throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
      }

      const campaign = await this.campaignsService.updateCampaign({
        tenantId,
        campaignId: id,
        name: data.name,
        budget: data.budget,
      });

      await invalidateCampaignsCache(tenantId);

      res.json({
        success: true,
        data: campaign,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  updateCampaignStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const data = updateStatusSchema.parse(req.body);
      const tenantId = req.tenant?.tenantId || '';
      const userId = (req as any).user?.id || '';

      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      if (!id) {
        throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
      }

      const campaign = await this.campaignsService.updateCampaignStatus({
        tenantId,
        campaignId: id,
        status: data.status,
        userId,
      });

      await invalidateCampaignsCache(tenantId);

      res.json({
        success: true,
        data: campaign,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  softDeleteCampaign = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const tenantId = req.tenant?.tenantId || '';
      const userId = (req as any).user?.id || '';

      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      if (!id) {
        throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
      }

      const campaign = await this.campaignsService.softDeleteCampaign({
        tenantId,
        campaignId: id,
        userId,
      });

      await invalidateCampaignsCache(tenantId);

      res.json({
        success: true,
        data: campaign,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  getCampaignInsights = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const query = insightsSchema.parse(req.query);
      const tenantId = req.tenant?.tenantId || '';

      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      if (!id) {
        throw new AppError(400, 'MISSING_CAMPAIGN_ID', 'Campaign ID is required');
      }

      const insights = await this.campaignsService.getCampaignInsights({
        tenantId,
        campaignId: id,
        dateRange: query.date_range,
        startDate: query.start_date,
        endDate: query.end_date,
      });

      res.json({
        success: true,
        data: insights,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  createWizardCampaign = async (req: Request, res: Response, next: NextFunction) => {
    // Timeout de 120s — se estourar, retorna JSON 504 em vez de deixar o proxy
    // (Traefik) retornar 502 HTML. Operações de upload de imagem ao Meta podem
    // demorar bastante, então aumentamos de 55s para 120s.
    const timeoutMs = 120_000;
    req.setTimeout(timeoutMs);
    res.setTimeout(timeoutMs);

    let timedOut = false;
    const onTimeout = () => {
      timedOut = true;
      if (!res.headersSent) {
        res.status(504).json({
          success: false,
          timestamp: new Date().toISOString(),
          error: {
            code: 'GATEWAY_TIMEOUT',
            message: 'A criação da campanha excedeu o tempo limite. Tente novamente.',
          },
        });
      }
    };
    req.on('timeout', onTimeout);
    res.on('timeout', onTimeout);

    try {
      const data = createWizardSchema.parse(req.body);
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const result = await this.campaignsService.createCampaignFromWizard({
        tenantId,
        objective: data.objective,
        creativeAssetId: data.creative_asset_id,
        creativeUploadUrl: data.creative_upload_url,
        creativeInstagramMediaId: data.creative_instagram_media_id,
        creativeMediaUrl: data.creative_media_url,
        headline: data.headline,
        primaryText: data.primary_text,
        destinationUrl: data.destination_url,
        locationCity: data.location_city,
        locationCityKey: data.location_city_key,
        locationRadiusKm: data.location_radius_km ?? 30,
        ageMin: data.age_min,
        ageMax: data.age_max,
        gender: data.gender,
        dailyBudgetBrl: data.daily_budget_brl,
        durationDays: data.duration_days,
        whatsappPageId: data.whatsapp_page_id,
        whatsappPageName: data.whatsapp_page_name,
        whatsappPhoneNumberId: data.whatsapp_phone_number_id,
        whatsappPhoneNumber: data.whatsapp_phone_number,
        destinations: data.destinations,
        instagramUserId: data.instagram_user_id,
        instagramUsername: data.instagram_username,
        audienceInterests: data.audience_interests,
      });

      if (timedOut) return;

      // Email transacional: campanha publicada pela aplicação (fire-and-forget)
      const campaignName =
        (result as any)?.campaign?.name ?? (result as any)?.campaignName ?? (result as any)?.name ?? 'sua campanha';
      await sendToTenant(tenantId, req.user?.email, (to) => emailService.sendCampaignPublished(to, campaignName));

      res.status(201).json(result);
    } catch (err) {
      if (timedOut) return;
      next(err);
    } finally {
      req.off('timeout', onTimeout);
      res.off('timeout', onTimeout);
    }
  };

  uploadWizardCreative = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      if (!req.file) {
        throw new AppError(400, 'NO_FILE', 'Nenhum arquivo enviado');
      }

      const extensionByMime: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };
      const extension = extensionByMime[req.file.mimetype] ?? 'jpg';
      const fileName = `campaign-wizard/${tenantId}/${randomUUID()}.${extension}`;
      const url = await uploadAsset(req.file.buffer, fileName, req.file.mimetype);

      res.status(201).json({ success: true, data: { url }, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };

  mcpLogWizard = async (req: Request, res: Response, _next: NextFunction) => {
    const startTime = Date.now();
    const steps: Array<{ step: string; status: string; duration_ms: number; error?: string; meta_response?: unknown }> = [];

    function recordStep(step: string, status: string, metaResponse?: unknown) {
      steps.push({
        step,
        status,
        duration_ms: Date.now() - startTime,
        ...(metaResponse !== undefined ? { meta_response: metaResponse } : {}),
      });
    }

    try {
      // Step 1: Parse body
      let data: any;
      try {
        data = createWizardSchema.parse(req.body);
        recordStep('zod_parse', 'ok');
      } catch (zodErr: any) {
        recordStep('zod_parse', 'fail');
        return res.status(400).json({
          success: false,
          endpoint: 'mcp-log',
          error: {
            code: 'VALIDATION_ERROR',
            message: zodErr.message,
            issues: zodErr.issues || [],
          },
          steps,
          request_body: req.body,
        });
      }

      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        return res.status(401).json({
          success: false,
          endpoint: 'mcp-log',
          error: { code: 'UNAUTHORIZED', message: 'Tenant ID required' },
          steps,
        });
      }

      // Step 2: Call createCampaignFromWizard
      try {
        const result = await this.campaignsService.createCampaignFromWizard({
          tenantId,
          objective: data.objective,
          creativeAssetId: data.creative_asset_id,
          creativeUploadUrl: data.creative_upload_url,
          creativeInstagramMediaId: data.creative_instagram_media_id,
          creativeMediaUrl: data.creative_media_url,
          headline: data.headline,
          primaryText: data.primary_text,
          destinationUrl: data.destination_url,
          locationCity: data.location_city,
          locationCityKey: data.location_city_key,
          locationRadiusKm: data.location_radius_km ?? 30,
          ageMin: data.age_min,
          ageMax: data.age_max,
          gender: data.gender,
          dailyBudgetBrl: data.daily_budget_brl,
          durationDays: data.duration_days,
          whatsappPageId: data.whatsapp_page_id,
          whatsappPageName: data.whatsapp_page_name,
          whatsappPhoneNumberId: data.whatsapp_phone_number_id,
          whatsappPhoneNumber: data.whatsapp_phone_number,
          destinations: data.destinations,
          instagramUserId: data.instagram_user_id,
          instagramUsername: data.instagram_username,
        });

        recordStep('wizard_complete', 'ok');
        return res.status(201).json({
          success: true,
          endpoint: 'mcp-log',
          data: result,
          steps,
          total_duration_ms: Date.now() - startTime,
        });
      } catch (wizardErr: any) {
        // Captura TUDO do erro: stack, props da Meta, código, etc.
        recordStep('wizard_error', 'fail');
        return res.status(200).json({  // 200 de propósito pra nunca dar 502
          success: false,
          endpoint: 'mcp-log',
          error: {
            name: wizardErr.name,
            message: wizardErr.message,
            code: wizardErr.code,
            statusCode: wizardErr.statusCode,
            // Props injetadas pelo metaApiCall
            metaCode: wizardErr.metaCode,
            metaSubcode: wizardErr.metaSubcode,
            metaType: wizardErr.metaType,
            httpStatus: wizardErr.httpStatus,
            metaUserMsg: wizardErr.metaUserMsg,
            metaUserTitle: wizardErr.metaUserTitle,
            metaBlameField: wizardErr.metaBlameField,
            // Detalhes extras do AppError
            details: wizardErr.details,
          },
          stack: wizardErr.stack?.split('\n').slice(0, 20) || null,
          steps,
          total_duration_ms: Date.now() - startTime,
          request_payload: {
            objective: data.objective,
            location_city: data.location_city,
            location_radius_km: data.location_radius_km,
            daily_budget_brl: data.daily_budget_brl,
            duration_days: data.duration_days,
            has_image: !!(data.creative_upload_url || data.creative_asset_id || data.creative_instagram_media_id),
          },
        });
      }
    } catch (outerErr: any) {
      // Catch-all para erros inesperados (nunca deve acontecer, mas seguro morreu de velho)
      return res.status(200).json({
        success: false,
        endpoint: 'mcp-log',
        error: {
          name: outerErr.name,
          message: outerErr.message,
          code: 'UNEXPECTED',
        },
        stack: outerErr.stack?.split('\n').slice(0, 20) || null,
        steps,
        total_duration_ms: Date.now() - startTime,
      });
    }
  };

  searchMetaLocations = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = metaLocationsSchema.parse(req.query);
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const results = await this.campaignsService.searchMetaLocations({ tenantId, query: query.q });

      res.json({
        success: true,
        data: results,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  searchMetaInterests = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = metaLocationsSchema.parse(req.query);
      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) {
        throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
      }

      const results = await this.campaignsService.searchMetaInterests({ tenantId, query: query.q });

      res.json({
        success: true,
        data: results,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  createWizardCampaignDiag = async (req: any, res: any) => {
    // DIAG: Test if createCampaignFromWizard is importable and callable
    try {
      const { createCampaignFromWizard } = await import('../services/campaigns/campaigns.service.js');
      if (typeof createCampaignFromWizard !== 'function') {
        return res.json({ success: false, error: { code: 'NOT_A_FUNCTION', type: typeof createCampaignFromWizard } });
      }
      return res.json({ success: true, message: 'createCampaignFromWizard is a function and importable' });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: { code: 'IMPORT_FAIL', message: e.message, stack: e.stack?.split('\n').slice(0, 5) } });
    }
  };

  suggestText = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { imageUrl } = suggestTextSchema.parse(req.body);

      const tenantId = req.tenant?.tenantId || '';
      if (!tenantId) throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');

      if (!isAllowedImageUrl(imageUrl)) {
        throw new AppError(400, 'INVALID_IMAGE_URL', 'URL de imagem não permitida.');
      }

      const repo = this.repoFactory(tenantId);
      const brandKit = await repo.findBrandKit();
      const tenant = await repo.findTenant();

      const promptText = `Você é copywriter especialista em Meta Ads. Observe a imagem do anúncio anexada e, com base no que ela mostra (produto, oferta, estilo visual) e nos dados da marca abaixo, gere UM título (headline) e UM texto principal (primary_text) para um anúncio no Facebook/Instagram.

Dados da marca:
- Tom de voz: ${brandKit?.voiceTone || 'não definido'}
- Ramo da empresa: ${tenant?.businessContext || 'não informado'}
- Cores da marca: ${brandKit?.primaryColor || ''} ${brandKit?.secondaryColor || ''}

Regras (OBRIGATÓRIO respeitar, a resposta será rejeitada se não respeitar):
- headline: no MÁXIMO ${HEADLINE_MAX_LENGTH} caracteres (conte antes de responder), chamativa, ação, referenciando o que aparece na imagem quando fizer sentido
- primary_text: no MÁXIMO ${PRIMARY_TEXT_MAX_LENGTH} caracteres (conte antes de responder), descritivo, com call to action, frase completa (não pode terminar cortada no meio)
- Responda APENAS JSON: {"headline":"...","primaryText":"..."}
- Português brasileiro, sem erros ortográficos`;

      const suggestion = await generateAdCopyWithinLimits(
        'Você é copywriter especialista em Meta Ads. Responda sempre em português brasileiro.',
        promptText,
        imageUrl,
      );

      const headline = suggestion?.headline ?? 'Promoção imperdível';
      const primaryText = suggestion?.primaryText ?? 'Aproveite esta oferta especial por tempo limitado.';

      res.json({ success: true, data: { headline, primaryText }, timestamp: new Date().toISOString() });
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Singleton do controller usado como aliases de módulo (backward-compat).
 * Rotas novos usam o composition root (di.ts). Aliases preservam chamadores
 * existentes (ex.: rotas/middleware que importam handlers direto do controller).
 */
const campaignsController = new CampaignsController(
  campaignsService,
  (tenantId: string) => new CampaignRepository(tenantId),
);

export const createCampaignHandler = campaignsController.createCampaign;
export const pauseCampaignHandler = campaignsController.pauseCampaign;
export const resumeCampaignHandler = campaignsController.resumeCampaign;
export const updateBudgetHandler = campaignsController.updateBudget;
export const getCampaignHandler = campaignsController.getCampaign;
export const getCampaignsHandler = campaignsController.getCampaigns;
export const updateCampaignHandler = campaignsController.updateCampaign;
export const updateCampaignStatusHandler = campaignsController.updateCampaignStatus;
export const softDeleteCampaignHandler = campaignsController.softDeleteCampaign;
export const getCampaignInsightsHandler = campaignsController.getCampaignInsights;
export const createWizardCampaignHandler = campaignsController.createWizardCampaign;
export const mcpLogWizardHandler = campaignsController.mcpLogWizard;
export const searchMetaLocationsHandler = campaignsController.searchMetaLocations;
export const uploadWizardCreativeHandler = campaignsController.uploadWizardCreative;
export const createWizardCampaignDiagHandler = campaignsController.createWizardCampaignDiag;
export const searchMetaInterestsHandler = campaignsController.searchMetaInterests;
export const suggestTextHandler = campaignsController.suggestText;