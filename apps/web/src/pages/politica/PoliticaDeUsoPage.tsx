import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setPolicyAccepted, selectPolicy } from '../../store/slices/authSlice';
import { selectIsAuthenticated } from '../../store/slices/authSlice';
import api from '../../lib/api';
import { captureEvent } from '../../lib/posthog';

interface PolicyCurrentResponse {
  success: boolean;
  data: {
    currentVersion: string | null;
    currentVersionId: string | null;
    accepted: boolean;
    content: string | null;
  };
  timestamp: string;
}

interface PolicyAcceptResponse {
  success: boolean;
  data: {
    accepted: boolean;
    currentVersion: string | null;
  };
  timestamp: string;
}

/**
 * Página de aceite da Política de Uso.
 * Exibe o conteúdo da versão vigente; o checkbox "Li e concordo" habilita o botão.
 * Após o aceite: novo usuário (sem onboarding concluído) vai ao onboarding;
 * usuário antigo volta ao dashboard (history back segura o destino original).
 */
export function PoliticaDeUsoPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const authed = useAppSelector(selectIsAuthenticated);
  const storedPolicy = useAppSelector(selectPolicy);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Busca o conteúdo da versão vigente (o aceite por si só já veio no login —
  // esta chamada é necessária apenas quando o usuário precisa aceitar).
  const { data, isLoading, isError } = useQuery({
    queryKey: ['policy-current'],
    queryFn: async () => {
      const res = await api.get<PolicyCurrentResponse>('/policy/current');
      return res.data.data;
    },
    enabled: authed,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async (versionId: string) => {
      const res = await api.post<PolicyAcceptResponse>('/policy/accept', { versionId });
      return res.data.data;
    },
    onSuccess: (result) => {
      captureEvent('politica_aceita', { version: result.currentVersion });
      dispatch(setPolicyAccepted({ currentVersion: result.currentVersion, accepted: true }));
      void queryClient.invalidateQueries({ queryKey: ['policy-current'] });
      // Novo usuário → onboarding; antigo → destino original/dashboard.
      const hasMeta = localStorage.getItem('ady-meta-connected') === 'true';
      if (!hasMeta) {
        navigate('/onboarding/conectar-meta', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    },
    onError: () => {
      setError('Não foi possível registrar o aceite. Tente novamente.');
    },
  });

  const handleAccept = () => {
    setError(null);
    if (!data?.currentVersionId) return;
    acceptMutation.mutate(data.currentVersionId);
  };

  // Não autenticado → login (rota protegida)
  if (!authed) {
    navigate('/login', { replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold mb-2">Política de Uso</h1>
        <p className="text-sm text-text-secondary mb-6">
          {data?.currentVersion ? `Versão ${data.currentVersion}` : ''}
          {storedPolicy && !storedPolicy.accepted
            ? ' — leia e aceite para continuar usando o Ady.'
            : ''}
        </p>

        {isLoading && <p className="text-text-secondary">Carregando política…</p>}

        {isError && (
          <p className="text-red-500 text-sm">
            Não foi possível carregar a política. Tente recarregar a página.
          </p>
        )}

        {data?.content && (
          <>
            <div
              data-testid="policy-content"
              className="max-h-[60vh] overflow-y-auto rounded-lg border border-border bg-card p-4 text-sm whitespace-pre-wrap font-mono leading-relaxed"
            >
              {data.content}
            </div>

            <label className="mt-6 flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
                data-testid="policy-agree-checkbox"
              />
              <span className="text-sm">Li e concordo com a Política de Uso do Ady.</span>
            </label>

            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

            <button
              type="button"
              onClick={handleAccept}
              disabled={!agreed || acceptMutation.isPending}
              className="mt-6 w-full sm:w-auto rounded-lg bg-[#B55F02] hover:bg-[#B55F02]/90 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="policy-accept-button"
            >
              {acceptMutation.isPending ? 'Registrando…' : 'Aceitar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
