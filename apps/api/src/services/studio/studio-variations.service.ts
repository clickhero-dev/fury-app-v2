import { AppError } from '../../middleware/errorHandler.js';
import { StudioRepository } from '../../repository/studio.repository.js';
import { WorkflowJobRepository } from '../../repository/workflow-job.repository.js';
import type { StudioService } from './creative-studio.service.js';
import type { StudioAiService } from './studio-ai.service.js';

export const STUDIO_VARIATION_DIRECTIONS = [
  'Crie uma variação mantendo a mensagem principal, mas com uma abordagem mais direta e orientada à conversão.',
  'Crie uma variação com hierarquia de texto e chamada diferentes, preservando a oferta e a identidade da marca.',
  'Crie uma variação com um tom mais aspiracional e emocional, sem alterar os dados essenciais do anúncio.',
] as const;

type Slot = {
  index: number;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  assetId?: string;
  imageUrl?: string;
  errorCode?: string;
  retryable?: boolean;
};

type BatchMetadata = {
  batchId: string;
  assetId: string;
  origin: 'quick' | 'creative';
  cancelled?: boolean;
  slots: Slot[];
};

type Job = { id: string; status: string; metadata: unknown };
type RepoFactory = (tenantId: string) => Pick<StudioRepository, 'findAssetById'>;
type JobFactory = (tenantId: string) => Pick<WorkflowJobRepository, 'findOrCreateStudioVariationsJob' | 'claimStudioVariationsJob' | 'patchWorkflowJob' | 'getStudioVariationsJob'>;

function readMetadata(job: Job, fallback: BatchMetadata): BatchMetadata {
  const value = job.metadata && typeof job.metadata === 'object' ? job.metadata as Partial<BatchMetadata> : {};
  return {
    ...fallback,
    ...value,
    // O job é criado com slots vazios antes de ser reivindicado. Nesse
    // primeiro processamento, a lista vazia precisa receber os slots padrão;
    // depois de iniciada, a metadata persistida sempre contém os slots reais.
    slots: Array.isArray(value.slots) && value.slots.length > 0 ? value.slots as Slot[] : fallback.slots,
  };
}

export class StudioVariationsService {
  constructor(
    private readonly repoFactory: RepoFactory = (tenantId) => new StudioRepository(tenantId),
    private readonly jobFactory: JobFactory = (tenantId) => new WorkflowJobRepository(tenantId),
    private readonly creative: Pick<StudioService, 'regenerateCreative'>,
    private readonly quick: Pick<StudioAiService, 'regenerateAd'>,
  ) {}

  async createBatch(tenantId: string, input: { batchId: string; assetId: string }, publicBaseUrl: string) {
    const repo = this.repoFactory(tenantId);
    const asset = await repo.findAssetById(input.assetId);
    if (!asset) throw new AppError(404, 'CREATIVE_ASSET_NOT_FOUND', 'Asset não encontrado');
    if (asset.type !== 'image' || asset.archivedAt) {
      throw new AppError(409, 'ASSET_NOT_ELIGIBLE_FOR_VARIATIONS', 'Este criativo não pode gerar variações');
    }

    const origin = this.originOf(asset.complianceNotes);
    const jobs = this.jobFactory(tenantId);
    const job = await jobs.findOrCreateStudioVariationsJob({ id: input.batchId, tenantId, assetId: input.assetId, origin });
    const initial = readMetadata(job as Job, {
      batchId: input.batchId,
      assetId: input.assetId,
      origin,
      slots: STUDIO_VARIATION_DIRECTIONS.map((_, index) => ({ index, status: 'pending' as const })),
    });

    if (initial.assetId !== input.assetId || initial.origin !== origin) {
      throw new AppError(409, 'VARIATION_BATCH_KEY_MISMATCH', 'A tentativa de variações não corresponde ao criativo selecionado');
    }
    if (job.status === 'done' || job.status === 'error' || initial.cancelled) return this.response(initial);

    const claimed = await jobs.claimStudioVariationsJob(input.batchId, tenantId, initial);
    if (!claimed) return this.response(initial);

    const metadata = initial;
    await jobs.patchWorkflowJob(input.batchId, { status: 'running', currentStage: 'generating', metadata } as any);
    for (const slot of metadata.slots) {
      const latest = await jobs.getStudioVariationsJob(tenantId, input.batchId);
      if (latest && readMetadata(latest as Job, metadata).cancelled) {
        metadata.cancelled = true;
      }
      if (metadata.cancelled) {
        slot.status = 'cancelled';
        continue;
      }
      slot.status = 'running';
      await jobs.patchWorkflowJob(input.batchId, { metadata } as any);
      try {
        const result = origin === 'quick'
          ? await this.quick.regenerateAd(tenantId, { assetId: input.assetId, feedback: STUDIO_VARIATION_DIRECTIONS[slot.index] })
          : await this.creative.regenerateCreative(tenantId, { assetId: input.assetId, feedback: STUDIO_VARIATION_DIRECTIONS[slot.index] }, publicBaseUrl);
        slot.status = 'succeeded';
        slot.assetId = result.assetId;
        slot.imageUrl = result.imageUrl;
      } catch (error) {
        // Após o envio ao provedor não há prova de cobrança/execução exatamente uma vez.
        // Fail-closed: não oferecer retry automático nem repetir a chamada.
        slot.status = 'failed';
        slot.retryable = false;
        slot.errorCode = error instanceof AppError ? error.code : 'VARIATION_GENERATION_FAILED';
        console.error('[studio-variations] slot failed', { batchId: input.batchId, slot: slot.index, code: slot.errorCode });
      }
      await jobs.patchWorkflowJob(input.batchId, { metadata } as any);
    }

    await jobs.patchWorkflowJob(input.batchId, { status: 'done', currentStage: 'completed', metadata } as any);
    return this.response(metadata);
  }

  async getBatch(tenantId: string, batchId: string) {
    const job = await this.jobFactory(tenantId).getStudioVariationsJob(tenantId, batchId);
    if (!job) throw new AppError(404, 'VARIATION_BATCH_NOT_FOUND', 'Lote de variações não encontrado');
    return this.response(readMetadata(job as Job, { batchId, assetId: '', origin: 'creative', slots: [] }));
  }

  async cancelBatch(tenantId: string, batchId: string) {
    const jobs = this.jobFactory(tenantId);
    const job = await jobs.getStudioVariationsJob(tenantId, batchId);
    if (!job) throw new AppError(404, 'VARIATION_BATCH_NOT_FOUND', 'Lote de variações não encontrado');
    const metadata = readMetadata(job as Job, { batchId, assetId: '', origin: 'creative', slots: [] });
    metadata.cancelled = true;
    metadata.slots = metadata.slots.map((slot) => slot.status === 'pending' ? { ...slot, status: 'cancelled' as const } : slot);
    await jobs.patchWorkflowJob(batchId, { status: 'done', currentStage: 'cancelled', metadata } as any);
    return this.response(metadata);
  }

  private originOf(notes: string | null): 'quick' | 'creative' {
    try {
      const metadata = JSON.parse(notes ?? '{}') as Record<string, unknown>;
      if (metadata.context && typeof metadata.context === 'object') return 'creative';
      if (typeof metadata.source === 'string' || (typeof metadata.model === 'string' && typeof metadata.prompt === 'string')) return 'quick';
      throw new AppError(400, 'ASSET_METADATA_INVALID', 'Não foi possível identificar a origem do criativo');
    } catch {
      throw new AppError(400, 'ASSET_METADATA_INVALID', 'Não foi possível identificar a origem do criativo');
    }
  }

  private response(metadata: BatchMetadata) {
    return {
      batchId: metadata.batchId,
      assetId: metadata.assetId,
      status: metadata.cancelled ? 'cancelled' : metadata.slots.some((slot) => slot.status === 'failed') ? 'partial' : metadata.slots.every((slot) => slot.status === 'succeeded') ? 'succeeded' : 'processing',
      slots: metadata.slots,
    };
  }
}
