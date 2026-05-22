import { Worker } from 'bullmq';
import { db, creativeAssets } from '@fury/db';
import { eq } from 'drizzle-orm';
import { claude } from '../lib/claude.js';
import { getRedis } from '../lib/redis.js';

interface ComplianceJobData {
  creativeAssetId: string;
  tenantId: string;
}

interface ComplianceAnalysis {
  aprovado: boolean;
  motivos_reprovacao: string[];
  confianca: number;
  observacoes: string;
}

let complianceWorkerInstance: Worker<ComplianceJobData> | null = null;

const createComplianceWorker = (): Worker<ComplianceJobData> => {
  return new Worker<ComplianceJobData>(
    'compliance-check',
    async (job) => {
      const { creativeAssetId, tenantId } = job.data;
      
      console.log(`[COMPLIANCE] 🔍 Iniciando análise do asset: ${creativeAssetId} | Tenant: ${tenantId}`);

      try {
        // 1. Buscar asset no banco de dados (Drizzle)
        const assets = await db
          .select()
          .from(creativeAssets)
          .where(eq(creativeAssets.id, creativeAssetId))
          .limit(1);

        const asset = assets[0];

        // O worker depende de um creative_asset já salvo no banco.
        if (!asset) {
          console.error(`[COMPLIANCE] ❌ Asset não existe no banco: ${creativeAssetId}`);
          return await fallbackApprove(creativeAssetId, 'Creative asset nao encontrado no banco', 'rejected');
        }

        if (asset.tenantId !== tenantId) {
          console.warn(`[COMPLIANCE] ⚠️ Asset ${creativeAssetId} nao pertence ao tenant ${tenantId}`);
          return await fallbackApprove(creativeAssetId, 'Creative asset nao pertence ao tenant informado', 'rejected');
        }

        if (!asset.url) {
          console.warn(`[COMPLIANCE] ⚠️ Asset sem URL: ${creativeAssetId}`);
          return await fallbackApprove(creativeAssetId, 'Asset sem URL de imagem', 'rejected');
        }

        // 2. Download e conversão para Base64
        let base64Image: string;
        let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';

        try {
          const response = await fetch(asset.url);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} ao baixar imagem`);
          }

          const contentType = response.headers.get('content-type') || 'image/jpeg';
          if (contentType.includes('png')) mediaType = 'image/png';
          else if (contentType.includes('gif')) mediaType = 'image/gif';
          else if (contentType.includes('webp')) mediaType = 'image/webp';

          const arrayBuffer = await response.arrayBuffer();
          base64Image = Buffer.from(arrayBuffer).toString('base64');

          console.log(`[COMPLIANCE] ✅ Imagem baixada (${mediaType})`);
        } catch (err) {
          console.error(`[COMPLIANCE] ❌ Erro no download:`, err);
          return await fallbackApprove(
            creativeAssetId,
            `Erro no download: ${err instanceof Error ? err.message : 'Erro desconhecido'}`,
            'approved'
          );
        }

        // 3. Fallback se API Key não existir
        if (!process.env.ANTHROPIC_API_KEY) {
          console.warn('[COMPLIANCE] ⚠️ ANTHROPIC_API_KEY ausente');
          return await fallbackApprove(
            creativeAssetId,
            'API Key da Anthropic não configurada',
            'approved'
          );
        }

        // 4. Chamada Claude Vision

        const systemPrompt = `Você é um especialista em políticas de publicidade do Facebook e Instagram.
Analise esta imagem de anúncio e verifique se viola alguma política.
Responda APENAS em JSON válido.`;

        const userPrompt = `Analise esta imagem e retorne:
{
  "aprovado": boolean,
  "motivos_reprovacao": string[], // vazio se aprovado
  "score_confianca": number,      // 0 a 100
  "observacoes": string
}

Verificar:
- Texto excessivo na imagem (mais de 20% da área)
- Conteúdo enganoso ou sensacionalista
- Imagens de 'antes e depois' para saúde/beleza
- Linguagem discriminatória
- Conteúdo adulto ou violento`;

        console.log('[COMPLIANCE] 📤 Enviando para Claude API...');

        const response = await claude.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: mediaType,
                    data: base64Image,
                  },
                },
                {
                  type: 'text',
                  text: userPrompt,
                },
              ],
            },
          ],
        });

        // 5. Parsear Resposta
        const textContent = response.content.find((block) => block.type === 'text');
        if (!textContent || textContent.type !== 'text') {
          throw new Error('Claude não retornou texto');
        }

        let analysis: any;
        try {
          const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
          analysis = JSON.parse(jsonMatch ? jsonMatch[0] : textContent.text);
        } catch (parseErr) {
          console.error('[COMPLIANCE] Erro de Parse JSON Claude');
          return await fallbackApprove(creativeAssetId, 'Erro no parse da análise do Claude', 'approved');
        }

        // 6. Atualizar Creative Asset no Banco
        const status = analysis.aprovado ? 'approved' : 'rejected';
        const confidence = Number(analysis.confianca ?? analysis.score_confianca ?? 0);
        const notes = [
          ...(analysis.motivos_reprovacao || []),
          analysis.observacoes,
          `Confiança: ${confidence}%`
        ].filter(Boolean).join(' | ');

        await db
          .update(creativeAssets)
          .set({
            complianceStatus: status as any,
            complianceNotes: notes,
          })
          .where(eq(creativeAssets.id, creativeAssetId));

        console.log(`[COMPLIANCE] 🚀 Status Atualizado: ${status.toUpperCase()} para Asset ${creativeAssetId}`);

        return { success: true, status, confianca: confidence };
      } catch (error) {
        console.error(`[COMPLIANCE ERROR] Falha crítica no Job:`, error);
        return await fallbackApprove(
          creativeAssetId,
          `Erro interno no worker: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
          'approved'
        );
      }
    },
    {
      connection: getRedis(),
      concurrency: 5,
    }
  );
};

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

async function fallbackApprove(
  assetId: string,
  reason: string,
  status: 'approved' | 'rejected' = 'approved'
): Promise<{ success: boolean; fallback: boolean }> {
  try {
    await db
      .update(creativeAssets)
      .set({
        complianceStatus: status as any,
        complianceNotes: `[FALLBACK] ${reason}`,
      })
      .where(eq(creativeAssets.id, assetId));

    console.log(`[COMPLIANCE] 🔄 Fallback aplicado: ${status} | Motivo: ${reason}`);
    return { success: true, fallback: true };
  } catch (err) {
    console.error(`[COMPLIANCE] 💥 Erro crítico no fallback:`, err);
    return { success: false, fallback: true };
  }
}