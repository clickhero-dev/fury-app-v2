import axios from 'axios';
import { queryClient } from './query-client';
import { store } from '../store';
import { logout, setTokens } from '../store/slices/authSlice';

export const SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const REFRESH_LOCK_NAME = 'fury-session-refresh';
const REFRESH_LEASE_KEY = `${REFRESH_LOCK_NAME}:lease`;
const REFRESH_LEASE_MS = 30_000;
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api';
const tabId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

type RefreshResponse = {
  data: { tokens: { accessToken: string; refreshToken: string } };
};

let refreshPromise: Promise<string> | null = null;
let refreshInterval: ReturnType<typeof setInterval> | null = null;
let channel: BroadcastChannel | null = null;
let storageListener: ((event: StorageEvent) => void) | null = null;

function hasSession(): boolean {
  const { token, refreshToken } = store.getState().auth;
  return Boolean(token && refreshToken && localStorage.getItem('refreshToken'));
}

function persistTokens(tokens: { accessToken: string; refreshToken: string }) {
  localStorage.setItem('token', tokens.accessToken);
  localStorage.setItem('refreshToken', tokens.refreshToken);
  store.dispatch(setTokens({ token: tokens.accessToken, refreshToken: tokens.refreshToken }));
}

function forceLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  queryClient.clear();
  store.dispatch(logout());
}

/** Renova os tokens uma única vez por aba e persiste a rotação. */
export async function refreshSession(): Promise<string> {
  if (refreshPromise) return refreshPromise;

  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    forceLogout();
    throw new Error('Missing refresh token');
  }

  refreshPromise = axios
    .post<RefreshResponse>(`${API_BASE_URL}/auth/refresh`, { refreshToken })
    .then((response) => {
      const tokens = response.data.data.tokens;
      if (!tokens?.accessToken || !tokens?.refreshToken) {
        throw new Error('Invalid refresh response');
      }
      persistTokens(tokens);
      channel?.postMessage({ type: 'tokens-refreshed', tokens });
      return tokens.accessToken;
    })
    .catch((error) => {
      forceLogout();
      throw error;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

async function refreshWithCrossTabLock() {
  if (!hasSession()) return;

  try {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      await navigator.locks.request(REFRESH_LOCK_NAME, { ifAvailable: true }, async (lock) => {
        if (lock) await refreshSession();
      });
      return;
    }

    // Fallback para navegadores sem Web Locks. A lease no localStorage limita
    // a rotação a uma aba e o BroadcastChannel/storage propaga os tokens.
    const currentLease = JSON.parse(localStorage.getItem(REFRESH_LEASE_KEY) ?? 'null') as
      | { owner: string; expiresAt: number }
      | null;
    if (currentLease && currentLease.expiresAt > Date.now() && currentLease.owner !== tabId) return;

    localStorage.setItem(REFRESH_LEASE_KEY, JSON.stringify({ owner: tabId, expiresAt: Date.now() + REFRESH_LEASE_MS }));
    const confirmedLease = JSON.parse(localStorage.getItem(REFRESH_LEASE_KEY) ?? 'null') as { owner?: string } | null;
    if (confirmedLease?.owner !== tabId) return;

    try {
      await refreshSession();
    } finally {
      const lease = JSON.parse(localStorage.getItem(REFRESH_LEASE_KEY) ?? 'null') as { owner?: string } | null;
      if (lease?.owner === tabId) localStorage.removeItem(REFRESH_LEASE_KEY);
    }
  } catch {
    // refreshSession já removeu a sessão local; um timer não deve virar uma
    // rejeição não tratada no navegador.
  }
}

function synchronizeTokensFromStorage() {
  const accessToken = localStorage.getItem('token');
  const refreshToken = localStorage.getItem('refreshToken');
  if (accessToken && refreshToken) {
    store.dispatch(setTokens({ token: accessToken, refreshToken }));
  }
}

/** Inicia o ciclo de renovação e a sincronização de sessão entre abas. */
export function startSessionRefresh() {
  if (refreshInterval || typeof window === 'undefined') return;

  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(REFRESH_LOCK_NAME);
    channel.onmessage = (event: MessageEvent) => {
      if (event.data?.type === 'tokens-refreshed') persistTokens(event.data.tokens);
    };
  }

  storageListener = (event) => {
    if (event.key === 'token' || event.key === 'refreshToken') synchronizeTokensFromStorage();
  };
  window.addEventListener('storage', storageListener);
  refreshInterval = window.setInterval(() => void refreshWithCrossTabLock(), SESSION_REFRESH_INTERVAL_MS);
}

/** Para o agendador; usado no teardown de testes e não deve deixar timers órfãos. */
export function stopSessionRefresh() {
  if (refreshInterval) window.clearInterval(refreshInterval);
  refreshInterval = null;
  if (storageListener) window.removeEventListener('storage', storageListener);
  storageListener = null;
  channel?.close();
  channel = null;
}
