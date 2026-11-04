/*
 * Funcionalidade: justificar a recomendação de um post do Instagram
 *
 * Cenário: enriquecer somente o post vencedor de objetivo elegível
 *   Dado posts de uma conta do tenant ordenados pelo ranking de engajamento
 *   Quando o serviço marca o primeiro como recomendado
 *   Então preserva ordem e scores e adiciona a frase somente a ele
 *
 * Cenário: visitas diretas pela API
 *   Dado posts ranqueados para visits
 *   Quando o primeiro post é recomendado
 *   Então não recebe motivo e nenhum post artificial é criado
 *
 * Cenário: lista vazia
 *   Dado uma conta sem imagens elegíveis
 *   Quando o ranking é calculado
 *   Então o retorno continua vazio
 */
import { describe, expect, it, vi } from 'vitest';
import { InstagramService } from '../services/meta/instagram.service.js';
import { encryptToken } from '../utils/crypto.js';

function createService(media: any[], insightsById: Record<string, any>) {
  const repo = { findLatestMetaConnection: vi.fn().mockResolvedValue({ accessToken: encryptToken('meta-token') }) };
  const metaApi = {
    getInstagramAccountInsights: vi.fn(),
    getUserFacebookPages: vi.fn(),
    getInstagramMedia: vi.fn().mockResolvedValue(media),
    getInstagramMediaInsights: vi.fn((id: string) => Promise.resolve(insightsById[id])),
  };
  const metaService = {
    getResolvedTenantAssetSelection: vi.fn().mockResolvedValue({ pages: [{ pageId: 'page-1', instagramUserId: 'ig-1' }] }),
  };

  return new InstagramService(() => repo as any, { metaApi, metaService } as any);
}

const images = [
  { id: 'post-menor', media_type: 'IMAGE', media_product_type: 'FEED', media_url: 'https://cdninstagram.com/menor.jpg', timestamp: '2026-01-01', like_count: 1, comments_count: 1 },
  { id: 'post-maior', media_type: 'IMAGE', media_product_type: 'FEED', media_url: 'https://cdninstagram.com/maior.jpg', timestamp: '2026-01-02', like_count: 5, comments_count: 4 },
];
const insights = {
  'post-menor': { reach: 10, saved: 1, shares: 1, replies: 1 },
  'post-maior': { reach: 40, saved: 8, shares: 3, replies: 6 },
};

describe('InstagramService — motivo de recomendação', () => {
  it('preserva ranking e adiciona a frase somente ao recomendado elegível', async () => {
    const service = createService(images, insights);

    const posts = await service.getRankedPosts('tenant-1', 'engagement');

    expect(posts.map(({ id, score, recommended }) => ({ id, score, recommended }))).toEqual([
      { id: 'post-maior', score: 5.5, recommended: true },
      { id: 'post-menor', score: 1, recommended: false },
    ]);
    expect(posts[0]).toMatchObject({ recommendationReason: 'Mais chance de trazer novos clientes.' });
    expect(posts[1]).not.toHaveProperty('recommendationReason');
  });

  it('omite o motivo em visits sem alterar o post recomendado', async () => {
    const service = createService(images, insights);

    const posts = await service.getRankedPosts('tenant-1', 'visits');

    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ id: 'post-maior', recommended: true });
    expect(posts[0]).not.toHaveProperty('recommendationReason');
  });

  it('mantém a lista vazia quando não há imagens elegíveis', async () => {
    const service = createService([{ id: 'reel', media_type: 'VIDEO', timestamp: '2026-01-01' }], {});

    await expect(service.getRankedPosts('tenant-1', 'leads')).resolves.toEqual([]);
  });
});
