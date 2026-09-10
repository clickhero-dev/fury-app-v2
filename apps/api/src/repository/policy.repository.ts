import { and, eq } from 'drizzle-orm';
import { desc, sql as sqlFn } from 'drizzle-orm';
import {
  db as defaultDb,
  type Database,
  policyAcceptances,
  policyVersions,
} from '@fury/db';
import { TenantScopedRepository } from './base.repository.js';

type PolicyVersion = typeof policyVersions.$inferSelect;

/**
 * Repositório do domínio **Política de uso** (ADR-0001).
 *
 * `policy_versions` é GLOBAL (sem tenant) — análogo à tabela `plans`.
 * `policy_acceptances` é tenant-scoped (herda o escopo do construtor).
 *
 * O construtor aceita placeholder `''` para operações globais
 * (findCurrentVersion), seguindo o padrão do AuthRepository.
 */
export class PolicyRepository extends TenantScopedRepository {
  constructor(tenantId: string = '', db: Database = defaultDb) {
    super(tenantId, db);
  }

  /** Versão vigente = inserção mais recente (decisão da feature). */
  async findCurrentVersion(): Promise<PolicyVersion | undefined> {
    return this.db.query.policyVersions.findFirst({
      orderBy: [desc(policyVersions.createdAt)],
    });
  }

  /** Aceite do usuário para uma versão específica (idempotência). */
  async findUserAcceptanceOfVersion(userId: string, policyVersionId: string) {
    return this.db.query.policyAcceptances.findFirst({
      where: and(
        eq(policyAcceptances.userId, userId),
        eq(policyAcceptances.policyVersionId, policyVersionId)
      ),
    });
  }

  /** Registra aceite — idempotente via unique (user_id, policy_version_id). */
  async createAcceptance(userId: string, policyVersionId: string) {
    const [row] = await this.db
      .insert(policyAcceptances)
      .values({
        tenantId: this.tenantId,
        userId,
        policyVersionId,
      })
      .onConflictDoNothing({
        target: [policyAcceptances.userId, policyAcceptances.policyVersionId],
      })
      .returning();
    return row ?? null;
  }

  /**
   * O usuário já aceitou QUALQUER versão? Usado no login para o gate:
   * se a versão vigente mudou, o aceite antigo não vale — mas a existência
   * de um aceite anterior distingue usuário antigo de novo (UX de redirect).
   */
  async hasUserAcceptedAnyVersion(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ ok: sqlFn`1` })
      .from(policyAcceptances)
      .where(eq(policyAcceptances.userId, userId))
      .limit(1);
    return rows.length > 0;
  }

  /** Versão vigente + aceite do usuário numa única ida ao banco. */
  async getCurrentPolicyWithAcceptance(userId: string): Promise<{
    currentVersion: PolicyVersion | undefined;
    accepted: boolean;
  }> {
    const current = await this.findCurrentVersion();
    // Fail-open: sem versão vigente, não bloqueia o usuário (spec SC-004).
    if (!current) return { currentVersion: undefined, accepted: true };

    const acceptance = await this.findUserAcceptanceOfVersion(userId, current.id);
    return { currentVersion: current, accepted: !!acceptance };
  }
}
