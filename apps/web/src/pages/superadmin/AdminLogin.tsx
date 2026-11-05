import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import { clearSession } from '@/lib/clear-session';
import { canAccessAdmin, platformRoleOf } from '@/lib/platform-role';
import { useFavicon } from '@/hooks/useFavicon';
import { AdySymbol } from '@/components/AdySymbol';

// mesmo visual do login do cliente (LoginPage)
const inputClass =
  'w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-[#12130F] px-4 py-3 text-sm text-slate-900 dark:text-white outline-none transition-all duration-200 placeholder:text-slate-400 dark:placeholder:text-zinc-500 hover:border-[#1E88A8] hover:ring-2 hover:ring-[#1E88A8]/20 hover:bg-white dark:hover:bg-[#12130F] focus:border-[#1E88A8] focus:bg-white dark:focus:bg-[#12130F] focus:ring-2 focus:ring-[#1E88A8]/20';

export function AdminLogin() {
  useFavicon('/faviconadmin.svg', 'Ady');

  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, refreshToken, user } = res.data.data;
      if (!canAccessAdmin(platformRoleOf(user))) {
        setError('Acesso restrito a administradores');
        return;
      }
      // nada da conta anterior fica no navegador
      clearSession();
      localStorage.setItem('token', token);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      navigate('/admin/users');
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 401) {
        setError('Email ou senha incorretos');
      } else {
        setError('Erro ao conectar ao servidor');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#f3f6f8] dark:bg-[#0c0d0a] px-5 py-16 text-slate-900 dark:text-white transition-colors duration-300 overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08] dark:opacity-[0.05]"
        style={{ backgroundImage: 'radial-gradient(#1E88A8 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(circle at 50% -10%, rgba(30, 136, 168, 0.22) 0%, transparent 60%)' }}
      />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Cabeçalho */}
        <div className="flex flex-col items-center text-center">
          <div className="p-2">
            <AdySymbol size={52} />
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Acesso restrito</h1>
          <p className="!mt-1.5 text-sm font-medium text-slate-500 dark:text-zinc-400">Painel exclusivo para administradores do sistema.</p>
        </div>

        {/* Card do formulário */}
        <form
          onSubmit={handleSubmit}
          className="mt-8 space-y-5 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#181915] p-7 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.08)] dark:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all"
        >
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-zinc-300">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@ady.com.br"
              autoComplete="email"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700 dark:text-zinc-300">Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              className={inputClass}
            />
          </label>

          {error && (
            <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-center text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#17708A] py-3 text-sm font-semibold text-white shadow-md shadow-[#17708A]/20 transition-all duration-200 [&:hover:not(:disabled)]:!bg-[#145E74] [&:hover:not(:disabled)]:shadow-lg [&:hover:not(:disabled)]:-translate-y-0.5 active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? <><Loader2 className="size-4 animate-spin" /> Verificando…</> : 'Entrar no painel'}
          </button>

          <p className="border-t border-slate-200 dark:border-white/10 pt-5 text-center text-xs text-slate-500 dark:text-zinc-500">
            Acesso monitorado · Somente pessoal autorizado
          </p>
        </form>

        <p className="mt-5 text-center text-xs text-slate-500 dark:text-zinc-500">
          <a href="/login" className="underline underline-offset-2 hover:text-[#17708A] dark:hover:text-[#1E88A8] transition-colors">
            Voltar ao login normal
          </a>
        </p>
      </div>
    </div>
  );
}
