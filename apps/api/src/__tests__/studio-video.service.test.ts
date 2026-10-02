import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StudioVideoService, mapMptProgress } from '../services/studio/studio-video.service.js';

const SONGS = ['output000.mp3', 'output001.mp3'];

function makeJobRepo() {
  const jobs = new Map<string, any>();
  return {
    jobs,
    createTenantJobIfUnderLimit: vi.fn(async (d: any, limit: number) => {
      const active = [...jobs.values()].filter((j) => j.tenantId === d.tenantId && ['pending', 'running'].includes(j.status));
      if (active.length >= limit) return false;
      jobs.set(d.id, { createdAt: new Date(), updatedAt: new Date(), artifacts: {}, ...d });
      return true;
    }),
    getWorkflowJob: vi.fn(async (id: string) => (jobs.has(id) ? { ...jobs.get(id) } : undefined)),
    patchWorkflowJob: vi.fn(async (id: string, patch: any) => { jobs.set(id, { ...jobs.get(id), ...patch }); }),
    renewWorkflowJobLock: vi.fn(async () => undefined),
    listTenantWorkflowJobs: vi.fn(async (tenantId: string, _w: string, statuses: string[]) =>
      [...jobs.values()].filter((j) => j.tenantId === tenantId && statuses.includes(j.status))),
  };
}

function makeStudioRepo(tracks: any[] = []) {
  return {
    listMusicTracks: vi.fn(async () => tracks),
    findMusicTrack: vi.fn(async (id: string) => tracks.find((t) => t.id === id)),
    createMusicTrack: vi.fn(async (d: any) => ({ id: 'track-1', ...d })),
    createAsset: vi.fn(async (d: any) => ({ id: 'asset-1', ...d })),
  };
}

function makeMpt(tasks: Array<any | null>) {
  let i = 0;
  return {
    createVideoTask: vi.fn(async () => `task-${i}`),
    getTask: vi.fn(async () => tasks[Math.min(i++, tasks.length - 1)]),
    downloadTaskFile: vi.fn(async () => Buffer.from('mp4')),
    listBuiltinSongs: vi.fn(async () => SONGS),
    uploadMusic: vi.fn(async () => 'abc123.mp3'),
  };
}

const baseInput = {
  prompt: 'Pizzaria artesanal com forno a lenha',
  voice: 'pt-BR-AntonioNeural-Male',
  voiceRate: 1,
  music: { mode: 'none' as const, volume: 0.2 },
  subtitles: { enabled: true, position: 'bottom' as const },
  transition: 'Shuffle',
};

const processing = (progress: number) => ({ state: 4, progress, videos: null, script: null, audioDuration: null, failedStage: null, error: null });
const complete = { state: 1, progress: 100, videos: ['/tasks/t/final-1.mp4'], script: 'roteiro', audioDuration: 42, failedStage: null, error: null };
const failed = { state: -1, progress: 10, videos: null, script: null, audioDuration: null, failedStage: 'terms', error: 'boom' };

function build(opts: { tasks?: any[]; tracks?: any[] } = {}) {
  const jobRepo = makeJobRepo();
  const studioRepo = makeStudioRepo(opts.tracks);
  const mpt = makeMpt(opts.tasks ?? [complete]);
  const enqueue = vi.fn(async () => undefined);
  const svc = new StudioVideoService({
    mpt: mpt as any,
    jobRepo: jobRepo as any,
    studioRepo: () => studioRepo as any,
    enqueue,
    sleep: async () => undefined,
    store: vi.fn(async () => 'https://cdn/video.mp4') as any,
  });
  return { svc, jobRepo, studioRepo, mpt, enqueue };
}

describe('StudioVideoService', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('mapMptProgress nomeia a etapa e limita a 95%', () => {
    expect(mapMptProgress(5)).toEqual({ stage: 'script', progress: 5 });
    expect(mapMptProgress(30).stage).toBe('voice');
    expect(mapMptProgress(45).stage).toBe('scenes');
    expect(mapMptProgress(100)).toEqual({ stage: 'render', progress: 95 });
  });

  it('createJob grava o job com parâmetros fixos e enfileira', async () => {
    const { svc, jobRepo, enqueue } = build();
    const { jobId } = await svc.createJob('t1', baseInput);
    const job = jobRepo.jobs.get(jobId);
    expect(job.workflow).toBe('studio-video');
    expect(job.metadata.params).toMatchObject({
      video_aspect: '9:16', video_language: 'pt-BR', video_source: 'pixabay',
      font_name: 'BeVietnamPro-Bold.ttf', bgm_type: '', bgm_volume: 0, video_transition_mode: 'Shuffle',
    });
    expect(enqueue).toHaveBeenCalledWith(jobId, 't1');
  });

  it('createJob bloqueia o 3º vídeo ativo do tenant', async () => {
    const { svc } = build();
    await svc.createJob('t1', baseInput);
    await svc.createJob('t1', baseInput);
    await expect(svc.createJob('t1', baseInput)).rejects.toMatchObject({ statusCode: 409 });
    await expect(svc.createJob('t2', baseInput)).resolves.toBeTruthy();
  });

  it('música aleatória sorteia só entre embutidas e as do próprio tenant', async () => {
    const tracks = [{ id: 'mine', name: 'jingle.mp3', mptFile: 'aaa.mp3' }];
    const { svc, jobRepo } = build({ tracks });
    for (let n = 0; n < 15; n++) {
      jobRepo.jobs.clear();
      const { jobId } = await svc.createJob('t1', { ...baseInput, music: { mode: 'random', volume: 0.2 } });
      const p = jobRepo.jobs.get(jobId).metadata.params;
      expect(['output000.mp3', 'output001.mp3', 'aaa.mp3']).toContain(p.bgm_file);
      expect(p.bgm_type).toBe('custom');
    }
  });

  it('música personalizada de outro tenant é rejeitada', async () => {
    const { svc } = build({ tracks: [] });
    await expect(
      svc.createJob('t1', { ...baseInput, music: { mode: 'custom', trackId: 'x', volume: 0.2 } }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('getJob de outro tenant responde 404', async () => {
    const { svc } = build();
    const { jobId } = await svc.createJob('t1', baseInput);
    await expect(svc.getJob('t2', jobId)).rejects.toMatchObject({ statusCode: 404 });
    await expect(svc.getJob('t1', jobId)).resolves.toMatchObject({ status: 'pending', stage: 'queued' });
  });

  it('processJob acompanha o MPT e salva o vídeo na biblioteca', async () => {
    const { svc, jobRepo, studioRepo, mpt } = build({ tasks: [processing(5), processing(50), complete] });
    const { jobId } = await svc.createJob('t1', baseInput);
    await svc.processJob(jobId);
    const job = jobRepo.jobs.get(jobId);
    expect(job.status).toBe('done');
    expect(job.artifacts).toEqual({ assetId: 'asset-1', videoUrl: 'https://cdn/video.mp4' });
    expect(mpt.createVideoTask).toHaveBeenCalledTimes(1);
    const asset = studioRepo.createAsset.mock.calls[0][0];
    expect(asset.type).toBe('video');
    expect(JSON.parse(asset.complianceNotes)).toMatchObject({ source: 'moneyprinterturbo', durationSeconds: 42, script: 'roteiro' });
  });

  it('processJob reenvia ao MPT quando a tarefa falha ou some', async () => {
    const { svc, jobRepo, mpt } = build({ tasks: [failed, null, complete] });
    const { jobId } = await svc.createJob('t1', baseInput);
    await svc.processJob(jobId);
    expect(mpt.createVideoTask).toHaveBeenCalledTimes(3);
    expect(jobRepo.jobs.get(jobId).status).toBe('done');
  });

  it('processJob desiste após 3 envios com falha', async () => {
    const { svc, jobRepo, mpt } = build({ tasks: [failed] });
    const { jobId } = await svc.createJob('t1', baseInput);
    await svc.processJob(jobId);
    expect(mpt.createVideoTask).toHaveBeenCalledTimes(3);
    const job = jobRepo.jobs.get(jobId);
    expect(job.status).toBe('error');
    expect(job.error).toMatch(/Tente novamente/);
  });

  it('processJob retoma a tarefa MPT já criada sem reenviar', async () => {
    const { svc, jobRepo, mpt } = build({ tasks: [complete] });
    const { jobId } = await svc.createJob('t1', baseInput);
    const job = jobRepo.jobs.get(jobId);
    job.metadata = { ...job.metadata, mptTaskId: 'existing', mptSubmissions: 1 };
    await svc.processJob(jobId);
    expect(mpt.createVideoTask).not.toHaveBeenCalled();
    expect(mpt.getTask).toHaveBeenCalledWith('existing');
  });

  it('uploadMusic aceita só extensões de áudio e usa MIME fixo', async () => {
    const { svc, mpt } = build();
    await expect(
      svc.uploadMusic('t1', { buffer: Buffer.from('x'), originalname: 'evil.html', mimetype: 'audio/mpeg' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    await svc.uploadMusic('t1', { buffer: Buffer.from('x'), originalname: 'Meu Jingle.MP3', mimetype: 'text/html' });
    expect(mpt.uploadMusic).toHaveBeenCalledWith(expect.any(Buffer), 'upload.mp3', 'audio/mpeg');
  });

  it('uploadMusic respeita o limite de músicas por tenant', async () => {
    const tracks = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, name: 'x', mptFile: 'y' }));
    const { svc } = build({ tracks });
    await expect(
      svc.uploadMusic('t1', { buffer: Buffer.from('x'), originalname: 'a.mp3', mimetype: 'audio/mpeg' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('listActiveJobs esconde job órfão sem heartbeat', async () => {
    const { svc, jobRepo } = build();
    const { jobId } = await svc.createJob('t1', baseInput);
    expect(await svc.listActiveJobs('t1')).toHaveLength(1);
    jobRepo.jobs.get(jobId).updatedAt = new Date(Date.now() - 11 * 60 * 1000);
    expect(await svc.listActiveJobs('t1')).toHaveLength(0);
  });
});
