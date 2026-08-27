import {
  getInstagramAccountInsights,
  getInstagramMedia,
  getInstagramMediaInsights,
  getUserFacebookPages,
  type InstagramMediaInsights,
} from '../../lib/meta-api.js';
import { decryptMetaToken } from '../../utils/crypto.js';
import { AppError } from '../../middleware/errorHandler.js';
import { MetaRepository } from '../../repository/meta.repository.js';
import { getResolvedTenantAssetSelection } from './meta.service.js';

export type InstagramRankingObjective = 'visits' | 'engagement' | 'messages' | 'whatsapp';

export interface RankedInstagramPost {
  id: string;
  caption?: string;
  media_url?: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  insights: InstagramMediaInsights;
  score: number;
  recommended: boolean;
}

function computeScore(objective: InstagramRankingObjective, post: {
  likeCount: number;
  commentsCount: number;
  insights: InstagramMediaInsights;
}): number {
  const { likeCount, commentsCount, insights } = post;

  if (objective === 'visits') {
    return insights.reach * 0.5 + insights.shares * 0.3 + commentsCount * 0.2;
  }

  if (objective === 'messages' || objective === 'whatsapp') {
    return insights.replies * 0.7 + commentsCount * 0.3;
  }

  return insights.saved * 0.4 + insights.shares * 0.25 + commentsCount * 0.2 + likeCount * 0.15;
}

export interface InstagramDashboardInsights {
  comments: number;
  saves: number;
  followers: number;
  period: { from: string; to: string };
}

/**
 * Busca metricas organicas (comentarios, salvamentos e variacao de seguidores)
 * para o card de engajamento do Dashboard. Retorna `null` (sem lancar erro)
 * quando o tenant nao tem conexao Meta ou nao tem conta do Instagram Business
 * vinculada, para que o frontend exiba o estado vazio.
 */
export async function getInstagramDashboardInsights(
  tenantId: string,
  dateFrom: string,
  dateTo: string
): Promise<InstagramDashboardInsights | null> {
  const metaConn = await new MetaRepository(tenantId).findLatestMetaConnection();

  if (!metaConn) {
    return null;
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);

  try {
    const assetSelection = await getResolvedTenantAssetSelection(tenantId);
    let selectedPage = assetSelection.pages.find((page) => page.instagramUserId);

    // ponytail: se a página selecionada não tem Instagram, busca em TODAS as
    // páginas do usuário. O usuário pode ter selecionado uma página sem
    // Instagram Business, mas ter o Instagram conectado em outra página.
    if (!selectedPage?.instagramUserId) {
      const allPages = await getUserFacebookPages(accessToken, { includeWhatsApp: false });
      const fallback = allPages.find((page) => page.instagramUserId);
      console.log(
        `[Instagram] tenant=${tenantId} selectedPage sem Instagram (IDs: ${assetSelection.pages.map(p => p.pageId).join(',')}), ` +
        `fallback: ${fallback ? `page=${fallback.pageId} igUserId=${fallback.instagramUserId}` : 'nenhuma página com Instagram'}`
      );
      selectedPage = fallback;
    }

    if (!selectedPage?.instagramUserId) {
      return null;
    }

    const insights = await getInstagramAccountInsights(selectedPage.instagramUserId, accessToken, dateFrom, dateTo);

    return {
      comments: insights.comments,
      saves: insights.saves,
      followers: insights.followerChange,
      period: { from: dateFrom, to: dateTo },
    };
  } catch (err) {
    if (err instanceof AppError && err.code === 'INSTAGRAM_ACCOUNT_NOT_FOUND') {
      return null;
    }
    throw err;
  }
}

export async function getRankedInstagramPosts(
  tenantId: string,
  objective: InstagramRankingObjective,
  instagramUserId?: string
): Promise<RankedInstagramPost[]> {
  const metaConn = await new MetaRepository(tenantId).findLatestMetaConnection();

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexao Meta encontrada para este tenant.');
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);

  try {
    // Resolve o igUserId a partir das Paginas selecionadas pelo tenant (nunca
    // "a primeira conta do Instagram do usuario Meta"), evitando vazar posts
    // de outra conta/negocio que o mesmo usuario Meta tambem administra.
    const assetSelection = await getResolvedTenantAssetSelection(tenantId);
    const tenantIgUserIds = assetSelection.pages
      .map((page) => page.instagramUserId)
      .filter((id): id is string => Boolean(id));

    const igUserId =
      instagramUserId && tenantIgUserIds.includes(instagramUserId) ? instagramUserId : tenantIgUserIds[0];

    if (!igUserId) {
      throw new AppError(
        404,
        'INSTAGRAM_ACCOUNT_NOT_FOUND',
        'Nenhuma conta do Instagram Business vinculada as Paginas selecionadas.'
      );
    }

    const media = await getInstagramMedia(igUserId, accessToken);

    // Filtra apenas tipos de midia com imagem exibivel (imagens diretas e
    // albuns de carrossel). Videos/Reels nao tem `media_url` estatica e a
    // thumbnail usada como fallback nao representa o post real.
    const imageMedia = media.filter((item) => item.media_type === 'IMAGE' || item.media_type === 'CAROUSEL_ALBUM');

    const posts = await Promise.all(
      imageMedia.map(async (item) => {
        const insights = await getInstagramMediaInsights(item.id, accessToken, item.media_product_type);
        const likeCount = item.like_count ?? 0;
        const commentsCount = item.comments_count ?? 0;

        // Videos/Reels nao tem `media_url` exibivel diretamente (arquivo de video);
        // usar a thumbnail como imagem de preview.
        const displayUrl = item.media_type === 'VIDEO' ? (item.thumbnail_url ?? item.media_url) : (item.media_url ?? item.thumbnail_url);

        return {
          id: item.id,
          caption: item.caption,
          media_url: displayUrl,
          timestamp: item.timestamp,
          like_count: likeCount,
          comments_count: commentsCount,
          insights,
          score: computeScore(objective, { likeCount, commentsCount, insights }),
          recommended: false,
        };
      })
    );

    posts.sort((a, b) => b.score - a.score);
    if (posts[0]) {
      posts[0].recommended = true;
    }

    return posts;
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }

    const metaCode = (err as any).metaCode;
    const metaType = (err as any).metaType;
    console.error('[Instagram] getRankedInstagramPosts error:', {
      metaCode,
      metaType,
      message: (err as Error).message,
    });

    if (metaCode === 190) {
      throw new AppError(401, 'META_TOKEN_EXPIRED', 'Token Meta expirado. Reconecte sua conta em Configurações > Integrações');
    }

    if (metaType === 'OAuthException' && (metaCode === 200 || metaCode === 10)) {
      throw new AppError(
        403,
        'META_PERMISSION_DENIED',
        'Permissão do Instagram ausente. Reconecte sua conta em Configurações > Integrações.'
      );
    }

    throw new AppError(502, 'INSTAGRAM_API_ERROR', 'Erro ao buscar posts do Instagram. Tente novamente.');
  }
}
