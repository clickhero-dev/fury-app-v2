import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAppDispatch } from '@/store/hooks';
import { login } from '@/store/slices/authSlice';

export function TrialAccessPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [state, setState] = useState<'ready' | 'loading' | 'error'>('ready');
  // O initializer roda antes do effect. Assim o segundo ciclo de effects do
  // StrictMode não relê uma hash que já foi removida do histórico.
  const [token] = useState(() => new URLSearchParams(window.location.hash.replace(/^#/, '?')).get('token') || '');
  const autoLoginStarted = useRef(false);

  useEffect(() => {
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  const enter = useCallback(async () => {
    setState('loading');
    try {
      const response = await api.post('/public/trial/access', { token });
      const result = response.data.data;
      localStorage.setItem('token', result.token);
      localStorage.setItem('refreshToken', result.refreshToken);
      localStorage.setItem('user', JSON.stringify(result.user));
      localStorage.setItem('fury-public-trial', 'true');
      if (result.user.mustChangePassword) localStorage.setItem('fury-trial-password-pending', 'true');
      dispatch(login({ token: result.token, refreshToken: result.refreshToken, name: result.user.name, email: result.user.email, role: result.user.role, tenantId: result.user.tenantId }));
      navigate('/inicio', { replace: true });
    } catch {
      setState('error');
    }
  }, [dispatch, navigate, token]);

  useEffect(() => {
    if (!token || autoLoginStarted.current) return;
    autoLoginStarted.current = true;
    void enter();
  }, [enter, token]);

  if (state === 'error' || !token) return <main className="flex min-h-screen items-center justify-center p-6"><section className="max-w-md text-center"><h1 className="text-2xl font-semibold">Link indisponível</h1><p className="mt-3">Este link é inválido, expirou ou já foi utilizado. Solicite um novo acesso.</p></section></main>;
  return <main className="flex min-h-screen items-center justify-center p-6"><section className="max-w-md text-center"><h1 className="text-2xl font-semibold">Entrar no Ady</h1><p className="mt-3">Preparando seu trial de criação de imagens.</p><button className="mt-6 rounded-xl bg-brand px-6 py-3 text-white" disabled={state === 'loading'} onClick={() => void enter()}>{state === 'loading' ? 'Entrando…' : 'Entrar'}</button></section></main>;
}
