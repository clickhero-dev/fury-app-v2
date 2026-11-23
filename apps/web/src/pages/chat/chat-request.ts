import { refreshSession } from '../../lib/session-refresh';
import { approvalFailureFromResponse, type ApprovalFailure } from './approval-outcomes';

const base = `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/chat`;

export class ChatRequestError extends Error {
  constructor(public readonly status: number, public readonly approvalFailure: ApprovalFailure | null = null, public readonly code: string | null = null) {
    super('Não foi possível concluir a solicitação. Tente novamente.');
    this.name = 'ChatRequestError';
  }
}

/** Auth stays in headers. Let the browser supply multipart boundaries. */
export async function chatRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string) => {
    if (init.signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    return fetch(`${base}${path}`, {...init, headers: {
      ...(init.body instanceof FormData ? {} : {'Content-Type':'application/json'}),
      Authorization:`Bearer ${token}`, ...init.headers,
    }});
  };
  let response = await send(localStorage.getItem('token') || '');
  if (response.status === 401) {
    let code: string | undefined;
    try { code = (await response.clone().json()).error?.code; } catch { /* Resposta sem código de expiração. */ }
    if (code === 'TOKEN_EXPIRED') response = await send(await refreshSession());
  }
  if (!response.ok) {
    const body: unknown = response.status === 403 || response.status === 409 ? await response.json().catch(() => null) : null;
    const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string' ? body.code : null;
    throw new ChatRequestError(response.status, approvalFailureFromResponse(response.status, body), code);
  }
  return response;
}

/** Only client-safe fixed copy; never expose provider responses or credentials. */
export function mediaError(error: unknown, action: 'upload' | 'transcribe' | 'preview' | 'remove'): string {
  const status = (error as {status?: number})?.status;
  if (status === 401) return 'Sua sessão expirou. Entre novamente para continuar.';
  if (status === 403 || status === 404) return 'Este arquivo ou conversa não está disponível para você.';
  if (status === 413) return 'O arquivo ultrapassa o limite permitido.';
  if (status === 400 || status === 415 || status === 422) return action === 'transcribe'
    ? 'Não foi possível reconhecer este áudio. Grave novamente.'
    : 'Arquivo inválido. Confira formato, tamanho e limites de páginas ou duração.';
  if (status === 429) return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  if (action === 'transcribe') return 'Não foi possível transcrever. Seu rascunho foi mantido; tente novamente.';
  if (action === 'preview') return 'Não foi possível abrir o arquivo. Tente novamente.';
  if (action === 'remove') return 'Não foi possível remover o arquivo. Tente novamente.';
  return 'Não foi possível enviar o arquivo. Seu rascunho foi mantido; tente novamente.';
}
