import { Worker } from 'bullmq';
import OpenAI from 'openai';
import { db, creativeAssets } from '@fury/db';
import { eq } from 'drizzle-orm';
import { getRedis } from '../lib/redis.js';
import { STUDIO_COMPLIANCE_QUEUE_NAME } from '../lib/queue.js';

interface ComplianceJobData {
  creativeAssetId: string;
  tenantId: string;
}

interface ComplianceAnalysis {
  approved: boolean;
  issues: string[];
  text_percentage: number;
}

let complianceWorkerInstance: Worker<ComplianceJobData> | null = null;

const createComplianceWorker = (): Worker<ComplianceJobData> => {
  return new Worker<ComplianceJobData>(
    STUDIO_COMPLIANCE_QUEUE_NAME,
    async (job) => {
      const { creativeAssetId, tenantId } = job.data;

      console.log(`[COMPLIANCE] 🔍 Iniciando análise do asset: ${creativeAssetId} | Tenant: ${tenantId}`);

      try {
        // 1. Buscar asset no banco
        const assets = await db
          .select()
          .from(creativeAssets)
          .where(eq(creativeAssets.id, creativeAssetId))
          .limit(1);

        const asset = assets[0];

        if (!asset) {
          console.error(`[COMPLIANCE] ❌ Asset não existe no banco: ${creativeAssetId}`);
          return await setComplianceResult(creativeAssetId, 'rejected', 'Creative asset nao encontrado no banco', { approved: false, issues: [], text_percentage: 0 });
        }

        if (asset.tenantId !== tenantId) {
          console.warn(`[COMPLIANCE] ⚠️ Asset ${creativeAssetId} nao pertence ao tenant ${tenantId}`);
          return await setComplianceResult(creativeAssetId, 'rejected', 'Creative asset nao pertence ao tenant informado', { approved: false, issues: [], text_percentage: 0 });
        }

        if (!asset.url) {
          console.warn(`[COMPLIANCE] ⚠️ Asset sem URL: ${creativeAssetId}`);
          return await setComplianceResult(creativeAssetId, 'pending_compliance', 'Não foi possível verificar o compliance. Tente novamente.', { approved: false, issues: [], text_percentage: 0 });
        }

        // 2. Download e conversão para Base64
        let base64Image: string;
        let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';

        try {
          if (asset.url.startsWith('data:')) {
            const match = asset.url.match(/^data:([^;]+);base64,(.+)$/s);
            if (!match) throw new Error('Invalid data URL format');
            const [, mimeStr, b64] = match;
            base64Image = b64;
            if (mimeStr.includes('png')) mediaType = 'image/png';
            else if (mimeStr.includes('webp')) mediaType = 'image/webp';
            else if (mimeStr.includes('gif')) mediaType = 'image/gif';
            else mediaType = 'image/jpeg';
            console.log(`[COMPLIANCE] ✅ Imagem extraída do data URL (${mediaType})`);
          } else {
            const fetchRes = await fetch(asset.url);

            if (!fetchRes.ok) {
              throw new Error(`HTTP ${fetchRes.status} ao baixar imagem`);
            }

            const contentType = fetchRes.headers.get('content-type') || 'image/jpeg';
            if (contentType.includes('png')) mediaType = 'image/png';
            else if (contentType.includes('gif')) mediaType = 'image/gif';
            else if (contentType.includes('webp')) mediaType = 'image/webp';

            const arrayBuffer = await fetchRes.arrayBuffer();
            base64Image = Buffer.from(arrayBuffer).toString('base64');

            console.log(`[COMPLIANCE] ✅ Imagem baixada (${mediaType})`);
          }
        } catch (err) {
          console.error(`[COMPLIANCE] ❌ Erro no download:`, err);
          return await setComplianceResult(
            creativeAssetId,
            'pending_compliance',
            'Não foi possível verificar o compliance. Tente novamente.',
            { approved: false, issues: [], text_percentage: 0 }
          );
        }

        // 3. Verificar OPENAI_API_KEY
        if (!process.env.OPENAI_API_KEY) {
          console.warn('[COMPLIANCE] ⚠️ OPENAI_API_KEY ausente — aprovando automaticamente');
          return await setComplianceResult(
            creativeAssetId,
            'approved',
            'API Key OpenAI nao configurada',
            { approved: true, issues: [], text_percentage: 0 }
          );
        }

        // 4. Chamada GPT-4o Vision
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const systemPrompt = 'Você é um especialista em compliance de anúncios da Meta.';
        const userPrompt = 'Analise esta imagem de anúncio. Identifique: 1) Texto proibido pelo Meta 2) Conteúdo enganoso 3) Proporção de texto (deve ser < 20%). Responda JSON: {"approved": boolean, "issues": string[], "text_percentage": number}';

        console.log('[COMPLIANCE] 📤 Enviando para OpenAI GPT-4o...');

        const chatResponse = await client.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 1024,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: `data:${mediaType};base64,${base64Image}` },
                },
                { type: 'text', text: userPrompt },
              ],
            },
          ],
        });

        // 5. Parsear resposta
        const rawText = chatResponse.choices[0]?.message?.content ?? '';

        if (!rawText) {
          console.error('[COMPLIANCE] GPT-4o não retornou texto');
          return await setComplianceResult(
            creativeAssetId,
            'pending_compliance',
            'Não foi possível verificar o compliance. Tente novamente.',
            { approved: false, issues: [], text_percentage: 0 }
          );
        }

        let analysis: ComplianceAnalysis;
        try {
          const cleaned = rawText.replace(/```json|```/g, '').trim();
          const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned) as Partial<ComplianceAnalysis>;
          analysis = {
            approved: Boolean(parsed.approved),
            issues: Array.isArray(parsed.issues) ? parsed.issues.map((i) => String(i)) : [],
            text_percentage: Number(parsed.text_percentage ?? 0),
          };
        } catch (parseErr) {
          console.error('[COMPLIANCE] Erro de parse JSON GPT-4o');
          return await setComplianceResult(
            creativeAssetId,
            'pending_compliance',
            'Não foi possível verificar o compliance. Tente novamente.',
            { approved: false, issues: [], text_percentage: 0 }
          );
        }

        // 6. Salvar resultado
        const status = analysis.approved ? 'approved' : 'rejected';
        return await setComplianceResult(creativeAssetId, status, null, analysis);
      } catch (error) {
        console.error(`[COMPLIANCE ERROR] Falha crítica no Job:`, error);
        return await setComplianceResult(
          creativeAssetId,
          'pending_compliance',
          'Não foi possível verificar o compliance. Tente novamente.',
          { approved: false, issues: [], text_percentage: 0 }
        );
      }
    },
    {
      connection: getRedis(),
      concurrency: 5,
    }
  );
};

async function setComplianceResult(
  assetId: string,
  status: 'approved' | 'rejected' | 'pending_compliance',
  message: string | null,
  analysis: ComplianceAnalysis
): Promise<{ success: boolean }> {
  const notesPayload = {
    approved: analysis.approved,
    issues: analysis.issues,
    text_percentage: analysis.text_percentage,
  };

  const notes = message
    ? `[FALLBACK] ${message} | data=${JSON.stringify(notesPayload)}`
    : `[COMPLIANCE] approved=${analysis.approved} | text_percentage=${analysis.text_percentage} | issues=${analysis.issues.join(' ; ')} | data=${JSON.stringify(notesPayload)}`;

  try {
    await db
      .update(creativeAssets)
      .set({ complianceStatus: status as any, complianceNotes: notes })
      .where(eq(creativeAssets.id, assetId));

    console.log(`[COMPLIANCE] 🚀 Status: ${status.toUpperCase()} para Asset ${assetId}`);
    return { success: true };
  } catch (err) {
    console.error(`[COMPLIANCE] 💥 Erro ao salvar resultado:`, err);
    return { success: false };
  }
}

export async function startComplianceCheckWorker(): Promise<void> {
  if (complianceWorkerInstance) return;
  complianceWorkerInstance = createComplianceWorker();
  console.log('✅ Compliance check worker started');
}

export async function stopComplianceCheckWorker(): Promise<void> {
  if (!complianceWorkerInstance) return;
  await complianceWorkerInstance.close();
  complianceWorkerInstance = null;
  console.log('🛑 Compliance check worker stopped');
}
