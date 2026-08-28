import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { AdySymbol } from '@/components/AdySymbol';
import { Loader2 } from 'lucide-react';

export function MetaAuthorizePage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'subscription_expired' | 'trial_expired' | 'server_error' | 'other' | null>(null);

  useEffect(() => {
    api
      .get<{ success: boolean; data: { authUrl: string } }>('/meta/auth/url', {
        params: { context: 'onboarding' },
      })
      .then((res) => {
        const authUrl = res.data.data.authUrl;
        console.log('[MetaAuthorizePage] redirecting to Meta OAuth:', authUrl.substring(0, 60) + '...');
        window.location.href = authUrl;
      })
      .catch((err) => {
        const status = err?.response?.status;
        const code = err?.response?.data?.error?.code;

        console.error('[MetaAuthorizePage] failed to get auth URL:', err);

        if (status === 403 && code === 'SUBSCRIPTION_EXPIRED') {
          setError('Sua assinatura expirou. Renove seu plano para continuar.');
          setErrorType('subscription_expired');
        } else if (status === 403 && code === 'TRIAL_EXPIRED') {
          setError('Seu período de teste expirou. Entre em contato com o suporte.');
          setErrorType('trial_expired');
        } else if (status === 500) {
          setError('Erro no servidor. Tente novamente em alguns momentos.');
          setErrorType('server_error');
        } else {
          setError('Não foi possível conectar com Meta. Tente novamente.');
          setErrorType('other');
        }
      });
  }, []);

  if (error) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-admin-bg px-5 py-16 text-admin-text">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(150%_120%_at_50%_-10%,rgba(23,112,138,0.07),transparent_100%)] dark:bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(30,136,168,0.16),transparent_70%)]"
        />

        <div className="relative w-full max-w-[400px]">
          <div className="flex flex-col items-center text-center">
            <AdySymbol size={52} />
            <h1 className="mt-5 text-4xl font-medium text-admin-text">ady</h1>
            <p className="!mt-6 text-sm text-admin-text-muted">Seu gestor de tráfego com IA</p>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-admin-surface p-7 text-center shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] space-y-4">
            <p className="text-sm font-medium text-admin-danger">{error}</p>
            <div className="flex flex-col gap-3 pt-2">
              {errorType === 'subscription_expired' && (
                <button
                  type="button"
                  onClick={() => navigate('/billing')}
                  className="text-sm font-semibold text-admin-bg bg-admin-petrol hover:opacity-90 px-4 py-2.5 rounded-lg transition-opacity"
                >
                  Renovar Plano
                </button>
              )}
              <button
                type="button"
                onClick={() => navigate('/dashboard')}
                className="text-sm font-medium text-admin-petrol hover:underline"
              >
                Voltar
              </button>
            </div>
          </div>

          <p className="!mt-10 text-center text-xs text-admin-text-faint">
            ady é um produto <span className="text-[#CF6F03]">Click Hero</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-admin-bg px-5 py-16 text-admin-text">
      {/* Fundo Iluminado */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(150%_120%_at_50%_-10%,rgba(23,112,138,0.07),transparent_100%)] dark:bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(30,136,168,0.16),transparent_70%)]"
      />

      <div className="relative w-full max-w-[400px]">
        {/* Cabeçalho */}
        <div className="flex flex-col items-center text-center">
          <AdySymbol size={52} />
          <h1 className="mt-5 text-4xl font-medium text-admin-text">ady</h1>
          <p className="!mt-6 text-sm text-admin-text-muted">Seu gestor de tráfego com IA</p>
        </div>

        {/* Card de Redirecionamento */}
        <div className="mt-10 rounded-2xl border border-white/10 bg-admin-surface p-8 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.7)] text-center space-y-6">
          <div className="flex justify-center">
            <div className="flex items-center justify-center size-16 rounded-2xl bg-[#1877F2]/10 border border-[#1877F2]/20">
              <svg viewBox="0 0 24 24" fill="#1877F2" className="size-8">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-admin-text">Conectando ao Meta</h2>
            <div className="flex items-center justify-center gap-2 pt-2 text-admin-petrol">
              <Loader2 className="size-4 animate-spin" />
              <p className="text-sm font-medium">Redirecionando para o Meta...</p>
            </div>
            <p className="text-xs text-admin-text-faint pt-1">
              Você será redirecionado em instantes
            </p>
          </div>
        </div>

        {/* Rodapé */}
        <p className="!mt-10 text-center text-xs text-admin-text-faint">
          ady é um produto <span className="text-[#CF6F03]">Click Hero</span>
        </p>
      </div>
    </div>
  );
}