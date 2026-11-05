// Consentimento de cookies: escolha do usuário gravada num cookie de 12 meses.

export const CONSENT_COOKIE = 'ch_consent';
export const CONSENT_VERSION = '1'; // bump quando a política mudar
export const CONSENT_MAX_AGE_DAYS = 365;
export const PRIVACY_URL = 'https://clickhero-ad-analyzer.lovable.app/privacy';

export type ConsentLevel = 'all' | 'essential' | 'rejected';

export interface ConsentValue {
  v: string;
  level: ConsentLevel;
  at: string; // ISO 8601
}

function isConsentValue(value: unknown): value is ConsentValue {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (r.level !== 'all' && r.level !== 'essential' && r.level !== 'rejected') return false;
  if (typeof r.v !== 'string') return false;
  return typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at));
}

function readRawCookie(name: string): string | null {
  try {
    for (const part of document.cookie.split('; ')) {
      const eq = part.indexOf('=');
      if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
    }
    return null;
  } catch {
    return null;
  }
}

function isHttps(): boolean {
  try {
    return location.protocol === 'https:';
  } catch {
    return false;
  }
}

// exportado para testar o atributo Secure sem mexer em location
export function serializeCookie(value: ConsentValue, secureCtx = isHttps()): string {
  const parts = [
    `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(value))}`,
    `Max-Age=${CONSENT_MAX_AGE_DAYS * 86400}`,
    'Path=/',
    'SameSite=Lax',
  ];
  if (secureCtx) parts.push('Secure');
  return parts.join('; ');
}

// null se ausente, corrompido ou de versão anterior. Nunca lança.
export function getConsent(): ConsentValue | null {
  const raw = readRawCookie(CONSENT_COOKIE);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isConsentValue(parsed) || parsed.v !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

// grava o cookie de 12 meses; devolve o valor mesmo se a escrita falhar
export function setConsent(level: ConsentLevel): ConsentValue {
  const value: ConsentValue = { v: CONSENT_VERSION, level, at: new Date().toISOString() };
  try {
    document.cookie = serializeCookie(value);
  } catch {
    // cookie bloqueado: escolha vale só nesta sessão
  }
  return value;
}

export function needsConsent(): boolean {
  return getConsent() === null;
}
