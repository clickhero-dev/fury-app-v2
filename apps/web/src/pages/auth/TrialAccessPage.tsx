import { useLayoutEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { store } from '@/store';
import { login as authLogin } from '@/store/slices/authSlice';
export function TrialAccessPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token');
    return value && /^[a-f0-9]{64}$/i.test(value) ? value : null;
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useLayoutEffect(() => { window.history.replaceState(null, '', window.location.pathname); }, []);
  async function enter() {
    const submittedToken = token;
    if (!submittedToken || loading) return;
    setToken(null);
    setLoading(true); setError('');
    try {
      const { data } = await api.post('/public/trial/access', { token: submittedToken });
      const session = data.data;
      localStorage.setItem('token', session.token);
      localStorage.setItem('refreshToken', session.refreshToken);
      localStorage.setItem('user', JSON.stringify(session.user));
      store.dispatch(authLogin({ token: session.token, refreshToken: session.refreshToken, name: session.user.name ?? null, email: session.user.email, role: session.user.role ?? null, tenantId: session.user.tenantId, policy: null }));
      navigate('/estudio', { replace: true });
    } catch { setError('Este link é inválido, já foi usado ou expirou. Solicite um novo acesso.'); }
    finally { setLoading(false); }
  }
  return <main className="mx-auto max-w-md p-8"><h1>Acesse seu Trial</h1><p>Confirme para entrar na sua conta.</p>{(!token || error) && <><p role="alert">{error || 'Este link está ausente ou inválido. Solicite um novo acesso.'}</p><Link to="/trial/solicitar">Solicitar novo acesso</Link></>}<button disabled={!token || loading} onClick={enter}>{loading ? 'Entrando…' : 'Entrar no Ady'}</button></main>;
}
