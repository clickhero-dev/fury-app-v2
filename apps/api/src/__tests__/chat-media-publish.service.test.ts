import { describe, expect, it, vi } from 'vitest';
import { ChatMediaPublishService } from '../services/chat/chat-media-publish.service.js';

const media = {kind:'image' as const, url:'https://cdn.example.com/image.png'};
function setup() {
  const repo = {findMedia:vi.fn().mockResolvedValue(media), claim:vi.fn().mockResolvedValue(true), result:vi.fn().mockResolvedValue(null), finish:vi.fn().mockResolvedValue(undefined)};
  const publish = vi.fn().mockResolvedValue({status:'published', id:'post'});
  return {repo,publish,service:new ChatMediaPublishService(repo,publish)};
}
describe('publicação de mídia gerada no chat', () => {
  it('publica mídia autorizada uma vez usando a URL do servidor', async () => {
    const {service,repo,publish} = setup();
    expect(await service.publish('tenant','user','approval','legenda','ig')).toEqual({status:'published',id:'post'});
    expect(repo.findMedia).toHaveBeenCalledWith('tenant','user','approval');
    expect(publish).toHaveBeenCalledWith('tenant',{postType:'image',imageUrl:media.url,caption:'legenda',expectedInstagramUserId:'ig'});
    expect(repo.finish).toHaveBeenCalledOnce();
  });
  it('rejeita mídia inexistente sem publicar', async () => {
    const {service,repo,publish} = setup(); repo.findMedia.mockResolvedValue(null);
    await expect(service.publish('tenant','user','approval','','ig')).rejects.toMatchObject({statusCode:404});
    expect(publish).not.toHaveBeenCalled();
  });
  it('não repete uma publicação em andamento ou concluída', async () => {
    const {service,repo,publish} = setup(); repo.claim.mockResolvedValue(false);
    await expect(service.publish('tenant','user','approval','','ig')).rejects.toMatchObject({statusCode:409});
    expect(publish).not.toHaveBeenCalled();
  });
  it('devolve o resultado persistido sem repetir o efeito', async () => {
    const {service,repo,publish} = setup();
    repo.claim.mockResolvedValue(false);
    repo.result.mockResolvedValue({status:'published',id:'post'});
    expect(await service.publish('tenant','user','approval','','ig')).toEqual({status:'published',id:'post'});
    expect(publish).not.toHaveBeenCalled();
  });
  it('preserva claim após resultado desconhecido sem repetir o efeito', async () => {
    const {service,repo,publish} = setup(); publish.mockRejectedValue(new Error('timeout'));
    await expect(service.publish('tenant','user','approval','','ig')).rejects.toThrow('timeout');
    expect(repo.finish).not.toHaveBeenCalled();
  });
});
