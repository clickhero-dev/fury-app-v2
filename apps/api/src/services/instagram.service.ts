import { eq } from 'drizzle-orm';
import { db, metaConnections } from '../lib/db.js';
import {
  getInstagramBusinessAccountId,
  getInstagramMedia,
  getInstagramMediaInsights,
  type InstagramMediaInsights,
} from '../lib/meta-api.js';
import { decryptMetaToken } from '../utils/crypto.js';
import { AppError } from '../middleware/errorHandler.js';

export type InstagramRankingObjective = 'visits' | 'engagement' | 'messages';

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

  if (objective === 'messages') {
    return insights.replies * 0.7 + commentsCount * 0.3;
  }

  return insights.saved * 0.4 + insights.shares * 0.25 + commentsCount * 0.2 + likeCount * 0.15;
}

export async function getRankedInstagramPosts(
  tenantId: string,
  objective: InstagramRankingObjective
): Promise<RankedInstagramPost[]> {
  const metaConn = await db.query.metaConnections.findFirst({
    where: eq(metaConnections.tenantId, tenantId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });

  if (!metaConn) {
    throw new AppError(403, 'META_CONNECTION_NOT_FOUND', 'Nenhuma conexao Meta encontrada para este tenant.');
  }

  const accessToken = decryptMetaToken(metaConn.accessToken);
  console.log('[Instagram] getRankedInstagramPosts - tenant:', tenantId, 'objective:', objective);

  try {
    const igUserId = await getInstagramBusinessAccountId(accessToken);
    const media = await getInstagramMedia(igUserId, accessToken);

    const posts = await Promise.all(
      media.map(async (item) => {
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
