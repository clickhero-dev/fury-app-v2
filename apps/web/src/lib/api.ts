import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { queryClient } from './query-client';

const BASE_URL = 'https://clickhero-fury-api.u7pe19.easypanel.host/api';

console.log(BASE_URL);

/**
 * Instância principal do cliente HTTP da aplicação.
 * Configurada com a URL base da API definida em `VITE_API_URL`.
 * Todos os hooks e serviços do frontend devem usar este cliente.
 */
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
});

/**
 * Interceptor de requisição.
 * Injeta automaticamente o token JWT no header `Authorization`
 * de todas as requisições, se o token estiver salvo no localStorage.
 */
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/** Controla se já existe um refresh de token em andamento. */
let isRefreshing = false;

/**
 * Fila de callbacks aguardando o novo token.
 * Requisições que chegam enquanto o refresh está em andamento
 * são enfileiradas aqui e resolvidas assim que o novo token estiver disponível.
 */
let refreshQueue: ((token: string) => void)[] = [];

/**
 * Resolve todas as requisições enfileiradas com o novo token de acesso.
 * Chamada após o refresh ser concluído com sucesso.
 *
 * @param newToken - Novo token de acesso obtido após o refresh
 */
function processQueue(newToken: string) {
  refreshQueue.forEach((resolve) => resolve(newToken));
  refreshQueue = [];
}

/**
 * Força o logout do usuário limpando todos os dados de sessão
 * e redirecionando para a página de login.
 * Chamada quando o refresh token expira ou é inválido.
 */
function forceLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  queryClient.clear();
  window.location.href = '/login';
}

/**
 * Interceptor de resposta com lógica de refresh automático de token.
 *
 * Comportamento:
 * - Respostas bem-sucedidas passam direto sem modificação.
 * - Em caso de erro 401 com código `TOKEN_EXPIRED`:
 *   1. Tenta renovar o token via `POST /auth/refresh`.
 *   2. Se o refresh estiver em andamento, enfileira a requisição original.
 *   3. Após o refresh, reprocessa a fila com o novo token.
 *   4. Se o refresh falhar, força logout.
 * - Em caso de 401 em rotas de auth (`/auth/me`, `/auth/refresh`), força logout.
 */
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!error || typeof error !== 'object' || !('response' in error)) {
      return Promise.reject(error);
    }

    const err = error as {
      response?: { status?: number; data?: { error?: { code?: string } } };
      config?: InternalAxiosRequestConfig & { _retry?: boolean };
    };

    const status = err.response?.status;
    const code = err.response?.data?.error?.code;
    const originalConfig = err.config;

    // Tenta refresh apenas em 401 TOKEN_EXPIRED e apenas uma vez por requisição
    if (status === 401 && code === 'TOKEN_EXPIRED' && originalConfig && !originalConfig._retry) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        forceLogout();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Enfileira a requisição até o refresh ser concluído
        return new Promise((resolve, reject) => {
          refreshQueue.push((newToken: string) => {
            if (originalConfig.headers) {
              originalConfig.headers.Authorization = `Bearer ${newToken}`;
            }
            resolve(api(originalConfig));
          });
          // Rejeita após 30 segundos se o refresh não completar
          setTimeout(() => reject(error), 30_000);
        });
      }

      originalConfig._retry = true;
      isRefreshing = true;

      try {
        const res = await axios.post<{
          data: { tokens: { accessToken: string; refreshToken: string } };
        }>(`${BASE_URL}/auth/refresh`, { refreshToken });

        const { accessToken, refreshToken: newRefreshToken } = res.data.data.tokens;
        localStorage.setItem('token', accessToken);
        localStorage.setItem('refreshToken', newRefreshToken);

        processQueue(accessToken);

        if (originalConfig.headers) {
          originalConfig.headers.Authorization = `Bearer ${accessToken}`;
        }
        return api(originalConfig);
      } catch {
        refreshQueue = [];
        forceLogout();
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // Para qualquer outro 401 em rotas de autenticação, força logout
    const isAuthPath = ['/auth/me', '/auth/refresh'].some((p) =>
      (originalConfig?.url ?? '').includes(p)
    );
    if (status === 401 && isAuthPath) {
      forceLogout();
    }

    return Promise.reject(error);
  }
);

export default api;