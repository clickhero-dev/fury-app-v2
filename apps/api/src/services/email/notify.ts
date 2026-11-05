import { AuthRepository } from '../../repository/auth.repository.js';

/**
 * Módulo de composição para notificações transacionais por email.
 *
 * - `resolveNotifyEmails` resolve os destinatários de um tenant via repository
 *   (isolamento de persistência: nenhum `db` cru aqui).
 * - `notifyEmails` dispara de forma fire-and-forget: falha de envio é apenas
 *   logada, nunca derruba o fluxo (igual ao padrão do AuthService).
 */
export async function resolveNotifyEmails(
  tenantId: string | undefined,
  actorEmail?: string,
): Promise<string[]> {
  const emails: string[] = [];

  if (tenantId) {
    const ownerEmails = await new AuthRepository(tenantId).findUserEmailsByTenant();
    emails.push(...ownerEmails);
  }

  if (actorEmail) emails.push(actorEmail);

  return [...new Set(emails)];
}

export function notifyEmails(emails: string[], send: (email: string) => Promise<void>): void {
  for (const email of emails) {
    send(email).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[notify] Falha ao enviar email para ${email}:`, message);
    });
  }
}

/**
 * Dispara um email transacional para o tenant (usuários) + quem agiu, de forma
 * fire-and-forget. Conveniência de composição para os pontos de gatilho.
 */
export async function sendToTenant(
  tenantId: string | undefined,
  actorEmail: string | undefined,
  send: (email: string) => Promise<void>,
): Promise<void> {
  const emails = await resolveNotifyEmails(tenantId, actorEmail);
  notifyEmails(emails, send);
}