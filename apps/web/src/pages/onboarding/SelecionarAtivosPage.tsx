import { useState, useTransition, useId } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { AdySymbol } from "@/components/AdySymbol";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

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

interface ApiListResponse<T> {
  data: T[];
}

// ─── Constantes de Configuração ─────────────────────────────────────────────────

const ONBOARDING_STEPS = [
  { label: "Conectar Meta" },
  { label: "Selecionar Conta" },
  { label: "Definir Meta" },
  { label: "Pronto" },
] as const;

const SUB_STEPS = [
  { label: "Business Managers" },
  { label: "Contas de Anúncio" },
  { label: "Páginas" },
  { label: "Resumo" },
] as const;

const ITEMS_PER_PAGE = 10;

// ─── Subcomponentes Utilitários ─────────────────────────────────────────────────

function ProgressSteps({ current }: { current: number }) {
  return (
    <nav aria-label="Progresso do Onboarding" className="flex items-center justify-center gap-0">
      <ol className="flex items-center">
        {ONBOARDING_STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={step.label} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors",
                    done || active
                      ? "bg-admin-petrol text-white"
                      : "bg-admin-surface-2 text-admin-text-faint"
                  )}
                  aria-current={active ? "step" : undefined}
                >
                  {done ? (
                    <Check className="w-4 h-4 text-white" aria-hidden="true" />
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs font-semibold whitespace-nowrap",
                    active || done ? "text-admin-petrol" : "text-admin-text-faint"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {i < ONBOARDING_STEPS.length - 1 && (
                <div
                  className={cn(
                    "w-12 h-0.5 mb-5 mx-2 transition-colors",
                    i < current ? "bg-admin-petrol" : "bg-admin-surface-2"
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SubStepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-2 flex-wrap" role="tablist">
      {SUB_STEPS.map((step, i) => {
        const stepNumber = i + 1;
        const isActive = stepNumber === current;
        const isDone = stepNumber < current;
        return (
          <span
            key={step.label}
            className={cn(
              "text-xs font-semibold px-2.5 py-1 rounded-full transition-colors",
              isActive
                ? "bg-admin-petrol text-white"
                : isDone
                  ? "bg-admin-surface-2 text-admin-petrol"
                  : "bg-admin-surface-2 text-admin-text-faint"
            )}
          >
            {stepNumber}. {step.label}
          </span>
        );
      })}
    </div>
  );
}

interface CheckboxCardProps {
  checked: boolean;
  title: string;
  subtitle?: string;
  badge?: { label: string; tone: "green" | "gray" };
  onClick: () => void;
}

function CheckboxCard({
  checked,
  title,
  subtitle,
  badge,
  onClick,
}: CheckboxCardProps) {
  const cardId = useId();

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-labelledby={cardId}
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-2xl border-2 transition-all duration-150 flex items-center gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-admin-petrol focus-visible:ring-offset-2",
        checked
          ? "border-admin-petrol bg-admin-surface-2"
          : "border-admin-border bg-admin-surface hover:border-admin-petrol/40 hover:bg-admin-surface-2"
      )}
    >
      <div
        className={cn(
          "w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors",
          checked ? "border-admin-petrol bg-admin-petrol" : "border-admin-border"
        )}
      >
        {checked && <Check className="w-3.5 h-3.5 text-white" aria-hidden="true" />}
      </div>

      <div className="flex-1 min-w-0">
        <p id={cardId} className="font-semibold text-admin-text truncate">
          {title}
        </p>
        {subtitle && (
          <p className="text-xs text-admin-text-muted mt-0.5 font-mono">{subtitle}</p>
        )}
      </div>

      {badge && (
        <span
          className={cn(
            "flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full",
            badge.tone === "green"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-admin-surface-2 text-admin-text-faint"
          )}
        >
          {badge.label}
        </span>
      )}
    </button>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="bg-admin-surface-2 border border-admin-border rounded-2xl p-6 text-center">
      <p className="text-admin-text font-semibold">{title}</p>
      <p className="text-sm text-admin-text-muted mt-1">{description}</p>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12" aria-label="Carregando dados">
      <Loader2 className="w-8 h-8 text-admin-petrol animate-spin" />
    </div>
  );
}

// ─── Componente Principal ────────────────────────────────────────────────────────

export function SelecionarAtivosPage() {
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();

  const [subStep, setSubStep] = useState(1);
  const [businessIds, setBusinessIds] = useState<string[]>([]);
  const [pageIds, setPageIds] = useState<string[]>([]);
  const [adAccountIds, setAdAccountIds] = useState<string[]>([]);
  const [businessPage, setBusinessPage] = useState(0);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const businessesQuery = useQuery({
    queryKey: ["meta-businesses"],
    queryFn: async () => {
      const res = await api.get<ApiListResponse<MetaBusinessOption>>("/meta/businesses");
      return res.data.data;
    },
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const adAccountsQuery = useQuery({
    queryKey: ["meta-adaccounts-by-business", businessIds],
    queryFn: async () => {
      const res = await api.post<ApiListResponse<MetaAdAccountOption>>(
        "/meta/adaccounts-by-business",
        { businessIds }
      );
      return res.data.data;
    },
    enabled: subStep >= 2 && businessIds.length > 0,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  const pagesQuery = useQuery({
    queryKey: ["meta-pages-by-business", businessIds],
    queryFn: async () => {
      const res = await api.post<ApiListResponse<MetaPageOption>>(
        "/meta/pages-by-business",
        { businessIds }
      );
      return res.data.data;
    },
    enabled: subStep >= 3 && businessIds.length > 0,
    staleTime: 1000 * 60 * 5,
    retry: false,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      await api.post("/meta/save-selection", {
        businessIds,
        pageIds,
        adAccountIds,
      });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: ["meta-connections"],
        type: "all",
      });
      // Soft navigation garantindo atualização transicionada
      startTransition(() => {
        window.location.assign("/dashboard");
      });
    },
  });

  // ── Mapeamento dos Itens Selecionados ─────────────────────────────────────────
  const businesses = businessesQuery.data ?? [];
  const adAccounts = adAccountsQuery.data ?? [];
  const pages = pagesQuery.data ?? [];

  const selectedBusinessNames = businesses
    .filter((b) => businessIds.includes(b.id))
    .map((b) => b.name);

  const selectedPageNames = pages
    .filter((p) => pageIds.includes(p.pageId))
    .map((p) => p.name);

  const selectedAdAccountNames = adAccounts
    .filter((a) => adAccountIds.includes(a.adAccountId))
    .map((a) => a.name);

  // ── Handlers de Ação ──────────────────────────────────────────────────────────
  function handleContinue() {
    setSubStep((current) => Math.min(current + 1, 4));
  }

  function handleBack() {
    setSubStep((current) => Math.max(current - 1, 1));
    setBusinessPage(0);
  }

  function toggleSelection(
    id: string,
    getter: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) {
    setter(getter.includes(id) ? [] : [id]);
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-admin-bg text-admin-text">
      {/* Fundo Iluminado — bem mais discreto no claro */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(150%_120%_at_50%_-10%,rgba(23,112,138,0.07),transparent_100%)] dark:bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(30,136,168,0.16),transparent_70%)]"
      />

      <header className="relative z-10 flex items-center justify-center border-b border-white/10 py-5">
        <div className="flex items-center gap-2">
          <AdySymbol size={28} />
          <span className="text-xl font-medium text-admin-text">ady</span>
        </div>
      </header>

      <div className="ady-decor relative z-10 pt-10 pb-6 flex justify-center">
        <ProgressSteps current={1} />
      </div>

      <div className="ady-decor relative z-10 pb-4">
        <SubStepIndicator current={subStep} />
      </div>

      <main className="ady-decor relative z-10 flex-1 flex items-start justify-center px-6 pt-4 pb-16">
        <div className="w-full max-w-lg space-y-8">
          {/* Step 1: Business Managers */}
          {subStep === 1 && (
            <section className="space-y-6">
              <div className="text-center space-y-3">
                <h1 className="text-3xl font-black text-admin-text leading-tight">
                  Qual Business Manager você quer gerenciar?
                </h1>
                <p className="text-admin-text-muted text-lg leading-relaxed">
                  Selecione uma. As Páginas e contas de anúncio das próximas
                  etapas serão filtradas por essa Business Manager.
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
                <>
                  <div className="space-y-3">
                    {businesses
                      .slice(
                        businessPage * ITEMS_PER_PAGE,
                        businessPage * ITEMS_PER_PAGE + ITEMS_PER_PAGE
                      )
                      .map((business) => (
                        <CheckboxCard
                          key={business.id}
                          checked={businessIds.includes(business.id)}
                          title={business.name}
                          subtitle={business.id}
                          onClick={() =>
                            toggleSelection(business.id, businessIds, setBusinessIds)
                          }
                        />
                      ))}
                  </div>

                  {businesses.length > ITEMS_PER_PAGE && (
                    <div className="flex items-center justify-center gap-3 text-sm">
                      <button
                        type="button"
                        onClick={() =>
                          setBusinessPage((p) => Math.max(0, p - 1))
                        }
                        disabled={businessPage === 0}
                        className="inline-flex items-center text-admin-petrol font-medium disabled:text-admin-text-faint disabled:cursor-not-allowed hover:underline focus-visible:outline-none"
                      >
                        <ChevronLeft className="w-4 h-4 mr-1" />
                        Anterior
                      </button>
                      <span className="text-admin-text-muted">
                        {businessPage * ITEMS_PER_PAGE + 1}–
                        {Math.min(
                          (businessPage + 1) * ITEMS_PER_PAGE,
                          businesses.length
                        )}{" "}
                        de {businesses.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setBusinessPage((p) => p + 1)}
                        disabled={
                          (businessPage + 1) * ITEMS_PER_PAGE >=
                          businesses.length
                        }
                        className="inline-flex items-center text-admin-petrol font-medium disabled:text-admin-text-faint disabled:cursor-not-allowed hover:underline focus-visible:outline-none"
                      >
                        Próxima
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </button>
                    </div>
                  )}
                </>
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
            </section>
          )}

          {/* Step 2: Contas de Anúncio */}
          {subStep === 2 && (
            <section className="space-y-6">
              <div className="text-center space-y-3">
                <h1 className="text-3xl font-black text-admin-text leading-tight">
                  Qual conta de anúncio você quer gerenciar?
                </h1>
                <p className="text-admin-text-muted text-lg leading-relaxed">
                  Apenas contas da Business Manager selecionada aparecem aqui.
                </p>
              </div>

              {adAccountsQuery.isLoading ? (
                <LoadingSpinner />
              ) : adAccounts.length === 0 ? (
                <EmptyState
                  title="Nenhuma conta de anúncio encontrada"
                  description="A Business Manager selecionada não tem contas de anúncio vinculadas."
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
                        badge={{
                          label: isActive ? "Ativa" : "Inativa",
                          tone: isActive ? "green" : "gray",
                        }}
                        onClick={() =>
                          toggleSelection(
                            account.adAccountId,
                            adAccountIds,
                            setAdAccountIds
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={handleBack}
                  variant="outline"
                  size="md"
                  className="flex-1"
                >
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
            </section>
          )}

          {/* Step 3: Páginas */}
          {subStep === 3 && (
            <section className="space-y-6">
              <div className="text-center space-y-3">
                <h1 className="text-3xl font-black text-admin-text leading-tight">
                  Qual Página você vai usar?
                </h1>
                <p className="text-admin-text-muted text-lg leading-relaxed">
                  Apenas Páginas da Business Manager selecionada aparecem aqui.
                  Se você não usa Páginas, pode continuar sem marcar nenhuma.
                </p>
              </div>

              {pagesQuery.isLoading ? (
                <LoadingSpinner />
              ) : pages.length === 0 ? (
                <EmptyState
                  title="Nenhuma Página nesta Business Manager"
                  description="A Business Manager selecionada não tem Páginas vinculadas. Você pode continuar sem selecionar nenhuma."
                />
              ) : (
                <div className="space-y-3">
                  {pages.map((page) => (
                    <CheckboxCard
                      key={page.pageId}
                      checked={pageIds.includes(page.pageId)}
                      title={page.name}
                      subtitle={page.pageId}
                      badge={
                        page.hasInstagram
                          ? { label: "Instagram vinculado", tone: "green" }
                          : undefined
                      }
                      onClick={() =>
                        toggleSelection(page.pageId, pageIds, setPageIds)
                      }
                    />
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={handleBack}
                  variant="outline"
                  size="md"
                  className="flex-1"
                >
                  Voltar
                </Button>
                <Button
                  onClick={handleContinue}
                  variant="primary"
                  size="md"
                  className="flex-1"
                >
                  Continuar
                </Button>
              </div>
            </section>
          )}

          {/* Step 4: Resumo */}
          {subStep === 4 && (
            <section className="space-y-6">
              <div className="text-center space-y-3">
                <h1 className="text-3xl font-black text-admin-text leading-tight">
                  Confira sua seleção
                </h1>
                <p className="text-admin-text-muted text-lg leading-relaxed">
                  A partir de agora, apenas estes ativos aparecerão no FURY.
                </p>
              </div>

              <div className="rounded-2xl border border-admin-border divide-y divide-admin-border">
                <div className="p-4">
                  <div className="text-xs font-bold text-admin-text-faint uppercase tracking-wide mb-1">
                    Business Manager ({selectedBusinessNames.length})
                  </div>
                  <div className="text-sm font-medium text-admin-text">
                    {selectedBusinessNames.join(", ") || "Nenhuma"}
                  </div>
                </div>

                <div className="p-4">
                  <div className="text-xs font-bold text-admin-text-faint uppercase tracking-wide mb-1">
                    Conta de Anúncio ({selectedAdAccountNames.length})
                  </div>
                  <div className="text-sm font-medium text-admin-text">
                    {selectedAdAccountNames.join(", ") || "Nenhuma"}
                  </div>
                </div>

                <div className="p-4">
                  <div className="text-xs font-bold text-admin-text-faint uppercase tracking-wide mb-1">
                    Página ({selectedPageNames.length})
                  </div>
                  <div className="text-sm font-medium text-admin-text">
                    {selectedPageNames.length > 0
                      ? selectedPageNames.join(", ")
                      : "Nenhuma"}
                  </div>
                </div>
              </div>

              {saveMutation.isError && (
                <p className="text-center text-sm text-admin-danger font-medium" role="alert">
                  Erro ao salvar a seleção. Tente novamente.
                </p>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={handleBack}
                  variant="outline"
                  size="md"
                  className="flex-1"
                  disabled={saveMutation.isPending}
                >
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
                    "Concluir"
                  )}
                </Button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}