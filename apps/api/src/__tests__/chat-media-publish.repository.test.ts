import { beforeEach, describe, expect, it, vi } from 'vitest';
const execute = vi.hoisted(() => vi.fn());
vi.mock('@fury/db', () => ({db:{execute}}));
import { ChatMediaPublishRepository } from '../repository/chat-media-publish.repository.js';

beforeEach(() => execute.mockReset());
describe('repositório de mídia gerada', () => {
  it('aceita imagem de approval concluída retornada pela consulta escopada', async () => {
    execute.mockResolvedValue([{path:'/api/studio/ai/generate-image',result:{imageUrl:'https://example.com/a.png'}}]);
    expect(await new ChatMediaPublishRepository().findMedia('tenant','user','approval')).toEqual({kind:'image',url:'https://example.com/a.png'});
    expect(execute).toHaveBeenCalledOnce();
  });
  it('recusa URL insegura e job pendente', async () => {
    execute.mockResolvedValueOnce([{path:'/api/studio/ai/generate-image',result:{imageUrl:'http://example.com/a.png'}}]);
    execute.mockResolvedValueOnce([{path:'/api/studio/video/jobs',result:{job:{status:'pending',videoUrl:'https://example.com/a.mp4'}}}]);
    const repo = new ChatMediaPublishRepository();
    expect(await repo.findMedia('tenant','user','approval')).toBeNull();
    expect(await repo.findMedia('tenant','user','approval')).toBeNull();
  });
  it('aceita resultado final de vídeo e não fabrica mídia inexistente', async () => {
    execute.mockResolvedValueOnce([{path:'/api/studio/video/jobs',result:{job:{status:'done',videoUrl:'https://example.com/a.mp4'}}}]);
    execute.mockResolvedValueOnce([]);
    const repo = new ChatMediaPublishRepository();
    expect(await repo.findMedia('tenant','user','approval')).toEqual({kind:'video',url:'https://example.com/a.mp4'});
    expect(await repo.findMedia('tenant','user','approval')).toBeNull();
  });
  it('adquire claim somente quando inserção retorna uma linha', async () => {
    execute.mockResolvedValueOnce([{approval_id:'a'}]).mockResolvedValueOnce([]);
    const repo = new ChatMediaPublishRepository();
    expect(await repo.claim('tenant','user','approval')).toBe(true);
    expect(await repo.claim('tenant','user','approval')).toBe(false);
  });
});
