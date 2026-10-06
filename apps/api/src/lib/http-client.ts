/** Cliente HTTP mínimo para provedores externos, sempre com timeout. */
export const EXTERNAL_HTTP_TIMEOUT_MS = 15_000;

export class ExternalHttpError extends Error {
  constructor(public readonly code: 'NETWORK_ERROR' | 'TIMEOUT', message: string) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
  }
}

export async function externalFetch(input: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(EXTERNAL_HTTP_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ExternalHttpError('TIMEOUT', 'Tempo limite excedido ao chamar provedor externo.');
    }
    throw new ExternalHttpError('NETWORK_ERROR', 'Falha de rede ao chamar provedor externo.');
  }
}
