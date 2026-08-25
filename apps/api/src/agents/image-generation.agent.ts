import { openrouterService } from '../services/llms/openrouter.service.js';
import { db, brandKits } from '@fury/db';
import { eq } from 'drizzle-orm';
import type { AgentContext, PlannerOutput, CreativeOutput, ImageGenerationOutput } from './types.js';
import { validateAndUploadImage, getFluxResolution, getFluxAspectRatio } from '../lib/image-validation.js';

async function enhancePrompt(prompt: string): Promise<string> {
  if (prompt.length >= 150) return prompt;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return prompt;

  const systemMessage = [
    'Você é um especialista em publicidade digital especializado em descrições de imagens.',
    'Preserve o tema principal do prompt original. Adicione detalhes visuais (iluminação, composição, ângulo, cores) SEM mudar o assunto principal.',
    'O prompt melhorado deve ter entre 150 e 400 caracteres e estar em português.',
    'Retorne APENAS o prompt melhorado, sem aspas, sem introdução.',
  ].join('\n');

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: `Prompt original: "${prompt}"` },
        ],
        temperature: 0.7,
        max_tokens: 600,
      }),
    });

    if (!response.ok) return prompt;

    const data = await response.json() as { choices?: { message?: { content: string } }[] };
    const improved = data?.choices?.[0]?.message?.content?.trim();
    return improved && improved.length > 0 ? improved : prompt;
  } catch {
    return prompt;
  }
}

export async function imageGenerationAgent(
  ctx: AgentContext,
  creative: CreativeOutput,
  planner: PlannerOutput
): Promise<ImageGenerationOutput> {
  const postsWithPrompts = planner.posts
    .map(p => {
      const creativePost = creative.posts.find(c => c.dayIndex === p.dayIndex);
      return { ...p, prompt: creativePost?.imagePrompt };
    })
    .filter(p => p.prompt);

  // Ao usar OpenRouter, checa créditos uma vez antes de gerar as imagens.
  if (process.env.OPENROUTER_API_KEY) {
    await openrouterService.assertCreditsAvailable();
  }

  const results = await Promise.all(
    postsWithPrompts.map(post =>
      generateAndValidateImage(ctx, post.prompt!, post.postType, post.dayIndex, ctx.tenantId)
    )
  );

  return { posts: results };
}

async function generateAndValidateImage(
  ctx: AgentContext,
  prompt: string,
  postType: string,
  dayIndex: number,
  tenantId: string
): Promise<{
  dayIndex: number;
  imageUrl: string;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp';
  sizeBytes: number;
  postType: 'feed' | 'carousel' | 'image' | 'stories';
  aspectRatio: string;
  validated: boolean;
}> {
  const enhancedPrompt = await enhancePrompt(prompt);

  const brandKit = await db.query.brandKits.findFirst({
    where: eq(brandKits.tenantId, tenantId),
  });

  // Use FLUX-compatible resolution and aspect ratio
  const aspectRatio = getFluxAspectRatio(postType as any);
  const resolution = getFluxResolution(postType as any);

  let base64: string;
  if (process.env.OPENROUTER_API_KEY) {
    base64 = await openrouterService.generateImage({
      model: 'black-forest-labs/flux.2-klein-4b',
      prompt: enhancedPrompt,
      aspect_ratio: aspectRatio,
      resolution: resolution,
      logoUrl: brandKit?.logoUrl ?? undefined,
    });
  } else {
    base64 = await generateDalle3Fallback(enhancedPrompt, aspectRatio, resolution);
  }

  const validated = await validateAndUploadImage(base64, postType as any, dayIndex, tenantId);

  return { dayIndex, ...validated };
}

async function generateDalle3Fallback(
  prompt: string,
  aspectRatio: string,
  resolution: string
): Promise<string> {
  const { OpenAI } = await import('openai');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada para fallback DALL-E 3');
  }

  const client = new OpenAI({ apiKey });
  const response = await client.images.generate({
    model: 'dall-e-3',
    prompt,
    size: resolution,
    quality: 'standard',
    style: 'vivid',
    response_format: 'b64_json',
  });

  const generatedBase64 = response.data?.[0]?.b64_json;
  if (!generatedBase64) {
    throw new Error('DALL-E 3 não retornou imagem');
  }
  return `data:image/png;base64,${generatedBase64}`;
}