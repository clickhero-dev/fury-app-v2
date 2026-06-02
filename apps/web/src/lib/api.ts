import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

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

const AUTH_LOGOUT_PATHS = ['/auth/me', '/auth/refresh'];

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (error && typeof error === 'object' && 'response' in error) {
      const err = error as { response?: { status?: number }; config?: { url?: string } };
      const isAuthPath = AUTH_LOGOUT_PATHS.some((p) => err.config?.url?.includes(p));
      if (err.response?.status === 401 && isAuthPath) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
