import api from '@/lib/api';
import { store } from '@/store';
import { login as authLogin } from '@/store/slices/authSlice';

export interface SocialSession {
  token: string;
  refreshToken: string;
  user: { id: string; email: string; name: string | null; role: string | null; tenantId: string };
  isNewUser: boolean;
}

/** Persiste a sessão social (localStorage + Redux) — mesmo formato do login com senha. */
export function applySocialSession(data: SocialSession): void {
  localStorage.setItem('token', data.token);
  localStorage.setItem('refreshToken', data.refreshToken);
  localStorage.setItem('user', JSON.stringify(data.user));
  store.dispatch(
    authLogin({
      token: data.token,
      refreshToken: data.refreshToken,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role ?? null,
      tenantId: data.user.tenantId,
    }),
  );
}

/**
 * Troca `?fb_handoff=<id>` pela sessão via `POST /auth/social/handoff`.
 * O token nunca trafega na URL — só o id opaco de uso único.
 * Retorna a sessão aplicada, ou null se não havia handoff na URL.
 */
export async function consumeFacebookHandoff(search: string): Promise<SocialSession | null> {
  const id = new URLSearchParams(search).get('fb_handoff');
  if (!id) return null;
  const { data } = await api.post<{ success: boolean; data: SocialSession }>('/auth/social/handoff', { id });
  applySocialSession(data.data);
  return data.data;
}

/** Mapeia `?error=` do callback social para uma mensagem amigável (ou null). */
export function readSocialError(search: string): string | null {
  const code = new URLSearchParams(search).get('error');
  if (!code) return null;
  if (code === 'oauth_cancelled') return 'Login social cancelado.';
  return 'Não foi possível concluir o login social. Tente novamente.';
}

/** Remove da URL os params de retorno social, sem recarregar a página. */
export function stripSocialParams(): void {
  const url = new URL(window.location.href);
  ['fb_handoff', 'social_login', 'error'].forEach((p) => url.searchParams.delete(p));
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}
