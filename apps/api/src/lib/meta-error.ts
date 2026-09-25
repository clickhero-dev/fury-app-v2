import { AppError } from '../middleware/errorHandler.js';

/**
 * Classificação + sanitização de erros da Meta Graph (ADR-0002).
 *
 * Objetivo: distinguir erro (classe permission) de erro genérico de integração e
 * produzir um `reason` CLIENT-SAFE (nunca token, payload interno ou stack) para
 * o envelope `{ data, partial_failures }`.
 */

/** Textos que evidenciam falta de permissão/scope no erro do Meta. */
const PERMISSION_HINTS = [
  'permission',
  'permiss',
  'scope',
  'manage_ads',
  'ads_read',
  'pages_manage',
  'business_management',
  'not authorized',
  'insufficient permissions',
  'sem permiss',
  'sem acesso',
];

/**
 * True se o erro do Meta NÃO é um mero `#200/OAuthException` genérico e sim um
 * caso real de permissão/scope. O `#200` é genérico (token sem acesso a nó,
 * rate limit, page token expirado, transitório) — NÃO deve virar
 * `META_PERMISSION_DENIED` sem evidência no texto/mensagem do Meta.
 */
export function isMetaPermissionDenied(err: unknown): boolean {
  const text = metaErrorText(err).toLowerCase();
  return PERMISSION_HINTS.some((hint) => text.includes(hint));
}

function metaErrorText(err: unknown): string {
  const e = err as any;
  const meta = e?.metaError?.error ?? e?.payload?.error ?? e?.error ?? {};
  const reason = `${e?.error_user_msg ?? ''} ${e?.error_user_title ?? ''} ${e?.message ?? ''}`;
  const detail =
    `${meta?.error_user_msg ?? ''} ${meta?.error_user_title ?? ''} ${meta?.message ?? ''}`;
  return `${reason} ${detail} ${e?.metaCode ?? ''}`;
}

/**
 * Sanitiza uma razão de erro para exibição/telemetria.
 * Remove aparências de token/secreta, colapsa espaço e limita o comprimento.
 */
export function sanitizeMetaReason(err: unknown, fallback = 'Não foi possível sincronizar com a Meta.'): string {
  let text = '';
  if (err instanceof AppError) {
    text = err.message || '';
  } else if (err instanceof Error) {
    text = err.message || '';
  }
  text = String(text);
  if (!text) return fallback;

  text = text.replace(/(access_token|accessToken|bearer|token|secret|password)([=:\s]+)([\w\-.]{8,})/gi, '$1$2[redacted]');
  text = text.replace(/\b[A-Za-z0-9_\-.]{48,}\b/g, '[redacted]');
  text = text.replace(/\s+/g, ' ').trim();
  if (text.length > 220) text = text.slice(0, 217) + '...';
  return text || fallback;
}

/** Código de erro AppError (ou genérico) para o `partial_failures[].code`. */
export function metaErrorCode(err: unknown): string {
  if (err instanceof AppError) return err.code;
  return 'META_INTEGRATION_ERROR';
}
