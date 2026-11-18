import { db } from '@fury/db';
import { sql } from 'drizzle-orm';
import type { ChatMediaPublishPort } from '../services/chat/chat-media-publish.service.js';

export class ChatMediaPublishRepository implements ChatMediaPublishPort {
  async findMedia(tenantId:string, userId:string, approvalId:string) {
    const rows = await db.execute(sql`SELECT path, result FROM chat_approvals
      WHERE id=${approvalId}::uuid AND tenant_id=${tenantId}::uuid AND user_id=${userId}::uuid
      AND status='completed' AND (path IN ('/api/studio/ai/generate-image','/api/studio/ai/chat-edit','/api/studio/video/jobs') OR path LIKE '/api/studio/video/assets/%/chat-adjust')`);
    const row = rows[0] as {path:string;result:unknown}|undefined;
    if (!row || !row.result || typeof row.result !== 'object') return null;
    const result = row.result as {imageUrl?:unknown;videoUrl?:unknown;job?:{status?:string;videoUrl?:unknown}};
    const video = row.path.startsWith('/api/studio/video/');
    const value = video ? (result.job?.status === 'done' ? result.job.videoUrl : result.videoUrl) : result.imageUrl;
    if (typeof value !== 'string' || !/^https:\/\//i.test(value)) return null;
    return {kind:video ? 'video' as const : 'image' as const,url:value};
  }
  async claim(tenantId:string,userId:string,approvalId:string) {
    const rows = await db.execute(sql`INSERT INTO chat_media_publications (approval_id,tenant_id,user_id)
      VALUES (${approvalId}::uuid,${tenantId}::uuid,${userId}::uuid) ON CONFLICT (approval_id) DO NOTHING RETURNING approval_id`);
    return rows.length === 1;
  }
  async result(tenantId:string,userId:string,approvalId:string) {
    const rows = await db.execute(sql`SELECT result FROM chat_media_publications
      WHERE approval_id=${approvalId}::uuid AND tenant_id=${tenantId}::uuid AND user_id=${userId}::uuid`);
    return (rows[0]?.result ?? null) as {status:string;[key:string]:unknown}|null;
  }
  async finish(tenantId:string,userId:string,approvalId:string,result:{status:string;[key:string]:unknown}) {
    await db.execute(sql`UPDATE chat_media_publications SET result=${JSON.stringify(result)}::jsonb
      WHERE approval_id=${approvalId}::uuid AND tenant_id=${tenantId}::uuid AND user_id=${userId}::uuid AND result IS NULL`);
  }
}
