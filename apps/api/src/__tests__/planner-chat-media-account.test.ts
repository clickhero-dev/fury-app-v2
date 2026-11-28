import { describe, expect, it, vi } from 'vitest';
import { PlannerService } from '../services/planner/planner.service.js';

describe('conta revisada para publicação do chat', () => {
  it('não publica se a conta autorizada mudou após revisão', async () => {
    const repo = {
      createPost:vi.fn().mockResolvedValue({id:'post',postType:'image',imageUrl:'https://example.com/a.png'}),
      markPostFailed:vi.fn().mockResolvedValue(undefined),
    };
    const publish = vi.fn();
    const service = new PlannerService(() => repo as never, {publishInstagramMedia:publish} as never);
    vi.spyOn(service,'resolveInstagramAccount').mockResolvedValue({igUserId:'outra',accessToken:'token',pageName:'Página'});
    const result = await service.publishNow('tenant',{postType:'image',imageUrl:'https://example.com/a.png',expectedInstagramUserId:'revisada'});
    expect(result.status).toBe('failed');
    expect(publish).not.toHaveBeenCalled();
    expect(repo.markPostFailed).toHaveBeenCalledOnce();
  });
});
