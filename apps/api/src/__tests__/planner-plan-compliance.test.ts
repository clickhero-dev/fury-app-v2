import { describe, it, expect, vi } from 'vitest';

vi.mock('../services/llms/openrouter.service.js', () => ({
  openrouterService: { assertCreditsAvailable: vi.fn().mockResolvedValue(undefined) },
}));

import { PlannerService, decoratePostsWithCompliance } from '../services/planner/planner.service.js';

const NOTES = '[COMPLIANCE] approved=false | data={"approved":false,"issues":["Logotipo de odontologia em anúncio de padaria."],"text_percentage":25}';

describe('decoratePostsWithCompliance (puro)', () => {
  it('anexa compliance por URL da imagem do post', () => {
    const posts = [{ id: 'p1', imageUrl: 'https://r2/imagem.png' }] as any[];
    const assets = [
      { url: 'https://r2/imagem.png', complianceStatus: 'rejected', complianceNotes: NOTES },
    ];
    const out = decoratePostsWithCompliance(posts, assets);
    expect(out[0].compliance).toEqual({ status: 'rejected', notes: NOTES });
  });

  it('usa imageUrls[0] quando imageUrl ausente (carrossel)', () => {
    const posts = [{ id: 'p2', imageUrl: null, imageUrls: ['https://r2/c1.png', 'https://r2/c2.png'] }] as any[];
    const assets = [{ url: 'https://r2/c1.png', complianceStatus: 'approved', complianceNotes: null }];
    expect(decoratePostsWithCompliance(posts, assets)[0].compliance).toEqual({ status: 'approved', notes: null });
  });

  it('compliance null quando não há asset correspondente', () => {
    const posts = [{ id: 'p3', imageUrl: 'https://r2/outra.png' }] as any[];
    expect(decoratePostsWithCompliance(posts, [])[0].compliance).toBeNull();
  });
});

describe('PlannerService.getPlanById com compliance', () => {
  it('retorna os posts do plano decorados com o compliance do asset (por URL)', async () => {
    const repo = {
      getPlanById: vi.fn().mockResolvedValue({
        id: 'plan-1',
        tenantId: 't-1',
        posts: [{ id: 'p1', imageUrl: 'https://r2/imagem.png' }],
      }),
      findAssetsByUrls: vi.fn().mockResolvedValue([
        { url: 'https://r2/imagem.png', complianceStatus: 'rejected', complianceNotes: NOTES },
      ]),
    };
    const svc = new PlannerService((() => repo) as any);

    const plan = await svc.getPlanById('plan-1', 't-1');

    expect(repo.findAssetsByUrls).toHaveBeenCalledWith(['https://r2/imagem.png']);
    expect(plan!.posts[0].compliance).toEqual({ status: 'rejected', notes: NOTES });
  });

  it('retorna null quando o plano não existe', async () => {
    const repo = { getPlanById: vi.fn().mockResolvedValue(null) };
    const svc = new PlannerService((() => repo) as any);
    expect(await svc.getPlanById('nope', 't-1')).toBeNull();
  });
});