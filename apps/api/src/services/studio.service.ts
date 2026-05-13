import OpenAI from 'openai';
import { eq } from 'drizzle-orm';
import { db, creativeAssets, metaConnections } from '@fury/db';
import { AppError } from '../middleware/errorHandler.js';
import { complianceQueue, studioQueue, studioQueueEvents } from '../lib/queue.js';
import { saveTemporaryStudioImage } from '../lib/temp-storage.js';
import { decryptAccessToken, uploadAdImage } from '../lib/meta-api.js';
import { claude } from '../lib/claude.js';
const CHAR_LIMITS = {
  headline: 40,
  descricao: 125,
  cta: 20,
  completo: 300,
} as const;

type CopyType = keyof typeof CHAR_LIMITS;

export type StudioCopyTone = 'formal' | 'casual' | 'urgente' | 'emocional';

export interface GenerateCopyInput {
  tenantId: string;
  type: CopyType;
  produto: string;
  publico: string;
  objetivo: string;
  tom: StudioCopyTone;
  quantidadeVariacoes: number;
}

export interface GeneratedCopyVariation {
  texto: string;
  caracteres: number;
  pontuacao: number;
}

export interface GenerateCopyResult {
  variacoes: GeneratedCopyVariation[];
}

export interface StudioGenerationJobData extends GenerateCopyInput {}
export interface GenerateStudioImageResult {
  message: string;
}

function calcularPontuacao(texto: string, type: CopyType): number {
  let pontuacao = 3;

  if (texto.length <= CHAR_LIMITS[type]) {
    pontuacao += 3;
  }

  const ctaKeywords = ['compre', 'acesse', 'saiba', 'clique', 'garanta'];
  if (ctaKeywords.some((keyword) => texto.toLowerCase().includes(keyword))) {
    pontuacao += 2;
  }

  const forbiddenKeywords = ['grátis', 'garantido 100%', 'melhor do mundo'];
  if (!forbiddenKeywords.some((keyword) => texto.toLowerCase().includes(keyword))) {
    pontuacao += 2;
  }

  return Math.min(Math.max(pontuacao, 0), 10);
}

function buildMockVariations(input: GenerateCopyInput): GeneratedCopyVariation[] {
  const templates = [
    `${input.produto} — transforme seu negócio hoje!`,
    `Descubra ${input.produto} para ${input.publico}`,
    `A melhor escolha em ${input.produto}`,
    `Clique e conheça ${input.produto}`,
    `Garanta ${input.produto} agora mesmo`,
  ];

  const quantidade = Math.min(Math.max(input.quantidadeVariacoes || 3, 3), 5);

  return Array.from({ length: quantidade }, (_, index) => {
    const texto = templates[index % templates.length];
    return {
      texto,
      caracteres: texto.length,
      pontuacao: calcularPontuacao(texto, input.type),
    };
  });
}

function buildSystemPrompt(): string {
  return 'Você é um especialista em copywriting para anúncios digitais no Facebook e Instagram.\n\nGere variações de copy persuasivas, claras e em português brasileiro adequadas para o público-alvo.\n\nRespeite RIGOROSAMENTE os limites de caracteres especificados.\n\nResponda APENAS em JSON válido, sem texto adicional, sem markdown.';
}

function buildUserPrompt(input: GenerateCopyInput): string {
  const limiteChars = {
    headline: 40,
    descricao: 125,
    cta: 20,
    completo: 300,
  } as const;

  return `Produto/serviço: ${input.produto}\n\nPúblico-alvo: ${input.publico}\n\nObjetivo do anúncio: ${input.objetivo}\n\nTom de comunicação: ${input.tom}\n\nGere ${input.quantidadeVariacoes} variações de ${input.type} em português brasileiro.\n\nLimite máximo: ${limiteChars[input.type]} caracteres por variação.\n\nRetorne APENAS este JSON:\n\n{\n  "variacoes": [\n    { "texto": "texto da variação aqui", "caracteres": 0 }\n  ]\n}`;
}

export async function generateCopy(input: GenerateCopyInput): Promise<GenerateCopyResult> {
  if (!process.env.ANTHROPIC_API_KEY || process.env.META_USE_MOCK === 'true') {
    return { variacoes: buildMockVariations(input) };
  }

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: buildSystemPrompt(),
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
  });

  const responseText = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const cleaned = responseText.replace(/```json|```/g, '').trim();

  let parsed: { variacoes?: Array<{ texto?: string; text?: string }> } | null = null;
  try {
    parsed = JSON.parse(cleaned) as { variacoes?: Array<{ texto?: string; text?: string }> };
  } catch {
    return { variacoes: buildMockVariations(input) };
  }

  if (!parsed?.variacoes?.length) {
    return { variacoes: buildMockVariations(input) };
  }

  const variacoes = parsed.variacoes.map((variacao) => {
    const texto = String(variacao.texto ?? variacao.text ?? '');
    return {
      texto,
      caracteres: texto.length,
      pontuacao: calcularPontuacao(texto, input.type),
    };
  });

  return { variacoes: variacoes.slice(0, Math.min(Math.max(input.quantidadeVariacoes, 3), 5)) };
}

export async function requestStudioImageGeneration(_input?: unknown): Promise<GenerateStudioImageResult> {
  return { message: 'Rota de imagem ativa' };
}

export async function processStudioGenerationJob(_input?: StudioGenerationJobData): Promise<GenerateStudioImageResult> {
  return { message: 'Job de imagem processado' };
}

export const studioService = {
  generateCopy,
  requestStudioImageGeneration,
  processStudioGenerationJob,
};

 


const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 30000;

export async function uploadCreativeAssetToMeta(params: {
  tenantId: string;
  creativeAssetId: string;
  adAccountId: string;
}): Promise<{ metaAssetId: string }> {
  const asset = await db.query.creativeAssets.findFirst({
    where: eq(creativeAssets.id, params.creativeAssetId),
  });

  if (!asset) {
    throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset criativo nao encontrado.');
  }

  if (asset.tenantId !== params.tenantId) {
    throw new AppError(403, 'FORBIDDEN', 'Este asset nao pertence ao seu tenant.');
  }

  const metaConn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, params.tenantId),
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexao Meta encontrada para este tenant.');
  }

  const adAccounts = (metaConn.adAccounts as { id: string }[]) || [];
  const accountExists = adAccounts.some((acc) => acc.id === params.adAccountId);

  if (!accountExists) {
    throw new AppError(403, 'AD_ACCOUNT_NOT_FOUND', 'Conta de anuncio nao pertence a este tenant.');
  }

  const accessToken = decryptAccessToken(metaConn.accessToken);

  let imageResponse: Response;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);

    try {
      imageResponse = await fetch(asset.url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    const isTimeoutError = err instanceof DOMException && err.name === 'AbortError';
    const message = isTimeoutError
      ? 'Timeout ao baixar a imagem do asset (limite: 30s).'
      : 'Nao foi possivel baixar a imagem do asset.';
    throw new AppError(502, 'IMAGE_DOWNLOAD_FAILED', message);
  }

  if (!imageResponse.ok) {
    throw new AppError(502, 'IMAGE_DOWNLOAD_FAILED', 'Nao foi possivel baixar a imagem do asset.');
  }

  const contentType = imageResponse.headers.get('content-type') || '';
  const mimeType = contentType.split(';')[0]?.trim() ?? '';

  if (!VALID_IMAGE_TYPES.includes(mimeType)) {
    throw new AppError(400, 'INVALID_IMAGE_FORMAT', `Formato de imagem invalido: ${mimeType || 'desconhecido'}.`);
  }

  const arrayBuffer = await imageResponse.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError(400, 'IMAGE_TOO_LARGE', 'Imagem excede o tamanho maximo de 4MB.');
  }

  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const urlObj = new URL(asset.url);
  const filename = urlObj.pathname.split('/').pop() || 'image.jpg';

  let metaAssetId: string;
  try {
    metaAssetId = await uploadAdImage({
      adAccountId: params.adAccountId,
      base64,
      filename,
      accessToken,
    });
  } catch (err) {
    const metaCode = (err as any).metaCode;

    if (metaCode === 190) {
      throw new AppError(
        401,
        'META_TOKEN_EXPIRED',
        'Token Meta expirado. Reconecte sua conta em Configuracoes > Integracoes.'
      );
    }

    throw err;
  }

  await db
    .update(creativeAssets)
    .set({ metaAssetId, complianceStatus: 'approved' })
    .where(eq(creativeAssets.id, params.creativeAssetId));

  return { metaAssetId };
}
