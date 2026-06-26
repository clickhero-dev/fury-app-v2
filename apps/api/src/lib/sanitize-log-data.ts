const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie']);
const SENSITIVE_BODY_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'cpf',
  'cnpj',
  'credit_card',
]);

export function sanitizeHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.has(key.toLowerCase())) {
      out[key] = value;
    }
  }
  return out;
}

export function sanitizeBody(body: unknown, maxDepth = 5): unknown {
  if (body == null || maxDepth <= 0) {
    return body;
  }

  if (typeof body !== 'object') {
    return body;
  }

  if (Array.isArray(body)) {
    return body.map((item) => sanitizeBody(item, maxDepth - 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_BODY_KEYS.has(key.toLowerCase())) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = sanitizeBody(value, maxDepth - 1);
    }
  }
  return out;
}
