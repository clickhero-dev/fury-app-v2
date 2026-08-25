import { randomUUID } from 'node:crypto';
import { openrouterService } from '../services/llms/openrouter.service.js';
import { uploadAsset } from '../services/storage/storage.service.js';
import type { AgentContext, PlannerOutput, CreativeOutput } from './types.js';
import { parseAgentJSON } from './utils.js';

// Modelo de imagem padrão para o planejador — bom custo-benefício
const IMAGE_MODEL = 'black-forest-labs/flux.2-klein-4b';

// Aspect ratio por tipo de post
const ASPECT_BY_TYPE: Record<string, string> = {
  image: '1:1',
  carousel: '1:1',
  reel: '9:16',
  stories: '9:16',
};

export async function creativeAgent(ctx: AgentContext, planner: PlannerOutput): Promise<CreativeOutput> {
  const postsDesc = planner.posts.map(p => `Dia ${p.dayIndex} — ${p.postType} — "${p.title}"`).join('\n');
  const prompt = `Crie prompts de imagem IA estilo FLUX para:
Empresa: ${ctx.tenant.name}
Posts:
${postsDesc}

Regras: Descreva cena, estilo, cores. 30-80 palavras.

JSON: {"posts":[{"dayIndex":1,"imagePrompt":"Cena detalhada..."}]}`;
  const raw = await openrouterService.chat(
    [{ role: 'system', content: 'Diretor de arte. JSON.' }, { role: 'user', content: prompt }],
    { temperature: 0.9, max_tokens: 3000, response_format: { type: 'json_object' } },
  );
  const creative = parseAgentJSON<CreativeOutput>(raw);

  // Gera imagem real para cada post usando o prompt criado
  const enrichedPosts = await Promise.all(
    creative.posts.map(async (post) => {
      const plannerPost = planner.posts.find(p => p.dayIndex === post.dayIndex);
      const aspect = ASPECT_BY_TYPE[plannerPost?.postType ?? 'image'] ?? '1:1';
      try {
        const imageUrl = await generateWithRetry(post.imagePrompt, aspect, ctx, post.dayIndex);
        return { ...post, imageUrl };
      } catch (err) {
        console.warn(`[creative.agent] Falha ao gerar imagem para dia ${post.dayIndex} após retry:`, (err as Error).message);
        return post;
      }
    }),
  );

  return { posts: enrichedPosts };
}

/**
 * Faz upload da imagem gerada (base64 data URL) para o storage.
 * Usa R2 se configurado, senão salva localmente.
 */
async function uploadGeneratedImage(base64DataUrl: string, tenantId: string, dayIndex: number): Promise<string> {
  const match = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error('Formato de imagem inválido');

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const ext = mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
  const fileName = `planner/${tenantId}/${dayIndex}-${randomUUID()}.${ext}`;

  if (process.env.R2_ENDPOINT && process.env.R2_PUBLIC_URL) {
    return uploadAsset(buffer, fileName, mimeType);
  }

  // Fallback local — serve a imagem via rota estática /studio-assets/
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const localDir = join(process.cwd(), 'studio-assets', 'planner', tenantId);
  await mkdir(localDir, { recursive: true });
  const localName = `${dayIndex}-${randomUUID()}.${ext}`;
  await writeFile(join(localDir, localName), buffer);
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.APP_URL || `https://${process.env.DOMAIN || 'localhost'}`;
  return `${baseUrl.replace(/\/+$/, '')}/studio-assets/planner/${tenantId}/${localName}`;
}

async function generateWithRetry(
  prompt: string,
  aspect: string,
  ctx: AgentContext,
  dayIndex: number,
): Promise<string> {
  const MAX_RETRIES = 2;
  let lastErr: Error | undefined;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const base64DataUrl = await openrouterService.generateImage({
        model: IMAGE_MODEL,
        prompt,
        aspect_ratio: aspect,
        logoUrl: ctx.brandKit?.logoUrl,
      });
      return await uploadGeneratedImage(base64DataUrl, ctx.tenantId, dayIndex);
    } catch (err) {
      lastErr = err as Error;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  throw lastErr;
}
