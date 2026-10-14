import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { queryClient } from './query-client';
import { refreshSession } from './session-refresh';
import { captureException } from './posthog';

const BASE_URL = import.meta.env.VITE_API_URL;

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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

    // Error tracking: reporta falhas de API (exceto 401 de refresh que já é fluxo normal)
    const isAuthRefresh = (originalConfig?.url ?? '').includes('/auth/refresh');
    if (!(status === 401 && (code === 'TOKEN_EXPIRED' || isAuthRefresh))) {
      captureException(err, {
        method: originalConfig?.method,
        url: originalConfig?.url,
        status,
        code,
      });
    }

    // Tenta refresh apenas em 401 TOKEN_EXPIRED e apenas uma vez por requisição
    if (status === 401 && code === 'TOKEN_EXPIRED' && originalConfig && !originalConfig._retry) {
      originalConfig._retry = true;
      try {
        const accessToken = await refreshSession();

        if (originalConfig.headers) {
          originalConfig.headers.Authorization = `Bearer ${accessToken}`;
        }
        return api(originalConfig);
      } catch {
        return Promise.reject(error);
      }
    }

    // Para qualquer outro 401 em rotas de autenticação, força logout
    const isAuthPath = ['/auth/me', '/auth/refresh'].some((p) =>
      (originalConfig?.url ?? '').includes(p)
    );
    if (status === 401 && isAuthPath) {
      // refreshSession já encerra a sessão quando a rotação falha. Para /me,
      // a ausência do token será tratada pelo shell autenticado.
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      queryClient.clear();
    }

    return Promise.reject(error);
  }
);

export default api;
