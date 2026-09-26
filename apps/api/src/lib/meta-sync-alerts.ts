import { getRedis } from './redis.js';
import { emailService } from '../services/email/email.service.js';

/** Dedupe de 6h por (tenant, error_code) — evita spam de email no mesmo erro. */
const SYNC_ALERT_DEDUPE_TTL_SECONDS = 6 * 60 * 60;

/** Destinatários dos alertas de falha de sync (env var sobrepõe default). */
export function getSyncAlertEmails(): string[] {
  const raw =
    process.env.SYNC_ALERT_EMAILS ?? 'diogommtdes@gmail.com;diogo.souza@clickhero.com.br';
  return raw
    .split(';')
    .map((email) => email.trim())
    .filter(Boolean);
}

/** True se o alerta (tenant, errorCode) ainda não foi enviado nas últimas 6h. */
export async function shouldSendSyncAlert(tenantId: string, errorCode: string): Promise<boolean> {
  const redis = getRedis();
  const key = `meta-sync:alert:${tenantId}:${errorCode}`;
  try {
    const acquired = await redis.set(key, '1', 'EX', SYNC_ALERT_DEDUPE_TTL_SECONDS, 'NX');
    return acquired === 'OK';
  } catch (err) {
    // Redis indisponível → falha aberta: envia o email (nunca silenciar um erro de sync).
    console.error('[meta-sync-alert] Redis indisponível p/ dedupe:', (err as Error).message);
    return true;
  }
}

/** HTML simples do alerta de falha (substituído pelo template Ady em T006). */
function syncFailureHtml(tenantId: string, errorCode: string, message: string): string {
  return `
    <h2>Sincronização Meta falhou</h2>
    <p>Ocorreu uma falha na sincronização automática dos dados do Meta.</p>
    <ul>
      <li><strong>Tenant:</strong> ${tenantId}</li>
      <li><strong>Código:</strong> ${errorCode}</li>
      <li><strong>Detalhe:</strong> ${message || 'sem detalhes'}</li>
    </ul>
  `;
}

/** Envia email de alerta de falha com dedupe de 6h por (tenant, errorCode). */
export async function notifyMetaSyncFailure(args: {
  tenantId: string;
  errorCode: string;
  message: string;
}): Promise<void> {
  try {
    const shouldSend = await shouldSendSyncAlert(args.tenantId, args.errorCode);
    if (!shouldSend) return;

    const emails = getSyncAlertEmails();
    if (emails.length === 0) return;

    const html = syncFailureHtml(args.tenantId, args.errorCode, args.message);
    await Promise.all(
      emails.map((to) =>
        emailService.sendEmail({
          to,
          subject: `[Ady] Falha na sincronização Meta (${args.errorCode})`,
          html,
        })
      )
    );
  } catch (err) {
    console.error('[meta-sync-alert] falha ao notificar sync failure:', (err as Error).message);
  }
}