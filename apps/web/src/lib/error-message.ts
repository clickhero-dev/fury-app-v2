import { isAxiosError } from 'axios';

// rotas antigas mandam a mensagem na raiz (message), às vezes com error = código em texto
type ApiErrorBody = { error?: { code?: string; message?: unknown } | string; message?: unknown };

const MAX_BLOB_BYTES = 64 * 1024;

const NETWORK = 'Sem conexão com o servidor. Verifique sua internet e tente de novo.';
const SERVER = 'Erro no servidor. Tente de novo; se continuar, fale com o suporte.';
const UNKNOWN = 'Não conseguimos identificar o motivo. Tente de novo; se continuar, fale com o suporte.';
const FORBIDDEN = 'Você não tem permissão para esta ação.';
const EXPIRED = 'Sua sessão expirou. Entre novamente.';

const withPeriod = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

// motivo do erro em português, para o usuário saber o que fazer
export function errorReason(err: unknown): string {
  if (!isAxiosError<ApiErrorBody>(err)) return UNKNOWN;
  if (!err.response) return NETWORK;
  const { status } = err.response;
  const data = err.response.data;
  const nested = data?.error && typeof data.error === 'object' ? data.error.message : undefined;
  const raw = nested ?? data?.message;
  const message = typeof raw === 'string' && raw.trim() ? raw : undefined;
  // 5xx pode ter texto técnico; só o 503 traz motivo escrito para o usuário
  if (status >= 500 && !(status === 503 && message)) return SERVER;
  if (message) return withPeriod(message);
  if (status === 401) return EXPIRED;
  if (status === 403) return FORBIDDEN;
  return UNKNOWN;
}

// download (responseType blob): o JSON do erro vem dentro do Blob
export async function readBlobError(err: unknown): Promise<unknown> {
  if (!isAxiosError(err) || !(err.response?.data instanceof Blob)) return err;
  // só JSON pequeno; outro conteúdo não tem motivo legível
  const blob = err.response.data;
  if (blob.size > MAX_BLOB_BYTES || (blob.type && !blob.type.includes('json'))) {
    err.response.data = {};
    return err;
  }
  try {
    err.response.data = JSON.parse(await err.response.data.text());
  } catch {
    err.response.data = {};
  }
  return err;
}

// "Não foi possível criar o usuário. Email já cadastrado."
export function errorMessage(err: unknown, action: string): string {
  return `${withPeriod(action)} ${errorReason(err)}`;
}
