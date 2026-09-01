import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout, PageHeader } from '@/components'; // IMPORTANTE: Importar PageHeader
import { useSubscription, useCancelSubscription } from '@/hooks/useBilling';
import { useTheme } from '@/hooks/useTheme';
import { Sun, Moon, Copy, ExternalLink, Megaphone } from 'lucide-react';
import api from '@/lib/api';
import { MetasPage } from '../onboarding/MetasPage';
import { PublicoContent } from './PublicoContent';
import { BrandKitContent } from './BrandKitPage';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ConfiguracoesTabsNav } from './ConfiguracoesTabsNav';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type TabType = 'geral' | 'seguranca' | 'faturamento' | 'metas' | 'publico';
const VALID_TABS: TabType[] = ['geral', 'seguranca', 'faturamento', 'metas', 'publico'];

/* ── Estilos Globais de Elementos ── */
const SURFACE_CARD = 'rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm hover:border-border-light transition-all duration-300';
const INPUT_STYLE = 'w-full rounded-xl border border-border bg-surface-secondary px-4 py-2.5 text-sm text-text-primary outline-none transition focus:border-brand';
const BUTTON_HOVER = 'transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]';

interface MeResponse {
  id: string;
  name: string | null;
  email: string;
  tenantName: string;
  tenantSlug: string;
  tenantCodigo: string;
  role: string;
  tenantId: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-lg text-xs font-semibold text-white',
        type === 'success' ? 'bg-brand' : 'bg-error'
      )}
    >
      {type === 'success' ? '✅' : '⚠️'} {message}
    </div>
  );
}

export function Configuracoes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const rawTab = searchParams.get('tab') as TabType | null;
  const activeTab: TabType = rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'geral';

  function setTab(tab: string) {
    setSearchParams({ tab }, { replace: true });
  }

  // ── Dark mode ────────────────────────────────────────────────────────────────
  const { isDark, setDark } = useTheme();

  // ── Aba Geral ────────────────────────────────────────────────────────────────
  const { data: meData, isLoading: meLoading } = useQuery<MeResponse>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: MeResponse }>('/auth/me');
      return res.data.data;
    },
    staleTime: 60 * 1000,
    retry: false,
  });

  const [name, setName] = useState('');
  const [tenantName, setTenantName] = useState('');

  useEffect(() => {
    if (meData) {
      setName(meData.name ?? '');
      setTenantName(meData.tenantName ?? '');
    }
  }, [meData]);

  const updateMeMutation = useMutation({
    mutationFn: async (data: { name: string; tenantName: string }) => {
      await api.patch('/auth/me', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      showToast('Alterações salvas com sucesso!', 'success');
    },
    onError: () => {
      showToast('Erro ao salvar. Tente novamente.', 'error');
    },
  });

  // ── Aba Faturamento ──────────────────────────────────────────────────────────
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const cancelMutation = useCancelSubscription();

  useEffect(() => {
    if (cancelMutation.isSuccess) {
      setCancelOpen(false);
      showToast('Assinatura cancelada.', 'success');
    }
    if (cancelMutation.isError) {
      showToast('Erro ao cancelar. Tente novamente.', 'error');
    }
  }, [cancelMutation.isSuccess, cancelMutation.isError]);

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      await api.post('/auth/change-password', data);
    },
    onSuccess: () => {
      setPasswordOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Senha alterada com sucesso!', 'success');
    },
    onError: () => {
      showToast('Erro ao alterar senha. Verifique a senha atual e tente novamente.', 'error');
    },
  });

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const destinationUrl = meData
    ? `${window.location.origin}/l/${meData.tenantCodigo || meData.tenantSlug}`
    : '';

  const handleCopyLink = () => {
    if (!destinationUrl) return;
    navigator.clipboard.writeText(destinationUrl);
    setCopiedLink(true);
    showToast('Link copiado!', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <AppLayout>
      {/* Container externo exatamente padronizado com Campanhas e Dashboard */}
      <div className="mx-auto w-full max-w-5xl space-y-6 px-6 pt-2 pb-8 sm:px-10">
        {toast && <Toast message={toast.message} type={toast.type} />}

        {/* Header Reutilizável Padronizado */}
        <PageHeader
          title="Configurações"
          description="Sua conta, do jeito que faz sentido"
        />

        {/* Navegação por abas */}
        <ConfiguracoesTabsNav activeTab={activeTab} />

        <Tabs value={activeTab} onValueChange={setTab} className="w-full">
          
          {/* ── Aba Geral ── */}
          <TabsContent value="geral">
            <div className="w-full">
              <div className={`${SURFACE_CARD} space-y-8`}>
                
                {/* Seção 1: Informações da conta */}
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-text-primary">Informações da conta</h3>
                  
                  {meLoading ? (
                    <div className="flex justify-center py-8">
                      <span className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-text-tertiary mb-2">
                            Nome completo
                          </label>
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Seu nome"
                            className={INPUT_STYLE}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-text-tertiary mb-2">
                            E-mail
                          </label>
                          <input
                            type="email"
                            value={meData?.email ?? ''}
                            readOnly
                            disabled
                            className={`${INPUT_STYLE} opacity-50 cursor-not-allowed`}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-text-tertiary mb-2">
                          Organização
                        </label>
                        <input
                          type="text"
                          value={tenantName}
                          onChange={(e) => setTenantName(e.target.value)}
                          placeholder="Nome da organização"
                          className={INPUT_STYLE}
                        />
                      </div>
                    </>
                  )}
                </div>

                <hr className="border-border" />

                {/* Seção 2: Aparência */}
                <div className="space-y-3">
                  <label className="block text-sm font-semibold text-text-primary">
                    Aparência
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setDark(false)}
                      className={cn(
                        'flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all duration-200 cursor-pointer',
                        !isDark
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-border bg-surface-secondary text-text-tertiary hover:text-text-primary'
                      )}
                    >
                      <Sun size={16} />
                      Claro
                    </button>

                    <button
                      type="button"
                      onClick={() => setDark(true)}
                      className={cn(
                        'flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all duration-200 cursor-pointer',
                        isDark
                          ? 'border-brand bg-brand/10 text-brand'
                          : 'border-border bg-surface-secondary text-text-tertiary hover:text-text-primary'
                      )}
                    >
                      <Moon size={16} />
                      Escuro
                    </button>
                  </div>
                </div>

                {/* Seção 3: Página de Destino */}
                {meData?.tenantId && (
                  <>
                    <hr className="border-border" />
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-base font-semibold text-text-primary">Página de destino</h3>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          Compartilhe este link para seus clientes falarem com você no WhatsApp.
                        </p>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                        <input
                          type="text"
                          readOnly
                          value={destinationUrl}
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                          className={`${INPUT_STYLE} flex-1 select-all`}
                        />
                        
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleCopyLink}
                            className={`inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-white ${BUTTON_HOVER} cursor-pointer`}
                          >
                            <Copy size={14} />
                            {copiedLink ? 'Copiado!' : 'Copiar'}
                          </button>

                          <a
                            href={destinationUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-surface-secondary px-4 py-2.5 text-xs font-semibold text-text-primary transition-all hover:bg-border cursor-pointer`}
                          >
                            <ExternalLink size={14} />
                            Visualizar
                          </a>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Seção 4: Integrações disponíveis */}
                <hr className="border-border" />
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-semibold text-text-primary">Integrações</h3>
                    <p className="text-xs text-text-tertiary mt-0.5">
                      Conecte e gerencie suas contas e perfis externos.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Link
                      to="/configuracoes/integracoes"
                      className={`${SURFACE_CARD} group flex items-center justify-between gap-4`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                          <Megaphone className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text-primary">Meta Ads</p>
                          <p className="text-xs text-text-tertiary">Contas de anúncios conectadas</p>
                        </div>
                      </div>
                      <span className="text-text-tertiary transition group-hover:text-brand">→</span>
                    </Link>

                    {/* Google Meu Negócio oculto (feature incompleta) — 2026-09 */}
                    {/* <Link
                      to="/configuracoes/google-meu-negocio"
                      className={`${SURFACE_CARD} group flex items-center justify-between gap-4`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand/10 text-brand">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text-primary">Google Meu Negócio</p>
                          <p className="text-xs text-text-tertiary">Perfil da sua empresa no Google</p>
                        </div>
                      </div>
                      <span className="text-text-tertiary transition group-hover:text-brand">→</span>
                    </Link> */}
                  </div>
                </div>

                {/* Rodapé de Ações */}
                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <button
                    type="button"
                    onClick={() => {
                      setName(meData?.name ?? '');
                      setTenantName(meData?.tenantName ?? '');
                    }}
                    className="rounded-full border border-border bg-surface-secondary px-5 py-2 text-xs font-semibold text-text-primary transition-all hover:bg-border cursor-pointer"
                  >
                    Cancelar
                  </button>
                  
                  <button
                    type="button"
                    disabled={updateMeMutation.isPending}
                    onClick={() => updateMeMutation.mutate({ name, tenantName })}
                    className={`rounded-full bg-[#17708A] px-5 py-2 text-xs font-semibold text-white ${BUTTON_HOVER} disabled:opacity-50 cursor-pointer`}
                  >
                    {updateMeMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
                  </button>
                </div>

              </div>
            </div>
          </TabsContent>

          {/* ── Aba Segurança ── */}
          <TabsContent value="seguranca">
            <div className={`${SURFACE_CARD} space-y-6 w-full`}>
              <div>
                <h3 className="text-base font-semibold text-text-primary mb-4">Segurança da Conta</h3>
                <div className="p-4 border border-border rounded-xl bg-surface-secondary flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Alterar Senha</p>
                    <p className="text-xs text-text-tertiary">Atualize sua senha regularmente</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPasswordOpen(true)}
                    className="rounded-full border border-border px-4 py-1.5 text-xs font-medium text-text-primary hover:bg-border cursor-pointer"
                  >
                    Alterar
                  </button>
                </div>
              </div>
            </div>

            <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
              <DialogContent className="max-w-md border-border bg-surface text-text-primary">
                <DialogHeader>
                  <DialogTitle className="text-base font-semibold text-text-primary">Alterar Senha</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 my-2">
                  <div>
                    <label className="block text-xs font-semibold text-text-tertiary mb-2">Senha Atual</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className={INPUT_STYLE}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-tertiary mb-2">Nova Senha</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className={INPUT_STYLE}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-tertiary mb-2">Confirmar Nova Senha</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      className={INPUT_STYLE}
                    />
                  </div>
                  {newPassword && confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-error">As senhas não conferem</p>
                  )}
                </div>
                <DialogFooter className="gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordOpen(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    className="rounded-full border border-border px-4 py-2 text-xs font-medium text-text-primary hover:bg-border cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={
                      changePasswordMutation.isPending ||
                      !currentPassword ||
                      !newPassword ||
                      newPassword.length < 8 ||
                      newPassword !== confirmPassword
                    }
                    onClick={() =>
                      changePasswordMutation.mutate({
                        currentPassword,
                        newPassword,
                      })
                    }
                    className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white hover:bg-brand/90 disabled:opacity-50 cursor-pointer"
                  >
                    {changePasswordMutation.isPending ? 'Alterando...' : 'Alterar Senha'}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ── Aba Faturamento ── */}
          <TabsContent value="faturamento">
            <div className={`${SURFACE_CARD} space-y-6 w-full`}>
              {subLoading ? (
                <div className="flex justify-center py-8">
                  <span className="w-6 h-6 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                </div>
              ) : !subscription ? (
                <div className="text-center py-8 space-y-4">
                  <p className="text-base font-semibold text-text-primary">Nenhuma assinatura ativa</p>
                  <p className="text-xs text-text-tertiary">
                    Assine um plano para acessar todos os recursos da FURY.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/assinatura')}
                    className={`rounded-full bg-brand px-5 py-2 text-xs font-semibold text-white ${BUTTON_HOVER} cursor-pointer`}
                  >
                    Ver Planos
                  </button>
                </div>
              ) : subscription.status === 'trial' ? (
                <>
                  <div>
                    <h3 className="text-base font-semibold text-text-primary mb-4">Plano Atual</h3>
                    <div className="p-4 border border-warning/30 rounded-xl bg-warning/10 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-text-tertiary">Plano</span>
                        <span className="text-xs font-bold text-warning">Trial</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-text-tertiary">Trial expira em</span>
                        <span className="text-xs font-bold text-text-primary">
                          {formatDate(subscription.trialEndsAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end pt-4 border-t border-border">
                    <button
                      type="button"
                      onClick={() => navigate('/assinatura')}
                      className={`rounded-full bg-brand px-5 py-2 text-xs font-semibold text-white ${BUTTON_HOVER} cursor-pointer`}
                    >
                      Assinar um Plano
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h3 className="text-base font-semibold text-text-primary mb-4">Plano Atual</h3>
                    <div className="p-4 border border-border rounded-xl bg-surface-secondary space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-text-tertiary">Plano</span>
                        <span className="text-xs font-bold text-text-primary">
                          {subscription.plan?.name ?? '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-text-tertiary">Vencimento do Plano</span>
                        <span className="text-xs font-bold text-text-primary">
                          {formatDate(subscription.currentPeriodEnd)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <button
                      type="button"
                      onClick={() => setCancelOpen(true)}
                      className="rounded-full border border-error/40 px-4 py-2 text-xs font-semibold text-error hover:bg-error/10 hover:border-error cursor-pointer"
                    >
                      Cancelar Plano
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/assinatura')}
                      className={`rounded-full bg-brand px-5 py-2 text-xs font-semibold text-white ${BUTTON_HOVER} cursor-pointer`}
                    >
                      Atualizar para Plano Pro
                    </button>
                  </div>
                </>
              )}
            </div>

            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
              <DialogContent className="max-w-md border-border bg-surface text-text-primary">
                <DialogHeader>
                  <DialogTitle className="text-base font-semibold text-text-primary">Cancelar assinatura?</DialogTitle>
                </DialogHeader>
                <p className="text-xs text-text-tertiary my-2">
                  Ao cancelar, você perderá acesso aos recursos premium ao final do período atual. Esta ação não pode ser desfeita.
                </p>
                <DialogFooter className="gap-2">
                  <button
                    type="button"
                    onClick={() => setCancelOpen(false)}
                    className="rounded-full border border-border px-4 py-2 text-xs font-medium text-text-primary hover:bg-border cursor-pointer"
                  >
                    Manter Assinatura
                  </button>
                  <button
                    type="button"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate()}
                    className="rounded-full bg-error px-4 py-2 text-xs font-semibold text-white hover:bg-error/90 disabled:opacity-50 cursor-pointer"
                  >
                    {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ── Dados da Marca e Público ── */}
          <TabsContent value="publico">
            <div className="space-y-6 w-full">
              <BrandKitContent />
              <PublicoContent />
            </div>
          </TabsContent>

          {/* ── Metas ── */}
          <TabsContent value="metas">
            <div className="w-full">
              <MetasPage />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}