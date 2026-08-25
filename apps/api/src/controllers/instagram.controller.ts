import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { getRankedInstagramPosts } from '../services/meta/instagram.service.js';

const postsRankedQuerySchema = z.object({
  objective: z.enum(['visits', 'engagement', 'messages', 'whatsapp']),
  instagramUserId: z.string().min(1).optional(),
});

export async function getPostsRankedHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantId = req.tenant?.tenantId || '';
    if (!tenantId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Tenant ID required');
    }

    const { objective, instagramUserId } = postsRankedQuerySchema.parse(req.query);
    console.log({ objective, instagramUserId });
    const posts = await getRankedInstagramPosts(tenantId, objective, instagramUserId);

    res.json({
      success: true,
      data: posts,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}

const mediaProxyQuerySchema = z.object({
  url: z.string().url(),
});

// URLs de midia do Instagram sao servidas pelos CDNs da Meta (placehold.co e
// usado apenas pelos dados mockados em dev). Restringir o proxy a esses
// dominios evita que o endpoint seja usado como SSRF generico.
const ALLOWED_MEDIA_HOSTS = [/(^|\.)cdninstagram\.com$/, /(^|\.)fbcdn\.net$/, /(^|\.)placehold\.co$/];

export async function mediaProxyHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { url } = mediaProxyQuerySchema.parse(req.query);

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new AppError(400, 'INVALID_MEDIA_URL', 'URL de midia invalida.');
    }

    const isAllowedHost = ALLOWED_MEDIA_HOSTS.some((pattern) => pattern.test(parsedUrl.hostname));
    if (parsedUrl.protocol !== 'https:' || !isAllowedHost) {
      throw new AppError(400, 'INVALID_MEDIA_URL', 'URL de midia nao permitida.');
    }

    const response = await fetch(parsedUrl.toString());
    if (!response.ok || !response.body) {
      throw new AppError(502, 'MEDIA_PROXY_ERROR', 'Falha ao buscar midia do Instagram.');
    }

    res.setHeader('Content-Type', response.headers.get('content-type') ?? 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}
