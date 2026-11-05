import { AppError } from '../../middleware/errorHandler.js';
import { PolicyRepository } from '../../repository/policy.repository.js';
import type { PolicyRepository as IPolicyRepository } from '../../repository/policy.repository.js';

export interface PolicyStateDTO {
  /** Versão vigente (string), ou null se não houver política publicada. */
  currentVersion: string | null;
  /** Id da versão vigente (para o POST /accept). */
  currentVersionId: string | null;
  /** true se o usuário já aceitou a versão vigente (ou se não há versão — fail-open). */
  accepted: boolean;
  /** Conteúdo completo da versão vigente. */
  content: string | null;
}

export interface PolicyLoginState {
  currentVersion: string | null;
  accepted: boolean;
}

/**
 * Service do domínio **Política de uso** (ADR-0001 — classe com DI).
 *
 * Regras:
 * - Fail-open: sem versão vigente publicada, o usuário NÃO é bloqueado.
 * - Aceite idempotente: unique (user_id, policy_version_id) no banco.
 */
export class PolicyService {
  constructor(private readonly repo: IPolicyRepository = new PolicyRepository()) {}

  /** Estado completo (com conteúdo) para a página de aceite. */
  async getCurrentForUser(userId: string): Promise<PolicyStateDTO> {
    const { currentVersion, accepted } = await this.repo.getCurrentPolicyWithAcceptance(userId);

    if (!currentVersion) {
      return { currentVersion: null, currentVersionId: null, accepted: true, content: null };
    }

    return {
      currentVersion: currentVersion.version,
      currentVersionId: currentVersion.id,
      accepted,
      content: currentVersion.content,
    };
  }

  /** Estado enxuto embutido na resposta de login (evita over-fetching). */
  async getLoginState(userId: string): Promise<PolicyLoginState> {
    const { currentVersion, accepted } = await this.repo.getCurrentPolicyWithAcceptance(userId);
    return {
      currentVersion: currentVersion?.version ?? null,
      accepted,
    };
  }

  /** Registra o aceite do usuário para uma versão. Idempotente. */
  async accept(tenantId: string, userId: string, policyVersionId: string): Promise<PolicyLoginState> {
    const repo = this.repoForTenant(tenantId);
    const { currentVersion } = await repo.getCurrentPolicyWithAcceptance(userId);

    if (!currentVersion) {
      throw new AppError(400, 'POLICY_VERSION_NOT_FOUND', 'Não há versão vigente da política.');
    }

    // Valida que a versão aceita É a vigente (evita aceite de versão antiga/stale).
    if (currentVersion.id !== policyVersionId) {
      throw new AppError(
        409,
        'POLICY_VERSION_STALE',
        'A versão informada não é a vigente. Recarregue a página.',
      );
    }

    await repo.createAcceptance(userId, policyVersionId);

    return { currentVersion: currentVersion.version, accepted: true };
  }

  private repoForTenant(tenantId: string): IPolicyRepository {
    // O repo default serve para leitura global; gravação precisa do tenant real.
    if (tenantId && this.repo instanceof PolicyRepository) {
      return new PolicyRepository(tenantId);
    }
    return this.repo;
  }
}
