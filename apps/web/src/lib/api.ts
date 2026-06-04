import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { queryClient } from './query-client';

const BASE_URL = import.meta.env.VITE_API_URL || 'https://fury-app-v2-production.up.railway.app/api';

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

let isRefreshing = false;
let refreshQueue: ((token: string) => void)[] = [];

function processQueue(newToken: string) {
  refreshQueue.forEach((resolve) => resolve(newToken));
  refreshQueue = [];
}

function forceLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  queryClient.clear();
  window.location.href = '/login';
}

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

    // Only attempt refresh on 401 TOKEN_EXPIRED, and only once per request
    if (status === 401 && code === 'TOKEN_EXPIRED' && originalConfig && !originalConfig._retry) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        forceLogout();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Queue this request until refresh completes
        return new Promise((resolve, reject) => {
          refreshQueue.push((newToken: string) => {
            if (originalConfig.headers) {
              originalConfig.headers.Authorization = `Bearer ${newToken}`;
            }
            resolve(api(originalConfig));
          });
          // Add rejection handler in case refresh fails
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

    // For any other 401 on auth endpoints, force logout
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
