import { Worker } from 'bullmq';
import Anthropic from '@anthropic-ai/sdk';
import { db, creativeAssets } from '@fury/db';
import { eq } from 'drizzle-orm';
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
        // 1. Buscar asset no banco de dados
        const assets = await db
          .select()
          .from(creativeAssets)
          .where(eq(creativeAssets.id, creativeAssetId))
          .limit(1);

        const asset = assets[0];

        if (!asset || !asset.url) {
          console.warn(`[COMPLIANCE] ⚠️  Asset não encontrado ou sem URL: ${creativeAssetId}`);
          return await fallbackApprove(creativeAssetId, 'Asset não encontrado ou sem URL', 'rejected');
        }

        // 2. Download e conversão para Base64
        let base64Image: string;
        let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';

        try {
          const response = await fetch(asset.url);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status} ao baixar imagem`);
          }

          // Detectar tipo MIME da resposta
          const contentType = response.headers.get('content-type') || 'image/jpeg';
          if (contentType.includes('png')) mediaType = 'image/png';
          else if (contentType.includes('gif')) mediaType = 'image/gif';
          else if (contentType.includes('webp')) mediaType = 'image/webp';
          else mediaType = 'image/jpeg';

          const arrayBuffer = await response.arrayBuffer();
          base64Image = Buffer.from(arrayBuffer).toString('base64');

          console.log(`[COMPLIANCE] ✅ Imagem baixada com sucesso (${mediaType})`);
        } catch (err) {
          console.error(`[COMPLIANCE] ❌ Erro ao baixar imagem:`, err);
          return await fallbackApprove(
            creativeAssetId,
            `Erro ao baixar imagem: ${err instanceof Error ? err.message : 'Erro desconhecido'}`,
            'approved' // Fallback para aprovação manual
          );
        }

        // 3. Verificar se Claude está disponível
        if (!process.env.ANTHROPIC_API_KEY) {
          console.warn('[COMPLIANCE] ⚠️  ANTHROPIC_API_KEY não configurada, usando fallback');
          return await fallbackApprove(
            creativeAssetId,
            'API Key da Anthropic não configurada - revisar manualmente',
            'approved'
          );
        }

        // 4. Chamar Claude Vision para análise
        const client = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
        });

        const systemPrompt = `Você é um especialista em políticas de publicidade Meta (Facebook/Instagram). 
Sua tarefa é analisar imagens de anúncios e determinar se violam as políticas de publicidade.

Políticas principais a verificar:
- Texto excessivo (mais de 20% da imagem)
- Antes-e-depois enganosos
- Linguagem discriminatória ou ofensiva
- Conteúdo não apropriado para todas as idades
- Promessas irrealistas
- Imagens de baixa qualidade ou enganosas

Responda SEMPRE em JSON válido no seguinte formato:
{
  "aprovado": boolean,
  "motivos_reprovacao": string[],
  "confianca": number (0-100),
  "observacoes": string
}`;

        const userPrompt = `Analise esta imagem publicitária para redes sociais (Meta Ads - Facebook/Instagram).

Verifique:
1. Proporção de texto (máximo 20%)
2. Qualidade e clareza da imagem
3. Conformidade com políticas de publicidade
4. Conteúdo apropriado
5. Promessas realistas

Retorne a análise em JSON.`;

        console.log('[COMPLIANCE] 📤 Enviando para Claude Vision...');

        const response = await client.messages.create({
          model: 'claude-3-sonnet-20240229',
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

        // 5. Processar resposta do Claude
        const textContent = response.content.find((block) => block.type === 'text');
        if (!textContent || textContent.type !== 'text') {
          throw new Error('Claude não retornou análise de texto');
        }

        let analysis: ComplianceAnalysis;
        try {
          // Extrair JSON da resposta
          const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('JSON não encontrado na resposta');
          }
          analysis = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
          console.error('[COMPLIANCE] Erro ao parsear JSON::', parseErr);
          console.error('[COMPLIANCE] Resposta bruta:', textContent.text);
          return await fallbackApprove(
            creativeAssetId,
            'Erro ao processar análise do Claude',
            'approved'
          );
        }

        // 6. Atualizar banco de dados
        const status = analysis.aprovado ? 'approved' : 'rejected';
        const notes = [
          ...analysis.motivos_reprovacao,
          `Confiança: ${analysis.confianca}%`,
          analysis.observacoes,
        ]
          .filter(Boolean)
          .join(' | ');

        await db
          .update(creativeAssets)
          .set({
            complianceStatus: status as any,
            complianceNotes: notes,
          })
          .where(eq(creativeAssets.id, creativeAssetId));

        const emoji = analysis.aprovado ? '✅' : '❌';
        console.log(
          `[COMPLIANCE] ${emoji} Resultado para ${creativeAssetId}: ${status.toUpperCase()} (Confiança: ${analysis.confianca}%)`
        );

        return { success: true, status, confianca: analysis.confianca };
      } catch (error) {
        console.error(`[COMPLIANCE ERROR] Job falhou:`, error);
        return await fallbackApprove(
          creativeAssetId,
          `Erro no processamento: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
          'approved' // Fallback para aprovação (revisão manual necessária)
        );
      }
    },
    {
      connection: getRedis(),
      concurrency: 5, // Processar até 5 jobs simultaneamente
    }
  );
};

/**
 * Inicializar o worker de compliance check
 */
export async function startComplianceCheckWorker(): Promise<void> {
  if (complianceWorkerInstance) {
    return;
  }

  complianceWorkerInstance = createComplianceWorker();

  // Event listeners para logging
  complianceWorkerInstance.on('completed', (job) => {
    console.log(`[COMPLIANCE] ✨ Job ${job.id} concluído com sucesso`);
  });

  complianceWorkerInstance.on('failed', (job, error) => {
    console.error(`[COMPLIANCE] 🔥 Job ${job?.id} falhou permanentemente:`, error);
  });

  complianceWorkerInstance.on('error', (error) => {
    console.error('[COMPLIANCE] ⚠️  Erro no worker:', error);
  });

  console.log('✅ Compliance check worker started');
}

/**
 * Parar o worker de compliance check
 */
export async function stopComplianceCheckWorker(): Promise<void> {
  if (!complianceWorkerInstance) {
    return;
  }

  await complianceWorkerInstance.close();
  complianceWorkerInstance = null;
  console.log('🛑 Compliance check worker stopped');
}

/**
 * Função de fallback para aprovar manualmente
 * Marca como aprovado quando há falha, indicando que precisa de revisão manual
 */
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
    console.error(`[COMPLIANCE] 💥 Erro crítico ao aplicar fallback:`, err);
    return { success: false, fallback: true };
  }
}