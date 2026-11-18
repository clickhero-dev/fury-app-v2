/** Bounded domain evidence, never an HTTP client, credential or provider error. */
const secretKeys = new Set(['token', 'accesstoken', 'refreshtoken', 'authorization', 'password', 'secret', 'clientsecret', 'apikey', 'cookie', 'setcookie', 'headers', 'credentials']);
const secretText = /\bBearer\s+\S+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|[?&](?:access_token|token|api_key|x-amz-signature|x-goog-signature)=[^&\s]*/gi;
const message = 'Não foi possível preservar o resultado da ação.';
const MAX_BYTES = 262144;

export function encodeChatOutcome(value: unknown): string {
  const seen = new Set<object>();
  function copy(item: unknown, depth: number): unknown {
    if (depth > 16) throw new Error(message);
    if (typeof item === 'string') return item.replace(secretText, '[credencial omitida]');
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (item instanceof Date) {
      if (!Number.isFinite(item.getTime())) throw new Error(message);
      return item.toISOString();
    }
    if (typeof item !== 'object' || !item || seen.has(item)) throw new Error(message);
    seen.add(item);
    try {
      if (Array.isArray(item)) {
        if (item.length > 1000) throw new Error(message);
        return item.map(entry => copy(entry, depth + 1));
      }
      const entries = Object.entries(item);
      if (entries.length > 500) throw new Error(message);
      return Object.fromEntries(entries
        .filter(([key, entry]) => entry !== undefined && !secretKeys.has(key.toLowerCase().replace(/[^a-z0-9]/g, '')))
        .map(([key, entry]) => [key, copy(entry, depth + 1)]));
    } finally {
      seen.delete(item);
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(message);
  const object = value as Record<string, unknown>;
  if (object.error || object.success === false || (object.partial_failures != null
    && (!Array.isArray(object.partial_failures) || object.partial_failures.length > 0))) throw new Error(message);
  const encoded = JSON.stringify(copy(value, 0));
  if (Buffer.byteLength(encoded, 'utf8') > MAX_BYTES) throw new Error(message);
  return encoded;
}
