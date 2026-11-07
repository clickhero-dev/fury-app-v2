import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { store } from '@/store';
import { login as authLogin } from '@/store/slices/authSlice';

/** The email scanner only opens this page; consuming the one-time token requires a click. */
export function TrialAccessPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const tokenProcessed = useRef(false);

  useEffect(() => {
    if (tokenProcessed.current) return;
    tokenProcessed.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    // Never leave the credential in history/referrer after reading it.
    window.history.replaceState(null, '', window.location.pathname);
    setToken(value && /^[a-f0-9]{64}$/i.test(value) ? value : null);
  }, []);

  const enter = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await api.post('/public/trial/access', { token });
      const session = response.data.data;
      localStorage.setItem('token', session.token);
      localStorage.setItem('refreshToken', session.refreshToken);
      localStorage.setItem('user', JSON.stringify(session.user));
      store.dispatch(authLogin({ token: session.token, refreshToken: session.refreshToken, name: session.user.name ?? null, email: session.user.email, role: session.user.role ?? null, tenantId: session.user.tenantId, policy: null }));
      navigate('/estudio', { replace: true });
    } catch {
      setError('Este link é inválido, já foi usado ou expirou. Solicite um novo acesso.');
    } finally { setLoading(false); }
  };

  return <main className="min-h-screen grid place-items-center bg-slate-950 px-6 text-white"><section className="max-w-md text-center space-y-5"><h1 className="text-3xl font-bold">Acesse seu teste</h1>{error ? <p role="alert">{error}</p> : <p>Confirme para entrar no Estúdio.</p>}<button type="button" disabled={!token || loading} onClick={enter} className="rounded bg-orange-600 px-5 py-3 font-semibold disabled:opacity-50">{loading ? 'Entrando…' : 'Entrar no Ady'}</button></section></main>;
}
