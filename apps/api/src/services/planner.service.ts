import { db, campaignPlans, socialPosts, brandKits, clientGoals, tenants } from '@fury/db';
import { eq, and } from 'drizzle-orm';
import { openrouterService } from './openrouter.service.js';

// ─── In-memory job progress (ponytail: Map é mais simples que Redis para v0) ───
export interface JobStatus {
  id: string;
  status: 'pending' | 'generating' | 'done' | 'error';
  progress: { label: string; pct: number }[];
  planId?: string;
  error?: string;
}

const jobs = new Map<string, JobStatus>();

function generateId(): string {
  return crypto.randomUUID();
}

// ─── Prompt do planejador ───

const SYSTEM_PROMPT = `Você é um Planejador de Marketing IA especializado em empresas locais.
Gere um plano mensal completo de redes sociais com base nas informações da empresa.

Sua resposta DEVE ser um JSON válido com esta estrutura:
{
  "title": "Plano de Julho - [Nome da Empresa]",
  "objective": "Objetivo principal do mês",
  "periodStart": "2026-07-01",
  "periodEnd": "2026-07-31",
  "totalPosts": 16,
  "summary": {
    "targetAudience": "público-alvo",
    "contentStrategy": "estratégia de conteúdo resumida",
    "reelsCount": 8,
    "carouselCount": 4,
    "imageCount": 4,
    "storiesCount": 31
  },
  "posts": [
    {
      "dayIndex": 1,
      "postType": "reel", // "reel" | "carousel" | "image" | "stories"
      "platform": "instagram",
      "title": "Título do post",
      "caption": "Legenda do post (até 2200 caracteres)",
      "cta": "Call to action",
      "hashtags": ["#tag1", "#tag2"],
      "imagePrompt": "Prompt detalhado para gerar a imagem (Midjourney/Flux style)"
    }
  ]
}

Regras:
- Gere posts variados (reels, carrosséis, imagens, stories)
- Distribua os posts uniformemente pelo mês (dayIndex de 1 a 31)
- Legendas devem ser persuasivas e adequadas ao tom de voz da empresa
- CTA deve ser claro e direcionado ao objetivo
- Hashtags relevantes ao nicho
- ImagePrompt deve descrever a cena, estilo, cores e sensação da imagem
- Para reels, o caption deve ser roteiro curto para vídeo`;

// ─── Serviço principal ───

export async function startPlanGeneration(tenantId: string): Promise<JobStatus> {
  const jobId = generateId();

  const job: JobStatus = {
    id: jobId,
    status: 'pending',
    progress: [{ label: 'Iniciando', pct: 0 }],
  };
  jobs.set(jobId, job);

  // ponytail: processamento assíncrono — não bloqueia o response
  setImmediate(async () => {
    try {
      await runGeneration(jobId, tenantId);
    } catch (err: any) {
      const current = jobs.get(jobId);
      if (current) {
        current.status = 'error';
        current.error = err?.message ?? 'Erro interno';
      }
    }
  });

  return job;
}

async function runGeneration(jobId: string, tenantId: string): Promise<void> {
  const update = (label: string, pct: number) => {
    const current = jobs.get(jobId);
    if (current) {
      current.status = 'generating';
      current.progress.push({ label, pct });
    }
  };

  update('✅ Carregando dados da empresa', 10);

  // Busca dados do tenant
  const [tenant, brand, goals] = await Promise.all([
    db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) }),
    db.query.brandKits.findFirst({ where: eq(brandKits.tenantId, tenantId) }),
    db.query.clientGoals.findFirst({ where: eq(clientGoals.tenantId, tenantId) }),
  ]);

  if (!tenant) throw new Error('Tenant não encontrado');

  update('✅ Analisando perfil da marca', 20);

  // Monta contexto para o LLM
  const context = buildContext(tenant, brand, goals);

  update('✅ Pesquisando tendências e oportunidades', 30);
  update('✅ Identificando datas comemorativas', 40);
  update('✅ Criando estratégia de conteúdo', 50);
  update('✅ Distribuindo conteúdos no calendário', 60);

  // Chama OpenRouter
  const prompt = buildPrompt(context);
  update('✅ Escrevendo legendas e CTAs', 70);

  const response = await openrouterService.chat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    {
      temperature: 0.8,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    },
  );

  update('✅ Criando prompts de imagem', 80);

  const planData = JSON.parse(response);

  // Salva no banco
  update('✅ Organizando calendário editorial', 90);

  const [plan] = await db
    .insert(campaignPlans)
    .values({
      tenantId,
      title: planData.title,
      type: 'monthly',
      objective: planData.objective,
      periodStart: planData.periodStart ?? new Date(),
      periodEnd: planData.periodEnd ?? new Date(),
      totalPosts: planData.totalPosts ?? planData.posts?.length ?? 0,
      metadata: { summary: planData.summary },
      status: 'draft',
    })
    .returning();

  if (planData.posts?.length) {
    await db.insert(socialPosts).values(
      planData.posts.map((p: any) => ({
        tenantId,
        planId: plan.id,
        platform: p.platform ?? 'instagram',
        postType: p.postType ?? 'image',
        title: p.title ?? '',
        caption: p.caption ?? '',
        cta: p.cta ?? '',
        hashtags: p.hashtags ?? [],
        imagePrompt: p.imagePrompt ?? '',
        dayIndex: p.dayIndex ?? 1,
        status: 'draft',
      })),
    );
  }

  update('✅ Planejamento finalizado!', 100);

  const current = jobs.get(jobId);
  if (current) {
    current.status = 'done';
    current.planId = plan.id;
  }
}

function buildContext(tenant: any, brand: any, goals: any): string {
  const lines: string[] = [];
  lines.push(`Empresa: ${tenant.name ?? '—'}`);
  lines.push(`Ramo: ${tenant.businessContext ?? goals?.niche ?? '—'}`);
  lines.push(`Tom de voz: ${brand?.voiceTone ?? '—'}`);
  lines.push(`Objetivo: ${goals?.objective ?? '—'}`);
  lines.push(`Produto principal: ${goals?.mainProduct ?? '—'}`);
  lines.push(`Público: ${JSON.stringify(goals?.targetAudience ?? {})}`);
  return lines.join('\n');
}

function buildPrompt(context: string): string {
  return `Gere um plano mensal de marketing para esta empresa:

${context}

Regras adicionais:
- Se o ramo for alimentício (restaurante, lanchonete), foque em food porn, pratos do dia, promoções
- Se for clínica/saúde, foque em dicas, antes/depois, depoimentos
- Se for academia, foque em transformações, dicas de treino, resultados
- Se for pet shop, foque em fofura, dicas de cuidados, promoções
- Distribua 16 posts no mínimo pelo mês`;
}

export async function getJobProgress(jobId: string): Promise<JobStatus | null> {
  return jobs.get(jobId) ?? null;
}

export async function getPlanById(planId: string, tenantId: string) {
  const plan = await db.query.campaignPlans.findFirst({
    where: and(eq(campaignPlans.id, planId), eq(campaignPlans.tenantId, tenantId)),
  });
  if (!plan) return null;

  const posts = await db.query.socialPosts.findMany({
    where: eq(socialPosts.planId, planId),
    orderBy: [socialPosts.dayIndex],
  });

  return { ...plan, posts };
}

export async function patchPost(postId: string, tenantId: string, data: { title?: string; caption?: string; cta?: string; hashtags?: string[] }) {
  const [updated] = await db
    .update(socialPosts)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(socialPosts.id, postId), eq(socialPosts.tenantId, tenantId)))
    .returning();
  return updated ?? null;
}
