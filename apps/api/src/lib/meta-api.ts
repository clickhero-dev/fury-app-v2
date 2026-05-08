import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const META_API_VERSION = 'v20.0';
const META_GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'fury-default-key';
const ALGORITHM = 'aes-256-cbc';

export function decryptAccessToken(encryptedToken: string): string {
  try {
    if (encryptedToken.length < 50) {
      return encryptedToken;
    }

    const [ivHex, encryptedHex] = encryptedToken.split(':');
    if (!ivHex || !encryptedHex) {
      return encryptedToken;
    }

    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const key = scryptSync(ENCRYPTION_KEY, 'salt', 32);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt token:', (err as Error).message);
    return encryptedToken;
  }
}

export function encryptAccessToken(token: string): string {
  const iv = randomBytes(16);
  const key = scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  return `${iv.toString('hex')}:${encrypted}`;
}

type MetaApiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    type?: string;
    error_subcode?: number;
  };
};

type MetaApiError = Error & {
  metaCode?: number;
};

export async function metaApiCall<T>(
  path: string,
  accessToken: string,
  options?: {
    method?: string;
    body?: Record<string, unknown>;
  }
): Promise<T> {
  // Always mock in development (check for typical mock patterns)
  const isMocked = accessToken.toLowerCase().includes('mock') ||
                   !accessToken.startsWith('EAAC') || // Real Meta tokens start with EAAC
                   process.env.NODE_ENV === 'development';

  if (isMocked) {
    const method = options?.method || 'GET';
    const body = options?.body;

    // Mock campaign creation
    if (method === 'POST' && path.includes('/campaigns')) {
      return {
        id: `meta_campaign_${Date.now()}`,
      } as T;
    }

    // Mock campaign update (pause/resume/budget)
    if (method === 'POST' && path.match(/^\/[a-zA-Z0-9_-]+$/)) {
      return { success: true } as T;
    }

    // Mock campaign read
    if (method === 'GET') {
      return {
        id: path.replace(/^\//, ''),
        status: body?.status || 'ACTIVE',
        name: body?.name || 'Mock Campaign',
      } as T;
    }
  }

  const url = new URL(`${META_GRAPH_BASE}${path}`);
  url.searchParams.set('access_token', accessToken);

  const fetchOptions: RequestInit = {
    method: options?.method || 'GET',
    headers: { Accept: 'application/json' },
  };

  if (options?.body) {
    fetchOptions.headers = { ...fetchOptions.headers, 'Content-Type': 'application/json' };
    fetchOptions.body = JSON.stringify(options.body);
  }

  const res = await fetch(url.toString(), fetchOptions);
  const json = (await res.json()) as unknown;

  const maybeErr = json as MetaApiErrorPayload;
  if (!res.ok || maybeErr?.error) {
    const code = maybeErr?.error?.code;
    const message = maybeErr?.error?.message || (typeof json === 'object' ? JSON.stringify(json) : String(json));
    const err = new Error(`[Meta API] ${code ?? res.status}: ${message}`);
    (err as MetaApiError).metaCode = code;
    throw err;
  }

  return json as T;
}

export type MetaCampaignResponse = {
  id: string;
  name?: string;
  status?: string;
  daily_budget?: number;
  objective?: string;
};

export type MetaCampaignCreateResponse = {
  id: string;
};
