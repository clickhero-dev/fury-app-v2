import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import type { MetaConnection, MetaAdAccount } from '@/types/meta';

// ─── Progress steps ───────────────────────────────────────────────────────────

const steps = [
  { label: 'Conectar Meta' },
  { label: 'Selecionar Conta' },
  { label: 'Definir Meta' },
  { label: 'Pronto' },
];

function ProgressSteps({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                  done || active ? 'bg-[#EA580C] text-white' : 'bg-[#E5E7EB] text-[#9CA3AF]',
                ].join(' ')}
              >
                {done ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={[
                  'text-xs font-semibold whitespace-nowrap',
                  active || done ? 'text-[#EA580C]' : 'text-[#9CA3AF]',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={[
                  'w-12 h-0.5 mb-5 mx-2',
                  i < current ? 'bg-[#EA580C]' : 'bg-[#E5E7EB]',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlatAdAccount extends MetaAdAccount {
  connectionId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SelecionarContaPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<FlatAdAccount | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const { data: connections = [], isLoading } = useQuery<MetaConnection[]>({
    queryKey: ['meta-connections'],
    queryFn: async () => {
      const res = await api.get<{ data: MetaConnection[] }>('/meta/connections');
      return res.data.data;
    },
    staleTime: 0,
    retry: false,
  });

  // Flatten all ad accounts across all connections
  const allAccounts: FlatAdAccount[] = connections.flatMap((conn) =>
    (conn.adAccounts ?? []).map((acc) => ({ ...acc, connectionId: conn.id }))
  );

  const inactiveCount = allAccounts.filter((acc) => acc.account_status !== 1).length;

  // Por padrão, exibe apenas contas ativas. Toggle revela as inativas.
  const visibleAccounts = showInactive
    ? allAccounts
    : allAccounts.filter((acc) => acc.account_status === 1);

  // Auto-select if only one account available
  useEffect(() => {
    if (visibleAccounts.length === 1 && !selected) {
      setSelected(visibleAccounts[0]);
    }
  }, [visibleAccounts.length]);

  const mutation = useMutation({
    mutationFn: async ({ connectionId, adAccountId }: { connectionId: string; adAccountId: string }) => {
      await api.patch(`/meta/connections/${connectionId}/select-account`, { adAccountId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-connections'] });
      navigate('/onboarding/metas');
    },
  });

  const handleContinue = () => {
    if (!selected) return;
    mutation.mutate({ connectionId: selected.connectionId, adAccountId: selected.id });
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-[#F3F4F6] px-6 py-4 flex items-center justify-center">
        <span className="text-xl font-black text-[#1C1C1E] tracking-tight">FURY</span>
      </header>

      {/* Progress */}
      <div className="pt-10 pb-8 flex justify-center">
        <ProgressSteps current={1} />
      </div>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-6 pt-4 pb-16">
        <div className="w-full max-w-lg space-y-8">
          {/* Title */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-black text-[#1C1C1E] leading-tight">
              Qual conta de anúncios você quer gerenciar?
            </h1>
            <p className="text-[#6E7681] text-lg leading-relaxed">
              Escolha a conta principal. Você pode trocar depois em Configurações.
            </p>
          </div>

          {/* Account list */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <span className="w-8 h-8 border-2 border-[#EA580C]/30 border-t-[#EA580C] rounded-full animate-spin" />
            </div>
          ) : visibleAccounts.length === 0 && allAccounts.length === 0 ? (
            <div className="bg-[#FFF7F4] border border-[#FDDCCC] rounded-2xl p-6 text-center">
              <p className="text-[#1C1C1E] font-semibold">Nenhuma conta de anúncio encontrada</p>
              <p className="text-sm text-[#6E7681] mt-1">
                Certifique-se de que sua conta Meta tem acesso a pelo menos uma conta de anúncios.
              </p>
              <a
                href="https://business.facebook.com/settings/ad-accounts"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 text-sm font-semibold text-[#EA580C] hover:underline"
              >
                Criar conta de anúncios no Meta
              </a>
            </div>
          ) : visibleAccounts.length === 0 ? (
            <div className="bg-[#FFF7F4] border border-[#FDDCCC] rounded-2xl p-6 text-center">
              <p className="text-[#1C1C1E] font-semibold">Nenhuma conta ativa encontrada</p>
              <p className="text-sm text-[#6E7681] mt-1">
                Todas as contas vinculadas estão inativas. Marque "Mostrar contas inativas" para selecionar uma delas.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleAccounts.map((account) => {
                const isActive = account.account_status === 1;
                const isSelected = selected?.id === account.id;
                return (
                  <button
                    key={`${account.connectionId}-${account.id}`}
                    onClick={() => setSelected(account)}
                    className={cn(
                      'w-full text-left p-4 rounded-2xl border-2 transition-all duration-150 flex items-center gap-4',
                      isSelected
                        ? 'border-[#EA580C] bg-[#FFF7F4]'
                        : 'border-[#E5E7EB] bg-white hover:border-[#EA580C]/40 hover:bg-[#FFF7F4]/50'
                    )}
                  >
                    {/* Radio indicator */}
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors',
                        isSelected ? 'border-[#EA580C]' : 'border-[#D1D5DB]'
                      )}
                    >
                      {isSelected && (
                        <div className="w-2.5 h-2.5 rounded-full bg-[#EA580C]" />
                      )}
                    </div>

                    {/* Account info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#1C1C1E] truncate">{account.name}</p>
                      <p className="text-xs text-[#6E7681] mt-0.5">
                        {account.id}
                        {account.currency ? ` · ${account.currency}` : ''}
                      </p>
                    </div>

                    {/* Status badge */}
                    <span
                      className={cn(
                        'flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full',
                        isActive
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      )}
                    >
                      {isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Toggle: mostrar contas inativas */}
          {!isLoading && inactiveCount > 0 && (
            <label className="flex items-center justify-center gap-2 text-sm text-[#6E7681] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="w-4 h-4 rounded border-[#D1D5DB] text-[#EA580C] focus:ring-[#EA580C]/30"
              />
              Mostrar contas inativas ({inactiveCount})
            </label>
          )}

          {/* CTA */}
          {!isLoading && allAccounts.length > 0 && (
            <Button
              onClick={handleContinue}
              variant="primary"
              size="md"
              className="w-full"
              disabled={!selected || mutation.isPending}
            >
              {mutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Salvando...
                </span>
              ) : (
                'Continuar'
              )}
            </Button>
          )}

          {mutation.isError && (
            <p className="text-center text-sm text-red-500">
              Erro ao salvar a conta. Tente novamente.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
