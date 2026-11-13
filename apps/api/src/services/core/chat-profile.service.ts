import { ChatProfileRepository, type ChatProfileValues } from '../../repository/chat-profile.repository.js';
import { AppError } from '../../middleware/errorHandler.js';

export class ChatProfileService {
  constructor(private readonly repoFactory: (tenantId: string) => ChatProfileRepository = tenantId => new ChatProfileRepository(tenantId)) {}
  async snapshot(tenantId: string, userId: string) {
    const data = await this.repoFactory(tenantId).snapshot(userId);
    if (!data) throw new AppError(404, 'PROFILE_NOT_FOUND', 'Perfil não encontrado.');
    return data;
  }
  async update(tenantId: string, userId: string, userVersion: string, tenantVersion: string, values: ChatProfileValues) {
    const repo = this.repoFactory(tenantId);
    if (!await repo.updateIfVersion(userId,userVersion,tenantVersion,values)) throw new AppError(409,'PROFILE_CHANGED','O perfil ou negócio mudou. Consulte novamente antes de confirmar.');
    return repo.snapshot(userId);
  }
}
