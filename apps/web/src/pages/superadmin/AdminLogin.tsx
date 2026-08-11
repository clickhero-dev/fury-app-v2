import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { isAxiosError } from 'axios';
import api from '@/lib/api';
import { useFavicon } from '@/hooks/useFavicon';

function AdyLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="#0C0D0A" />
      <path d="M9 24 L16 10 L23 24" stroke="#1E88A8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M11.8 19.5 H20.2" stroke="#1E88A8" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="8" r="1.6" fill="#CF6F03" />
    </svg>
  );
}

export function AdminLogin() {
  useFavicon('/faviconadmin.svg', 'Ady');

  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusEmail, setFocusEmail] = useState(false);
  const [focusPassword, setFocusPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { token, refreshToken, user } = res.data.data;
      if (user.role !== 'superadmin') {
        setError('Acesso restrito a superadmins');
        return;
      }
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
    <div style={{
      minHeight: '100vh',
      background: `
        radial-gradient(ellipse 60% 60% at   0%   0%, rgba(30,136,168,0.13) 0%, transparent 55%),
        radial-gradient(ellipse 60% 60% at 100%   0%, rgba(30,136,168,0.11) 0%, transparent 55%),
        radial-gradient(ellipse 60% 60% at   0% 100%, rgba(30,136,168,0.11) 0%, transparent 55%),
        radial-gradient(ellipse 60% 60% at 100% 100%, rgba(30,136,168,0.13) 0%, transparent 55%),
        #0C0D0A
      `,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '0 16px',
    }}>
      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          padding: '48px 44px 44px',
          background: 'rgba(22,23,20,0.97)',
          borderRadius: 20,
          border: '1px solid #252721',
          backdropFilter: 'blur(12px)',
          transition: 'border-color 0.4s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#1E88A8')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#252721')}
      >
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16,
            background: '#0C0D0A',
            border: '1px solid #2A2D27',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AdyLogo size={40} />
          </div>
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#ECEDEF', margin: '0 0 6px', letterSpacing: '-0.4px' }}>
          Acesso restrito
        </h1>
        <p style={{ fontSize: 13, color: '#4A4F4B', margin: '0 0 28px', lineHeight: 1.5 }}>
          Painel exclusivo para administradores do sistema.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Email */}
          <div>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 600,
              color: focusEmail ? '#1E88A8' : '#4A4F4B',
              textTransform: 'uppercase', letterSpacing: '0.1em',
              marginBottom: 7, transition: 'color 0.15s',
            }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusEmail(true)}
              onBlur={() => setFocusEmail(false)}
              required
              placeholder="admin@ady.com.br"
              autoComplete="email"
              style={{
                width: '100%', padding: '11px 14px',
                background: '#0C0D0A',
                border: `1px solid ${focusEmail ? '#1E88A8' : '#252721'}`,
                borderRadius: 10, color: '#ECEDEF',
                fontSize: 13.5, outline: 'none',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s',
                boxShadow: focusEmail ? '0 0 0 3px rgba(30,136,168,0.1)' : 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Senha */}
          <div>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 600,
              color: focusPassword ? '#1E88A8' : '#4A4F4B',
              textTransform: 'uppercase', letterSpacing: '0.1em',
              marginBottom: 7, transition: 'color 0.15s',
            }}>Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusPassword(true)}
              onBlur={() => setFocusPassword(false)}
              required
              placeholder="••••••••"
              autoComplete="current-password"
              style={{
                width: '100%', padding: '11px 14px',
                background: '#0C0D0A',
                border: `1px solid ${focusPassword ? '#1E88A8' : '#252721'}`,
                borderRadius: 10, color: '#ECEDEF',
                fontSize: 13.5, outline: 'none',
                fontFamily: 'inherit',
                transition: 'border-color 0.15s',
                boxShadow: focusPassword ? '0 0 0 3px rgba(30,136,168,0.1)' : 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Erro */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px', borderRadius: 8,
              background: 'rgba(192,57,43,0.1)', border: '1px solid rgba(192,57,43,0.25)',
              fontSize: 12.5, color: '#E05A4A',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              width: '100%', padding: '12px',
              background: loading ? '#152932' : '#1E88A8',
              border: 'none', borderRadius: 10,
              color: loading ? '#4A7A8A' : '#ECEDEF',
              fontSize: 13.5, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.01em',
              transition: 'background 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
            onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#2299BC' }}
            onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = '#1E88A8' }}
          >
            {loading ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Verificando…</> : 'Entrar no painel'}
          </button>
        </form>

        {/* Footer */}
        <div style={{
          marginTop: 28, paddingTop: 20,
          borderTop: '1px solid #1A1C18',
          fontSize: 11.5, color: '#2E3230', textAlign: 'center',
        }}>
          Acesso monitorado · Somente pessoal autorizado
        </div>
      </div>

      {/* Voltar ao login normal */}
      <div style={{ marginTop: 20 }}>
        <a
          href="/login"
          style={{
            fontSize: 12.5, color: '#3A3E38',
            textDecoration: 'none',
            transition: 'color 0.15s',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#7E8480')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#3A3E38')}
        >
          Voltar ao login normal
        </a>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}