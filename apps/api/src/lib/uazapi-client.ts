/**
 * Cliente da API uazapi (WhatsApp).
 *
 * Adapter isolado (ADR-0001): serviços consomem esta porta, nunca fetch direto.
 * Credenciais por env — UAZAPI_BASE_URL (server) e UAZAPI_INSTANCE_TOKEN
 * (token da instância, header `token`). Timeout e erros normalizados em
 * UazapiError (com status HTTP) para a camada de serviço mapear.
 */

const HTTP_TIMEOUT_MS = 15_000;

export class UazapiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

export interface UazapiConfig {
  baseUrl: string;
  instanceToken: string;
}

export function getUazapiConfig(): UazapiConfig {
  const baseUrl = process.env.UAZAPI_BASE_URL;
  const instanceToken = process.env.UAZAPI_INSTANCE_TOKEN;
  if (!baseUrl) {
    throw new UazapiError(500, 'MISSING_CONFIG', 'UAZAPI_BASE_URL não configurado.');
  }
  if (!instanceToken) {
    throw new UazapiError(500, 'MISSING_CONFIG', 'UAZAPI_INSTANCE_TOKEN não configurado.');
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ''), instanceToken };
}

interface ChatCheckResult {
  query?: string;
  jid?: string;
  isInWhatsapp?: boolean;
  error?: string;
}

export class UazapiClient {
  private readonly config?: UazapiConfig;

  /** Config injetada p/ testes; default resolve env LAZY (por request) —
   *  instanciar sem env não derruba o startup da API. */
  constructor(config?: UazapiConfig) {
    this.config = config;
  }

  private resolveConfig(): UazapiConfig {
    if (this.config) return this.config;
    return getUazapiConfig();
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const { baseUrl, instanceToken } = this.resolveConfig();
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: instanceToken,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
    } catch {
      throw new UazapiError(502, 'UAZAPI_NETWORK_ERROR', 'Falha de rede ao chamar a uazapi.');
    }

    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      throw new UazapiError(
        response.status,
        'UAZAPI_REQUEST_FAILED',
        payload?.error || `uazapi respondeu ${response.status} para ${path}.`,
      );
    }
    return payload;
  }

  /** Verifica se o número (DDI+dígitos, ex.: 5511999999999) existe no WhatsApp. */
  async checkNumber(phone: string): Promise<boolean> {
    const results = await this.request<ChatCheckResult[]>('/chat/check', { numbers: [phone] });
    return Array.isArray(results) && results.length > 0 && results[0].isInWhatsapp === true;
  }

  /** Envia mensagem de texto para o número (DDI+dígitos). */
  async sendText(phone: string, text: string): Promise<void> {
    await this.request('/send/text', { number: phone, text });
  }
}
