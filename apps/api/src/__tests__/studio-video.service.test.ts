/*
Funcionalidade: avisar no sino quando o vídeo estiver pronto
Cenário: o vídeo concluído gera uma notificação para quem iniciou a geração
Dado que um usuário iniciou uma geração de vídeo
Quando o worker conclui e salva o vídeo
Então o usuário recebe uma notificação idempotente de vídeo pronto

Cenário: uma geração com falha não gera falso positivo
Dado que a geração do vídeo falha
Quando o worker encerra o job com erro
Então nenhuma notificação de vídeo pronto é criada
*/
import { describe, it, expect, vi } from 'vitest';
import { StudioVideoService, buildVideoPrompt, parseScenes, resolveVideoLimits } from '../services/studio/studio-video.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { DEFAULT_AD_VIDEO_MODEL } from '../services/studio/studio-model-catalog.js';

const TENANT = 'tenant-1';
const USER_ID = 'user-1';
const PHOTO_ID = '11111111-1111-4111-8111-111111111111';
const SCENES = [
  { start: 0, end: 5, visual: 'Close no produto', narration: 'Conheça o novo café' },
  { start: 5, end: 15, visual: 'Pessoa tomando café', narration: 'Peça já o seu' },
];

function makeJobRepo() {
  const jobs = new Map<string, any>();
  const periodCount = () =>
    [...jobs.values()].filter((j) => ['pending', 'running', 'done'].includes(j.status) && !j.metadata?.rootAssetId).length;
  return {
    jobs,
    markPendingVideoEnqueueFailed: vi.fn(async (id: string) => {
      const job=jobs.get(id);
      if (!job || job.status !== 'pending') return false;
      job.status='error';job.error='Não foi possível iniciar a geração.';return true;
    }),
    claimVideoJob: vi.fn(async (id: string) => {
      const job = jobs.get(id);
      if (!job || job.status !== 'pending') return null;
      job.status = 'running';
      return { ...job };
    }),
    claimResumableVideoJob: vi.fn(async () => null),
    patchOwnedVideoJob: vi.fn(async (id: string, _token: string, patch: any) => { jobs.set(id, { ...jobs.get(id), ...patch }); return true; }),
    failOwnedVideoJob: vi.fn(async (id: string, _token: string, error: string, metadata: any, _refund: boolean) => { jobs.set(id, { ...jobs.get(id), status:'error', error, metadata }); return true; }),
    reserveVideoAdjustment: vi.fn(async (_input: any, _limit: number): Promise<'created'|'exists'|'active_limit'|'quota'|'approval_inactive'> => 'created'),
    activateVideoAdjustment: vi.fn(async (id: string, tenantId: string, metadata: any) => { jobs.set(id,{...jobs.get(id),tenantId,workflow:'studio-video',status:'pending',currentStage:'queued',metadata}); return true; }),
    cancelVideoAdjustment: vi.fn(async (_id: string, _tenant: string) => true),
    completeOwnedVideoJob: vi.fn(async (id: string, _token: string, asset: any, metadata: any) => { jobs.set(id, { ...jobs.get(id), status:'done', currentStage:'done', metadata, artifacts:{assetId:'asset-new',videoUrl:asset.url} }); return { id:'asset-new', ...asset }; }),
    createTenantJobIfUnderLimit: vi.fn(async (d: any, limit: number, _stale: Date, period?: { limit: number }) => {
      const active = [...jobs.values()].filter((j) => j.tenantId === d.tenantId && ['pending', 'running'].includes(j.status));
      if (active.length >= limit) return 'active_limit';
      if (period && periodCount() >= period.limit) return 'period_limit';
      jobs.set(d.id, { createdAt: new Date(), updatedAt: new Date(), artifacts: {}, ...d });
      return 'created';
    }),
    countPeriodJobs: vi.fn(async () => periodCount()),
    getWorkflowJob: vi.fn(async (id: string) => (jobs.has(id) ? { ...jobs.get(id) } : undefined)),
    patchWorkflowJob: vi.fn(async (id: string, patch: any) => { jobs.set(id, { ...jobs.get(id), ...patch }); }),
    renewWorkflowJobLock: vi.fn(async () => undefined),
    listTenantWorkflowJobs: vi.fn(async () => []),
  };
}

type Limits = { videosPerMonth: number | null; modificationsPerVideo: number | null };

function build(opts: { states?: any[]; asset?: any; photoKind?: string; limits?: Limits; notifyVideoReady?: ReturnType<typeof vi.fn>; notifyVideoFailed?: ReturnType<typeof vi.fn> } = {}) {
  const jobRepo = makeJobRepo();
  const studioRepo = {
    createAsset: vi.fn(async (d: any) => ({ id: 'asset-new', ...d })),
    findAssetById: vi.fn(async () => opts.asset),
    setActiveAsset: vi.fn(async () => null),
  };
  const photoRepo = {
    findByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, kind: opts.photoKind ?? 'produto', url: `https://r2/${id}.png` }))),
  };
  let i = 0;
  const states = opts.states ?? [{ status: 'completed', costUsd: 1.5, error: null, unsignedUrls: [] }];
  const video = {
    submit: vi.fn(async () => 'or-job-1'),
    getJob: vi.fn(async () => states[Math.min(i++, states.length - 1)]),
    download: vi.fn(async () => Buffer.from('mp4')),
  };
  const llm = {
    chatWithImages: vi.fn(async () => ({ content: JSON.stringify({ scenes: SCENES }), costUsd: 0.002 })),
    assertCreditsAvailable: vi.fn(async () => undefined),
  };
  const modQuota = { consume: vi.fn(async () => undefined), refund: vi.fn(async () => undefined) };
  jobRepo.failOwnedVideoJob.mockImplementation(async (id, _token, error, metadata, refund) => { jobRepo.jobs.set(id,{...jobRepo.jobs.get(id),status:'error',error,metadata}); if (metadata.rootAssetId && refund) await modQuota.refund(metadata.rootAssetId); return true; });
  jobRepo.reserveVideoAdjustment.mockImplementation(async (input) => { try {await modQuota.consume(input.rootAssetId);} catch {return 'quota';} jobRepo.jobs.set(input.id,{id:input.id,tenantId:input.tenantId,workflow:'studio-video',status:'awaiting_images',metadata:{rootAssetId:input.rootAssetId}});return 'created'; });
  jobRepo.cancelVideoAdjustment.mockImplementation(async (id) => {const job=jobRepo.jobs.get(id);if (!job || !['pending','awaiting_images'].includes(job.status)) return false; job.status='error';await modQuota.refund(job.metadata.rootAssetId);return true;});
  const enqueue = vi.fn(async () => undefined);
  const svc = new StudioVideoService({
    video: video as any,
    llm: llm as any,
    jobRepo: jobRepo as any,
    studioRepo: () => studioRepo as any,
    photoRepo: () => photoRepo as any,
    brand: async () => ({ businessName: 'Café Bom' }),
    limits: async () => ({ ...(opts.limits ?? { videosPerMonth: 10, modificationsPerVideo: 3 }), periodStart: new Date(0) }),
    modQuota,
    notifyVideoReady: opts.notifyVideoReady,
    notifyVideoFailed: opts.notifyVideoFailed,
    enqueue,
    sleep: async () => undefined,
    store: vi.fn(async () => 'https://cdn/video.mp4') as any,
  });
  return { svc, jobRepo, studioRepo, photoRepo, video, llm, enqueue, modQuota };
}

const baseInput = {
  prompt: 'Lançamento do café gelado',
  scenes: SCENES,
  photoIds: [PHOTO_ID],
  aspectRatio: '9:16' as const,
  duration: 15,
};

const adjustableAsset = {
  id: 'asset-v2',
  type: 'video',
  rootAssetId: 'asset-root',
  complianceNotes: JSON.stringify({
    source: 'openrouter-video',
    prompt: 'café',
    scenes: SCENES,
    photos: [{ url: 'https://r2/p.png', kind: 'produto' }],
    aspectRatio: '16:9',
    durationSeconds: 15,
    model: 'bytedance/seedance-2.0',
  }),
};

describe('parseScenes', () => {
  it('lê o JSON, limita os tempos à duração e descarta cenas vazias', () => {
    const scenes = parseScenes('```json\n{"scenes":[{"start":0,"end":40,"visual":"a","narration":"b"},{"start":3,"end":3,"visual":"x"}]}\n```', 15);
    expect(scenes).toEqual([{ start: 0, end: 15, visual: 'a', narration: 'b' }]);
  });

  it('erro claro quando não há cenas', () => {
    expect(() => parseScenes('nada', 15)).toThrow(/roteiro/);
  });

  it('respeita os limites do schema de criação', () => {
    const long = { start: 0, end: 1, visual: 'v'.repeat(900), narration: 'n'.repeat(900) };
    const scenes = parseScenes(JSON.stringify({ scenes: Array(12).fill(long) }), 15);
    expect(scenes).toHaveLength(8);
    expect(scenes[0].visual).toHaveLength(600);
    expect(scenes[0].narration).toHaveLength(400);
  });
});

describe('buildVideoPrompt', () => {
  it('inclui formato, papel de cada foto e o roteiro com tempos', () => {
    const prompt = buildVideoPrompt({
      businessName: 'Café Bom',
      aspectRatio: '16:9',
      duration: 15,
      photos: [{ url: 'u', kind: 'produto' }, { url: 'v', kind: 'equipe' }],
      scenes: SCENES,
    });
    expect(prompt).toContain('horizontal (16:9) de 15 segundos');
    expect(prompt).toContain('imagem 1 = produto');
    expect(prompt).toContain('imagem 2 = pessoa');
    expect(prompt).toContain('[0s–5s] Cena: Close no produto');
    expect(prompt).toContain('"Peça já o seu"');
  });
});

describe('resolveVideoLimits', () => {
  it('plano sem as chaves de vídeo = vídeo desligado (0)', () => {
    const l = resolveVideoLimits({ creativesPerMonth: 20 }, null, new Date('2026-10-15T12:00:00Z'));
    expect(l).toMatchObject({ videosPerMonth: 0, modificationsPerVideo: 0 });
    expect(l.periodStart.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('null = sem limite; período = mês antes do fim do ciclo', () => {
    const l = resolveVideoLimits({ videosPerMonth: null, modificationsPerVideo: 2 }, new Date('2026-11-04T16:08:00Z'), new Date());
    expect(l).toMatchObject({ videosPerMonth: null, modificationsPerVideo: 2 });
    expect(l.periodStart.toISOString()).toBe('2026-10-04T16:08:00.000Z');
  });
});

describe('StudioVideoService', () => {
  it('generateScript manda as fotos ao LLM e devolve só as cenas', async () => {
    const { svc, llm } = build();
    const res = await svc.generateScript(TENANT, { prompt: baseInput.prompt, photoIds: [PHOTO_ID], aspectRatio: '9:16', duration: 15 });
    expect(res).toEqual({ scenes: SCENES });
    expect(llm.chatWithImages.mock.calls[0][0].imageUrls).toEqual([`https://r2/${PHOTO_ID}.png`]);
  });

  it('recusa foto do tipo modelo (não é produto/equipe)', async () => {
    const { svc } = build({ photoKind: 'modelo' });
    await expect(svc.createJob(TENANT, baseInput)).rejects.toMatchObject({ code: 'INVALID_REFERENCE_IMAGE' });
  });

  it('usa sempre o modelo padrão', async () => {
    const { svc, jobRepo } = build();
    const { jobId } = await svc.createJob(TENANT, { ...baseInput, model: 'bytedance/seedance-2.5' } as any);
    expect(jobRepo.jobs.get(jobId).metadata.model).toBe(DEFAULT_AD_VIDEO_MODEL);
  });

  it('limite de 2 jobs ativos por tenant (409)', async () => {
    const { svc } = build();
    await svc.createJob(TENANT, baseInput);
    await svc.createJob(TENANT, baseInput);
    await expect(svc.createJob(TENANT, baseInput)).rejects.toMatchObject({ statusCode: 409 });
  });

  describe('cota de vídeo', () => {
    it('plano com cota 0: opções desligadas e criação recusada', async () => {
      const { svc } = build({ limits: { videosPerMonth: 0, modificationsPerVideo: 0 } });
      expect(await svc.getOptions(TENANT)).toMatchObject({ enabled: false, videosLimit: 0, videosRemaining: 0 });
      await expect(svc.createJob(TENANT, baseInput)).rejects.toMatchObject({ statusCode: 403, code: 'VIDEO_NOT_IN_PLAN' });
    });

    it('opções mostram o saldo do mês', async () => {
      const { svc } = build({ limits: { videosPerMonth: 3, modificationsPerVideo: 1 } });
      await svc.createJob(TENANT, baseInput);
      expect(await svc.getOptions(TENANT)).toMatchObject({ enabled: true, videosLimit: 3, videosRemaining: 2 });
    });

    it('estourou a cota do mês: 403 com mensagem de limite', async () => {
      const { svc, jobRepo } = build({ limits: { videosPerMonth: 1, modificationsPerVideo: 1 } });
      const { jobId } = await svc.createJob(TENANT, baseInput);
      jobRepo.jobs.get(jobId).status = 'done';
      await expect(svc.createJob(TENANT, baseInput)).rejects.toMatchObject({ statusCode: 403, code: 'VIDEO_QUOTA_EXCEEDED' });
    });

    it('vídeo novo nasce com o teto de mudanças do plano', async () => {
      const { svc, jobRepo } = build({ limits: { videosPerMonth: 5, modificationsPerVideo: 2 } });
      const { jobId } = await svc.createJob(TENANT, baseInput);
      await svc.processJob(jobId);
      expect(jobRepo.completeOwnedVideoJob.mock.calls[0][2].modificationsRemaining).toBe(2);
    });

    it('sem limite (null): não passa período pro repositório', async () => {
      const { svc, jobRepo } = build({ limits: { videosPerMonth: null, modificationsPerVideo: null } });
      await svc.createJob(TENANT, baseInput);
      expect(jobRepo.createTenantJobIfUnderLimit.mock.calls[0][3]).toBeUndefined();
    });
  });

  it('processJob envia, acompanha e salva o asset com custo, sem debug no asset', async () => {
    const { svc, video, jobRepo } = build({
      states: [
        { status: 'pending', costUsd: null, error: null, unsignedUrls: [] },
        { status: 'in_progress', costUsd: null, error: null, unsignedUrls: [] },
        { status: 'completed', costUsd: 1.5, error: null, unsignedUrls: [] },
      ],
    });
    const { jobId } = await svc.createJob(TENANT, baseInput);
    await svc.processJob(jobId);

    expect(video.submit.mock.calls[0][0]).toMatchObject({ duration: 15, aspect_ratio: '9:16', generate_audio: true, referenceImageUrls: [`https://r2/${PHOTO_ID}.png`] });
    const asset = jobRepo.completeOwnedVideoJob.mock.calls[0][2];
    expect(asset.type).toBe('video');
    expect(asset.costUsd).toBe(1.5);
    const notes = JSON.parse(asset.complianceNotes);
    expect(notes.source).toBe('openrouter-video');
    expect(notes.debug).toBeUndefined();

    const status = await svc.getJob(TENANT, jobId);
    expect(status).toMatchObject({ status: 'done', assetId: 'asset-new' });
    expect((status as any).debug).toBeUndefined();
  });

  it('retoma job pago órfão consultando o provedor sem novo envio', async () => {
    const { svc, jobRepo, video } = build();
    const { jobId } = await svc.createJob(TENANT, baseInput);
    const job=jobRepo.jobs.get(jobId);
    job.status='running'; job.metadata={...job.metadata,openrouterJobId:'existing-provider-id'};
    jobRepo.claimResumableVideoJob.mockImplementationOnce(async () => ({ ...job }));
    await svc.processJob(jobId);
    expect(video.submit).not.toHaveBeenCalled();
    expect(video.getJob).toHaveBeenCalledWith('existing-provider-id');
    expect(jobRepo.completeOwnedVideoJob).toHaveBeenCalledOnce();
    expect(jobRepo.jobs.get(jobId).status).toBe('done');
  });

  it('consulta o resultado pago ao menos uma vez mesmo após timeout', async () => {
    const {svc,jobRepo,video}=build();
    const {jobId}=await svc.createJob(TENANT,baseInput);
    const job=jobRepo.jobs.get(jobId);
    job.status='running';job.metadata={...job.metadata,openrouterJobId:'old-provider-id',startedAt:new Date(0).toISOString()};
    jobRepo.claimResumableVideoJob.mockImplementationOnce(async () => ({...job}));
    await svc.processJob(jobId);
    expect(video.submit).not.toHaveBeenCalled();
    expect(video.getJob).toHaveBeenCalledWith('old-provider-id');
    expect(jobRepo.jobs.get(jobId).status).toBe('done');
  });

  it('worker que perdeu posse não conclui nem estorna cota', async () => {
    const {svc,jobRepo,video,modQuota}=build({states:[{status:'failed',error:'failed'}]});
    const {jobId}=await svc.createJob(TENANT,baseInput);
    const job=jobRepo.jobs.get(jobId);
    job.status='running';job.metadata={...job.metadata,rootAssetId:'root',openrouterJobId:'existing'};
    jobRepo.claimResumableVideoJob.mockImplementationOnce(async () => ({...job}));
    jobRepo.patchOwnedVideoJob.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await svc.processJob(jobId);
    expect(video.submit).not.toHaveBeenCalled();
    expect(jobRepo.completeOwnedVideoJob).not.toHaveBeenCalled();
    expect(modQuota.refund).not.toHaveBeenCalled();
  });

  it('falha transacional não converte estorno devido em cobrança incerta', async () => {
    const {svc,jobRepo}=build({states:[{status:'failed',error:'failed'}]});
    const {jobId}=await svc.createJob(TENANT,baseInput);
    jobRepo.failOwnedVideoJob.mockRejectedValueOnce(Error('database down'));
    await expect(svc.processJob(jobId)).rejects.toThrow();
    expect(jobRepo.failOwnedVideoJob).toHaveBeenCalledOnce();
    expect(jobRepo.jobs.get(jobId).status).toBe('running');
  });

  it('notifica o usuário iniciador uma única vez quando o vídeo fica pronto', async () => {
    const notifyVideoReady = vi.fn(async () => undefined);
    const { svc, jobRepo } = build({ notifyVideoReady });
    const { jobId } = await svc.createJob(TENANT, baseInput, USER_ID);

    expect(jobRepo.jobs.get(jobId).metadata.initiatedByUserId).toBe(USER_ID);
    await svc.processJob(jobId);

    expect(notifyVideoReady).toHaveBeenCalledTimes(1);
    expect(notifyVideoReady).toHaveBeenCalledWith(TENANT, USER_ID, jobId, 'asset-new');
  });

  it('não notifica quando a geração falha', async () => {
    const notifyVideoReady = vi.fn(async () => undefined);
    const notifyVideoFailed = vi.fn(async () => undefined);
    const { svc } = build({ notifyVideoReady, notifyVideoFailed, states: [{ status: 'failed', costUsd: null, error: 'safety', unsignedUrls: [] }] });
    const { jobId } = await svc.createJob(TENANT, baseInput, USER_ID);

    await svc.processJob(jobId);

    expect(notifyVideoReady).not.toHaveBeenCalled();
    expect(notifyVideoFailed).toHaveBeenCalledWith(TENANT, USER_ID, jobId);
  });

  it('falha de filtro de conteúdo vira mensagem clara, sem reenvio', async () => {
    const { svc, video } = build({ states: [{ status: 'failed', costUsd: null, error: 'no output: safety', unsignedUrls: [] }] });
    const { jobId } = await svc.createJob(TENANT, baseInput);
    await svc.processJob(jobId);
    const status = await svc.getJob(TENANT, jobId);
    expect(status.status).toBe('error');
    expect(status.error).toMatch(/filtro de conteúdo/);
    expect(video.submit).toHaveBeenCalledTimes(1);
  });

  it('status terminal desconhecido (cancelled) encerra como erro sem esperar o timeout', async () => {
    const { svc, video } = build({ states: [{ status: 'cancelled', costUsd: null, error: null, unsignedUrls: [] }] });
    const { jobId } = await svc.createJob(TENANT, baseInput);
    await svc.processJob(jobId);
    expect((await svc.getJob(TENANT, jobId)).status).toBe('error');
    expect(video.getJob).toHaveBeenCalledTimes(1);
  });

  it('falhas seguidas ao consultar o status desistem em vez de rodar 20 min', async () => {
    const { svc, video, jobRepo } = build();
    video.getJob.mockRejectedValue(new Error('401'));
    const { jobId } = await svc.createJob(TENANT, baseInput);
    await svc.processJob(jobId);
    expect((await svc.getJob(TENANT, jobId)).status).toBe('error');
    expect(video.getJob).toHaveBeenCalledTimes(6);
    expect(jobRepo.jobs.get(jobId).metadata.billingUncertain).toBe(true);
  });

  it('vídeo já pago: tenta baixar de novo antes de falhar', async () => {
    const { svc, video, jobRepo } = build();
    video.download.mockRejectedValueOnce(new Error('timeout'));
    const { jobId } = await svc.createJob(TENANT, baseInput);
    await svc.processJob(jobId);
    expect(video.download).toHaveBeenCalledTimes(2);
    expect(jobRepo.completeOwnedVideoJob).toHaveBeenCalledTimes(1);
    expect((await svc.getJob(TENANT, jobId)).status).toBe('done');
  });

  it('retomada reaproveita o job do OpenRouter já enviado', async () => {
    const { svc, jobRepo, video } = build();
    const { jobId } = await svc.createJob(TENANT, baseInput);
    const job = jobRepo.jobs.get(jobId);
    job.metadata = { ...job.metadata, openrouterJobId: 'or-existing' };
    await svc.processJob(jobId);
    expect(video.submit).not.toHaveBeenCalled();
    expect(video.getJob).toHaveBeenCalledWith('or-existing');
  });

  it('não falha nem estorna quota se worker já iniciou quando enqueue perde resposta', async () => {
    const {svc,jobRepo,enqueue,modQuota}=build({asset:adjustableAsset});
    enqueue.mockImplementationOnce(async id=>{jobRepo.jobs.get(id).status='running';throw new Error('resposta perdida');});
    const {jobId}=await svc.adjustVideo(TENANT,'asset-v2','mude o fundo',USER_ID);
    expect(jobRepo.jobs.get(jobId).status).toBe('running');expect(modQuota.refund).not.toHaveBeenCalled();
  });

  it('marca erro e estorna somente quando job ainda não foi reclamado', async () => {
    const {svc,jobRepo,enqueue,modQuota}=build({asset:adjustableAsset});
    enqueue.mockRejectedValueOnce(new Error('fila indisponível'));
    await expect(svc.adjustVideo(TENANT,'asset-v2','mude o fundo',USER_ID)).rejects.toThrow();
    expect([...jobRepo.jobs.values()][0].status).toBe('error');expect(modQuota.refund).toHaveBeenCalledWith('asset-root');
  });

  it('não estorna quando não é possível verificar se worker reclamou o job', async () => {
    const {svc,jobRepo,enqueue,modQuota}=build({asset:adjustableAsset});
    enqueue.mockRejectedValueOnce(new Error('resposta perdida'));
    jobRepo.cancelVideoAdjustment.mockRejectedValueOnce(new Error('banco indisponível'));
    await expect(svc.adjustVideo(TENANT,'asset-v2','mude o fundo',USER_ID)).rejects.toMatchObject({statusCode:503,details:undefined});
    expect(modQuota.refund).not.toHaveBeenCalled();
  });

  it('não estorna nem sugere repetição quando envio pago tem resultado desconhecido', async () => {
    const { svc, jobRepo, video, modQuota } = build();
    const { jobId } = await svc.createJob(TENANT, baseInput);
    jobRepo.jobs.get(jobId).metadata = { ...jobRepo.jobs.get(jobId).metadata, rootAssetId: 'asset-root' };
    video.submit.mockRejectedValueOnce(new Error('timeout'));
    await svc.processJob(jobId);
    expect(modQuota.refund).not.toHaveBeenCalled();
    expect(jobRepo.jobs.get(jobId).error).toContain('Verifique');
    expect(jobRepo.jobs.get(jobId).metadata.billingUncertain).toBe(true);
  });

  it('não contabiliza falha comprovada antes do envio ao provedor', async () => {
    const { svc, jobRepo, video, modQuota } = build();
    const { jobId } = await svc.createJob(TENANT, baseInput);
    jobRepo.jobs.get(jobId).metadata = { ...jobRepo.jobs.get(jobId).metadata, rootAssetId: 'asset-root' };
    video.submit.mockRejectedValueOnce(new AppError(503, 'OPENROUTER_VIDEO_KEY_UNAVAILABLE', 'Chave indisponível', {notSubmitted:true}));
    await svc.processJob(jobId);
    expect(modQuota.refund).toHaveBeenCalledWith('asset-root');
    expect(jobRepo.jobs.get(jobId).metadata.billingUncertain).toBeUndefined();
  });

  it('getJob de outro tenant dá 404', async () => {
    const { svc } = build();
    const { jobId } = await svc.createJob(TENANT, baseInput);
    await expect(svc.getJob('outro', jobId)).rejects.toMatchObject({ statusCode: 404 });
  });

  describe('ajuste (mudanças por vídeo)', () => {
    it('consome 1 mudança da raiz, reescreve o roteiro e gera versão nova no grupo', async () => {
      const { svc, jobRepo, llm, studioRepo, modQuota } = build({ asset: adjustableAsset });
      const { jobId } = await svc.adjustVideo(TENANT, 'asset-v2', 'troque a música por algo mais animado');

      expect(modQuota.consume).toHaveBeenCalledWith('asset-root');
      expect(llm.chatWithImages.mock.calls[0][0].text).toContain('troque a música');
      expect(jobRepo.jobs.get(jobId).metadata).toMatchObject({ rootAssetId: 'asset-root', aspectRatio: '16:9', model: 'bytedance/seedance-2.0' });

      await svc.processJob(jobId);
      expect(jobRepo.completeOwnedVideoJob.mock.calls[0][2].rootAssetId).toBe('asset-root');
      expect(modQuota.refund).not.toHaveBeenCalled();
    });

    it('ajuste não conta na cota mensal de vídeos', async () => {
      const { svc, jobRepo } = build({ asset: adjustableAsset, limits: { videosPerMonth: 1, modificationsPerVideo: 3 } });
      await svc.adjustVideo(TENANT, 'asset-v2', 'mudar a cor do fundo');
      expect(jobRepo.reserveVideoAdjustment).toHaveBeenCalledOnce();
    });

    it('sem mudanças restantes: erro da cota e nada é gerado', async () => {
      const { svc, modQuota, llm } = build({ asset: adjustableAsset });
      modQuota.consume.mockRejectedValueOnce(Object.assign(new Error('limite'), { statusCode: 403, code: 'MODIFICATION_QUOTA_EXCEEDED' }));
      await expect(svc.adjustVideo(TENANT, 'asset-v2', 'mudar algo')).rejects.toMatchObject({ code: 'MODIFICATION_QUOTA_EXCEEDED' });
      expect(llm.chatWithImages).not.toHaveBeenCalled();
    });

    it('roteiro falhou: devolve a mudança', async () => {
      const { svc, modQuota, llm } = build({ asset: adjustableAsset });
      llm.chatWithImages.mockRejectedValueOnce(new Error('LLM fora'));
      await expect(svc.adjustVideo(TENANT, 'asset-v2', 'mudar algo')).rejects.toThrow('LLM fora');
      expect(modQuota.refund).toHaveBeenCalledWith('asset-root');
    });

    it('geração do ajuste falhou: devolve a mudança', async () => {
      const { svc, modQuota } = build({ asset: adjustableAsset, states: [{ status: 'failed', costUsd: null, error: 'x', unsignedUrls: [] }] });
      const { jobId } = await svc.adjustVideo(TENANT, 'asset-v2', 'mudar algo');
      await svc.processJob(jobId);
      expect(modQuota.refund).toHaveBeenCalledWith('asset-root');
    });

    it('plano sem vídeo não ajusta vídeos antigos', async () => {
      const { svc, modQuota } = build({ asset: adjustableAsset, limits: { videosPerMonth: 0, modificationsPerVideo: 0 } });
      await expect(svc.adjustVideo(TENANT, 'asset-v2', 'mudar algo')).rejects.toMatchObject({ code: 'VIDEO_NOT_IN_PLAN' });
      expect(modQuota.consume).not.toHaveBeenCalled();
    });

    it('recusa vídeo que não veio deste fluxo', async () => {
      const { svc } = build({ asset: { id: 'a', type: 'video', complianceNotes: '{"source":"moneyprinterturbo"}' } });
      await expect(svc.adjustVideo(TENANT, 'a', 'mudar algo')).rejects.toMatchObject({ code: 'VIDEO_NOT_ADJUSTABLE' });
    });
  });
});
