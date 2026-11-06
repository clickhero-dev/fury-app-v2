import { randomUUID } from 'node:crypto';
import { AppError } from '../../middleware/errorHandler.js';
import { getRedis, waitForRedisReady } from '../../lib/redis.js';
import { StudioAiService } from './studio-ai.service.js';
import { StudioRepository } from '../../repository/studio.repository.js';

const TTL_SECONDS = 24 * 60 * 60;
const KEY = (tenantId: string, id: string) => `studio:visual-variation:${tenantId}:${id}`;
const IDEMPOTENCY_KEY = (tenantId: string, key: string) => `studio:visual-variation:idempotency:${tenantId}:${key}`;
type ItemStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export type VariationBatch = { batchId: string; baseAssetId: string; status: string; cancelled?: boolean; items: Array<{ index: number; status: ItemStatus; assetId?: string; imageUrl?: string; complianceStatus?: string; error?: string }> };

/** Estado de operação é efêmero; assets e quota permanecem nos serviços duráveis existentes. */
export class VisualVariationService {
  constructor(private studioAi = new StudioAiService(), private repoFactory = (tenantId: string) => new StudioRepository(tenantId)) {}

  private async get(tenantId: string, batchId: string): Promise<VariationBatch> {
    await waitForRedisReady();
    const raw = await getRedis().get(KEY(tenantId, batchId));
    if (!raw) throw new AppError(404, 'VARIATION_BATCH_NOT_FOUND', 'Lote de variações não encontrado.');
    return JSON.parse(raw) as VariationBatch;
  }
  private async save(tenantId: string, batch: VariationBatch) {
    await getRedis().set(KEY(tenantId, batch.batchId), JSON.stringify(batch), 'EX', TTL_SECONDS);
  }
  private status(batch: VariationBatch) {
    const s = batch.items.map((i) => i.status);
    if (s.every((v) => v === 'succeeded')) return 'completed';
    if (s.some((v) => v === 'queued' || v === 'running')) return 'running';
    if (s.some((v) => v === 'succeeded')) return 'partial';
    if (s.every((v) => v === 'cancelled')) return 'cancelled';
    return 'failed';
  }
  async create(tenantId: string, baseAssetId: string, idempotencyKey: string): Promise<{ batch: VariationBatch; reused: boolean }> {
    const repo = this.repoFactory(tenantId);
    const asset = await repo.findAssetById(baseAssetId);
    if (!asset) throw new AppError(404, 'ASSET_NOT_FOUND', 'Criativo não encontrado.');
    if (asset.type !== 'image' || !asset.url || asset.complianceStatus === 'rejected') throw new AppError(400, 'INVALID_BASE_ASSET', 'Escolha uma imagem compatível da Galeria.');
    await waitForRedisReady();
    const redis = getRedis();
    const known = await redis.get(IDEMPOTENCY_KEY(tenantId, idempotencyKey));
    if (known) {
      const [knownBase, batchId] = known.split(':');
      if (knownBase !== baseAssetId) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'A chave já foi usada com outro criativo.');
      return { batch: await this.get(tenantId, batchId), reused: true };
    }
    const batch: VariationBatch = { batchId: randomUUID(), baseAssetId, status: 'queued', items: Array.from({ length: 10 }, (_, index) => ({ index, status: 'queued' })) };
    await this.save(tenantId, batch);
    await redis.set(IDEMPOTENCY_KEY(tenantId, idempotencyKey), `${baseAssetId}:${batch.batchId}`, 'EX', TTL_SECONDS);
    void this.run(tenantId, batch.batchId);
    return { batch, reused: false };
  }
  async getBatch(tenantId: string, batchId: string) { return this.get(tenantId, batchId); }
  async cancel(tenantId: string, batchId: string) {
    const batch = await this.get(tenantId, batchId); batch.cancelled = true;
    batch.items.forEach((i) => { if (i.status === 'queued') i.status = 'cancelled'; }); batch.status = this.status(batch); await this.save(tenantId, batch); return batch;
  }
  async retry(tenantId: string, batchId: string, index: number) {
    const batch = await this.get(tenantId, batchId); const item = batch.items[index];
    if (!item || item.status !== 'failed' || batch.cancelled) throw new AppError(409, 'VARIATION_RETRY_CONFLICT', 'Esta variação não pode ser refeita.');
    delete item.error; item.status = 'queued'; batch.status = 'running'; await this.save(tenantId, batch); void this.run(tenantId, batchId); return batch;
  }
  private async run(tenantId: string, batchId: string) {
    // duas execuções simultâneas no máximo por lote; jobs persistentes são o próximo adapter deste serviço.
    await Promise.all(Array.from({ length: 2 }, () => this.runOne(tenantId, batchId)));
  }
  private async runOne(tenantId: string, batchId: string) {
    for (;;) {
      const batch = await this.get(tenantId, batchId); if (batch.cancelled) return;
      const item = batch.items.find((candidate) => candidate.status === 'queued'); if (!item) return;
      item.status = 'running'; batch.status = 'running'; await this.save(tenantId, batch);
      try { const result = await this.studioAi.generateVisualVariation(tenantId, batch.baseAssetId); Object.assign(item, { status: 'succeeded', assetId: result.creativeAssetId, imageUrl: result.imageUrl, complianceStatus: result.complianceStatus }); }
      catch { Object.assign(item, { status: 'failed', error: 'Não foi possível gerar esta variação. Tente novamente.' }); }
      const current = await this.get(tenantId, batchId); const target = current.items[item.index]; Object.assign(target, item); current.status = this.status(current); await this.save(tenantId, current);
    }
  }
}
