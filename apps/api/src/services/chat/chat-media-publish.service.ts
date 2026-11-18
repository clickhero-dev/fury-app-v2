import { AppError } from '../../middleware/errorHandler.js';

type Media = {kind:'image'|'video'; url:string};
type Result = {status:string; [key:string]:unknown};
export interface ChatMediaPublishPort {
  findMedia(tenantId:string, userId:string, approvalId:string):Promise<Media|null>;
  claim(tenantId:string, userId:string, approvalId:string):Promise<boolean>;
  result(tenantId:string, userId:string, approvalId:string):Promise<Result|null>;
  finish(tenantId:string, userId:string, approvalId:string, result:Result):Promise<void>;
}
export class ChatMediaPublishService {
  constructor(private readonly repo:ChatMediaPublishPort, private readonly publishNow:(tenantId:string, payload:{postType:string; imageUrl:string; caption:string; expectedInstagramUserId:string})=>Promise<Result>) {}
  async publish(tenantId:string, userId:string, approvalId:string, caption:string, expectedInstagramUserId:string) {
    const media = await this.repo.findMedia(tenantId,userId,approvalId);
    if (!media) throw new AppError(404,'CHAT_MEDIA_NOT_FOUND','Mídia não encontrada ou indisponível.');
    if (!await this.repo.claim(tenantId,userId,approvalId)) {
      const saved = await this.repo.result(tenantId,userId,approvalId);
      if (saved) return saved;
      throw new AppError(409,'CHAT_MEDIA_PUBLISH_IN_PROGRESS','A publicação está em andamento ou não pôde ser confirmada.');
    }
    const result = await this.publishNow(tenantId,{postType:media.kind === 'video' ? 'reel' : 'image',imageUrl:media.url,caption,expectedInstagramUserId});
    await this.repo.finish(tenantId,userId,approvalId,result);
    return result;
  }
}
