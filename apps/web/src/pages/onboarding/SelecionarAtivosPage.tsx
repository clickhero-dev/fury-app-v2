import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

// ─── Progress steps (etapa do onboarding) ──────────────────────────────────────

const onboardingSteps = [
  { label: 'Conectar Meta' },
  { label: 'Selecionar Conta' },
  { label: 'Definir Meta' },
  { label: 'Pronto' },
];

function ProgressSteps({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {onboardingSteps.map((step, i) => {
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
            {i < onboardingSteps.length - 1 && (
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

// ─── Sub-steps do fluxo cascateado ─────────────────────────────────────────────

const SUB_STEPS = [
  { label: 'Business Managers' },
  { label: 'Páginas' },
  { label: 'Contas de Anúncio' },
  { label: 'WhatsApp' },
  { label: 'Resumo' },
];

function SubStepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      {SUB_STEPS.map((step, i) => {
        const stepNumber = i + 1;
        const isActive = stepNumber === current;
        const isDone = stepNumber < current;
        return (
          <span
            key={step.label}
            className={cn(
              'text-xs font-semibold px-2.5 py-1 rounded-full transition-colors',
              isActive
                ? 'bg-[#EA580C] text-white'
                : isDone
                  ? 'bg-orange-50 text-[#EA580C]'
                  : 'bg-[#F3F4F6] text-[#9CA3AF]'
            )}
          >
            {stepNumber}. {step.label}
          </span>
        );
      })}
    </div>
  );
}

// ─── Tipos ──────────────────────────────────────────────────────────────────────

interface MetaBusinessOption {
  id: string;
  name: string;
}

interface MetaPageOption {
  pageId: string;
  name: string;
  businessId: string;
  hasInstagram: boolean;
}

interface MetaAdAccountOption {
  adAccountId: string;
  name: string;
  status: number;
  businessId: string;
}

interface MetaWhatsappOption {
  phoneNumberId: string;
  displayPhoneNumber: string;
  pageId: string;
}

interface ApiListResponse<T> {
  data: T[];
}

// ─── Checkbox card ──────────────────────────────────────────────────────────────

function CheckboxCard({
  checked,
  title,
  subtitle,
  badge,
  onClick,
}: {
  checked: boolean;
  title: string;
  subtitle?: string;
  badge?: { label: string; tone: 'green' | 'gray' };
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-2xl border-2 transition-all duration-150 flex items-center gap-4',
        checked
          ? 'border-[#EA580C] bg-[#FFF7F4]'
          : 'border-[#E5E7EB] bg-white hover:border-[#EA580C]/40 hover:bg-[#FFF7F4]/50'
      )}
    >
      <div
        className={cn(
          'w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors',
          checked ? 'border-[#EA580C] bg-[#EA580C]' : 'border-[#D1D5DB]'
        )}
      >
        {checked && <Check className="w-3.5 h-3.5 text-white" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#1C1C1E] truncate">{title}</p>
        {subtitle && <p className="text-xs text-[#6E7681] mt-0.5">{subtitle}</p>}
      </div>

      {badge && (
        <span
          className={cn(
            'flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full',
            badge.tone === 'green' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
          )}
        >
          {badge.label}
        </span>
      )}
    </button>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-[#FFF7F4] border border-[#FDDCCC] rounded-2xl p-6 text-center">
      <p className="text-[#1C1C1E] font-semibold">{title}</p>
      <p className="text-sm text-[#6E7681] mt-1">{description}</p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <span className="w-8 h-8 border-2 border-[#EA580C]/30 border-t-[#EA580C] rounded-full animate-spin" />
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────────

export function SelecionarAtivosPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [subStep, setSubStep] = useState(1);
  const [businessIds, setBusinessIds] = useState<string[]>([]);
  const [pageIds, setPageIds] = useState<string[]>([]);
  const [adAccountIds, setAdAccountIds] = useState<string[]>([]);
  const [whatsappNumberIds, setWhatsappNumberIds] = useState<string[]>([]);

  function toggle(list: string[], id: string, setter: (value: string[]) => void) {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  // ── Step 1: Business Managers ─────────────────────────────────────────────────
  const businessesQuery = useQuery({
    queryKey: ['meta-businesses'],
    queryFn: async () => {
      const res = await api.get<ApiListResponse<MetaBusinessOption>>('/meta/businesses');
      return res.data.data;
    },
    staleTime: 0,
    retry: false,
  });
  const businesses = businessesQuery.data ?? [];

  // ── Step 2: Páginas (filtradas pelas BMs selecionadas) ──────────────────────────
  const pagesQuery = useQuery({
    queryKey: ['meta-pages-by-business', businessIds],
    queryFn: async () => {
      const res = await api.post<ApiListResponse<MetaPageOption>>('/meta/pages-by-business', { businessIds });
      return res.data.data;
    },
    enabled: subStep >= 2 && businessIds.length > 0,
    staleTime: 0,
    retry: false,
  });
  const pages = pagesQuery.data ?? [];

  // ── Step 3: Contas de Anúncio (filtradas pelas BMs selecionadas) ────────────────
  const adAccountsQuery = useQuery({
    queryKey: ['meta-adaccounts-by-business', businessIds],
    queryFn: async () => {
      const res = await api.post<ApiListResponse<MetaAdAccountOption>>('/meta/adaccounts-by-business', {
        businessIds,
      });
      return res.data.data;
    },
    enabled: subStep >= 3 && businessIds.length > 0,
    staleTime: 0,
    retry: false,
  });
  const adAccounts = adAccountsQuery.data ?? [];

  // ── Step 4: WhatsApp (filtrado pelas BMs e Páginas selecionadas) ─────────────
  const whatsappQuery = useQuery({
    queryKey: ['meta-whatsapp-by-assets', businessIds, pageIds],
    queryFn: async () => {
      const res = await api.post<ApiListResponse<MetaWhatsappOption>>('/meta/whatsapp-by-pages', {
        businessIds,
        pageIds,
      });
      return res.data.data;
    },
    enabled: subStep >= 4 && businessIds.length > 0,
    staleTime: 0,
    retry: false,
  });
  const whatsappNumbers = whatsappQuery.data ?? [];

  // ── Salvar seleção ───────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.post('/meta/save-selection', {
        businessIds,
        pageIds,
        adAccountIds,
        whatsappNumberIds,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['meta-connections'] });
      // A query 'meta-connections' fica `enabled: false` enquanto estamos em /onboarding,
      // entao invalidateQueries (refetchType padrao 'active') nao a refaz. Forca o refetch
      // com type 'all' para garantir que o cache ja tenha selectedAdAccountId antes do
      // AuthenticatedShell decidir se redireciona de volta para o onboarding.
      await queryClient.refetchQueries({ queryKey: ['meta-connections'], type: 'all' });
      navigate('/dashboard');
    },
  });

  const selectedBusinessNames = businesses.filter((b) => businessIds.includes(b.id)).map((b) => b.name);
  const selectedPageNames = pages.filter((p) => pageIds.includes(p.pageId)).map((p) => p.name);
  const selectedAdAccountNames = adAccounts
    .filter((a) => adAccountIds.includes(a.adAccountId))
    .map((a) => a.name);
  const selectedWhatsappNumbers = whatsappNumbers.filter((n) => whatsappNumberIds.includes(n.phoneNumberId));

  function handleContinue() {
    setSubStep((current) => Math.min(current + 1, 5));
  }

  function handleBack() {
    setSubStep((current) => Math.max(current - 1, 1));
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="border-b border-[#F3F4F6] px-6 py-4 flex items-center justify-center">
        <span className="text-xl font-black text-[#1C1C1E] tracking-tight">FURY</span>
      </header>

      {/* Progress */}
      <div className="pt-10 pb-6 flex justify-center">
        <ProgressSteps current={1} />
      </div>

      <div className="pb-4">
        <SubStepIndicator current={subStep} />
      </div>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center px-6 pt-4 pb-16">
        <div className="w-full max-w-lg space-y-8">
          {/* ── Step 1: Business Managers ─────────────────────────────────── */}
          {subStep === 1 && (
            <>
              <div className="text-center space-y-3">
                <h1 className="text-3xl font-black text-[#1C1C1E] leading-tight">
                  Quais Business Managers você quer gerenciar?
                </h1>
                <p className="text-[#6E7681] text-lg leading-relaxed">
                  Selecione uma ou mais. As Páginas, contas de anúncio e números de WhatsApp das próximas etapas
                  serão filtrados por essas Business Managers.
                </p>
              </div>

              {businessesQuery.isLoading ? (
                <LoadingSpinner />
              ) : businesses.length === 0 ? (
                <EmptyState
                  title="Nenhuma Business Manager encontrada"
                  description="Sua conta Meta conectada não tem acesso a nenhuma Business Manager."
                />
              ) : (
                <div className="space-y-3">
                  {businesses.map((business) => (
                    <CheckboxCard
                      key={business.id}
                      checked={businessIds.includes(business.id)}
                      title={business.name}
                      subtitle={business.id}
                      onClick={() => toggle(businessIds, business.id, setBusinessIds)}
                    />
                  ))}
                </div>
              )}

              <Button
                onClick={handleContinue}
                variant="primary"
                size="md"
                className="w-full"
                disabled={businessIds.length === 0}
              >
                Continuar
              </Button>
            </>
          )}

          {/* ── Step 2: Páginas ────────────────────────────────────────────── */}
          {subStep === 2 && (
            <>
              <div className="text-center space-y-3">
                <h1 className="text-3xl font-black text-[#1C1C1E] leading-tight">
                  Quais Páginas você vai usar?
                </h1>
                <p className="text-[#6E7681] text-lg leading-relaxed">
                  Apenas Páginas das Business Managers selecionadas aparecem aqui. Se você não usa Páginas,
                  pode continuar sem marcar nenhuma.
                </p>
              </div>

              {pagesQuery.isLoading ? (
                <LoadingSpinner />
              ) : pages.length === 0 ? (
                <EmptyState
                  title="Nenhuma Página nestas Business Managers"
                  description="As Business Managers selecionadas não têm Páginas vinculadas. Você pode continuar sem selecionar nenhuma."
                />
              ) : (
                <div className="space-y-3">
                  {pages.map((page) => (
                    <CheckboxCard
                      key={page.pageId}
                      checked={pageIds.includes(page.pageId)}
                      title={page.name}
                      subtitle={page.pageId}
                      badge={page.hasInstagram ? { label: 'Instagram vinculado', tone: 'green' } : undefined}
                      onClick={() => toggle(pageIds, page.pageId, setPageIds)}
                    />
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={handleBack} variant="outline" size="md" className="flex-1">
                  Voltar
                </Button>
                <Button onClick={handleContinue} variant="primary" size="md" className="flex-1">
                  Continuar
                </Button>
              </div>
            </>
          )}

          {/* ── Step 3: Contas de Anúncio ──────────────────────────────────── */}
          {subStep === 3 && (
            <>
              <div className="text-center space-y-3">
                <h1 className="text-3xl font-black text-[#1C1C1E] leading-tight">
                  Quais contas de anúncio você quer gerenciar?
                </h1>
                <p className="text-[#6E7681] text-lg leading-relaxed">
                  Apenas contas das Business Managers selecionadas aparecem aqui.
                </p>
              </div>

              {adAccountsQuery.isLoading ? (
                <LoadingSpinner />
              ) : adAccounts.length === 0 ? (
                <EmptyState
                  title="Nenhuma conta de anúncio encontrada"
                  description="As Business Managers selecionadas não têm contas de anúncio vinculadas."
                />
              ) : (
                <div className="space-y-3">
                  {adAccounts.map((account) => {
                    const isActive = account.status === 1;
                    return (
                      <CheckboxCard
                        key={account.adAccountId}
                        checked={adAccountIds.includes(account.adAccountId)}
                        title={account.name}
                        subtitle={account.adAccountId}
                        badge={{ label: isActive ? 'Ativa' : 'Inativa', tone: isActive ? 'green' : 'gray' }}
                        onClick={() => toggle(adAccountIds, account.adAccountId, setAdAccountIds)}
                      />
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={handleBack} variant="outline" size="md" className="flex-1">
                  Voltar
                </Button>
                <Button
                  onClick={handleContinue}
                  variant="primary"
                  size="md"
                  className="flex-1"
                  disabled={adAccountIds.length === 0}
                >
                  Continuar
                </Button>
              </div>
            </>
          )}

          {/* ── Step 4: WhatsApp ───────────────────────────────────────────── */}
          {subStep === 4 && (
            <>
              <div className="text-center space-y-3">
                <h1 className="text-3xl font-black text-[#1C1C1E] leading-tight">
                  Quais números de WhatsApp você vai usar?
                </h1>
                <p className="text-[#6E7681] text-lg leading-relaxed">
                  Números das Business Managers selecionadas e das Páginas vinculadas. Se você não usa WhatsApp,
                  pode continuar sem marcar nenhum.
                </p>
              </div>

              {whatsappQuery.isLoading ? (
                <LoadingSpinner />
              ) : whatsappNumbers.length === 0 ? (
                <EmptyState
                  title="Nenhum número de WhatsApp encontrado"
                  description="As Business Managers selecionadas não têm números de WhatsApp Business vinculados. Você pode continuar sem selecionar nenhum."
                />
              ) : (
                <div className="space-y-3">
                  {whatsappNumbers.map((number) => (
                    <CheckboxCard
                      key={number.phoneNumberId}
                      checked={whatsappNumberIds.includes(number.phoneNumberId)}
                      title={number.displayPhoneNumber}
                      subtitle={number.phoneNumberId}
                      onClick={() => toggle(whatsappNumberIds, number.phoneNumberId, setWhatsappNumberIds)}
                    />
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={handleBack} variant="outline" size="md" className="flex-1">
                  Voltar
                </Button>
                <Button onClick={handleContinue} variant="primary" size="md" className="flex-1">
                  Continuar
                </Button>
              </div>
            </>
          )}

          {/* ── Step 5: Resumo ─────────────────────────────────────────────── */}
          {subStep === 5 && (
            <>
              <div className="text-center space-y-3">
                <h1 className="text-3xl font-black text-[#1C1C1E] leading-tight">Confira sua seleção</h1>
                <p className="text-[#6E7681] text-lg leading-relaxed">
                  A partir de agora, apenas estes ativos aparecerão no FURY.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E5E7EB] divide-y divide-[#F3F4F6]">
                <div className="p-4">
                  <div className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wide mb-1">
                    Business Managers ({selectedBusinessNames.length})
                  </div>
                  <div className="text-sm font-medium text-[#1C1C1E]">
                    {selectedBusinessNames.join(', ')}
                  </div>
                </div>

                <div className="p-4">
                  <div className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wide mb-1">
                    Páginas ({selectedPageNames.length})
                  </div>
                  <div className="text-sm font-medium text-[#1C1C1E]">
                    {selectedPageNames.length > 0 ? selectedPageNames.join(', ') : 'Nenhuma'}
                  </div>
                </div>

                <div className="p-4">
                  <div className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wide mb-1">
                    Contas de Anúncio ({selectedAdAccountNames.length})
                  </div>
                  <div className="text-sm font-medium text-[#1C1C1E]">
                    {selectedAdAccountNames.join(', ')}
                  </div>
                </div>

                <div className="p-4">
                  <div className="text-xs font-bold text-[#9CA3AF] uppercase tracking-wide mb-1">
                    Números de WhatsApp ({selectedWhatsappNumbers.length})
                  </div>
                  <div className="text-sm font-medium text-[#1C1C1E]">
                    {selectedWhatsappNumbers.length > 0
                      ? selectedWhatsappNumbers.map((n) => n.displayPhoneNumber).join(', ')
                      : 'Nenhum'}
                  </div>
                </div>
              </div>

              {saveMutation.isError && (
                <p className="text-center text-sm text-red-500">
                  Erro ao salvar a seleção. Tente novamente.
                </p>
              )}

              <div className="flex gap-3">
                <Button onClick={handleBack} variant="outline" size="md" className="flex-1" disabled={saveMutation.isPending}>
                  Voltar
                </Button>
                <Button
                  onClick={() => saveMutation.mutate()}
                  variant="primary"
                  size="md"
                  className="flex-1"
                  disabled={saveMutation.isPending}
                >
                  {saveMutation.isPending ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvando...
                    </span>
                  ) : (
                    'Concluir'
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
