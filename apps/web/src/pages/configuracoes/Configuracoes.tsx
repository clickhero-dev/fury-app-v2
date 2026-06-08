import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout, PageHeader, Button, Card } from '@/components';
import { FuryConfig } from './FuryConfig';
import { useSubscription, useCancelSubscription } from '@/hooks/useBilling';
import api from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

type TabType = 'geral' | 'notificacoes' | 'seguranca' | 'equipe' | 'faturamento' | 'integracoes' | 'fury';

interface SettingSection {
  id: TabType;
  label: string;
  icon: React.ReactNode;
}

interface MeResponse {
  id: string;
  name: string | null;
  email: string;
  tenantName: string;
  role: string;
  tenantId: string;
}

const cogIcon = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
  </svg>
);

const bellIcon = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path d="M10 2a6 6 0 00-6 6v3.586L2.707 9.293a1 1 0 00-1.414 1.414l2 2A1 1 0 004 13h12a1 1 0 00.707-.293l2-2a1 1 0 00-1.414-1.414L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
  </svg>
);

const shieldIcon = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
  </svg>
);

const userIcon = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 11.93a7.001 7.001 0 00-10.86 0M17.07 11.93a9 9 0 00-14.14 0M15.68 16.68a5.5 5.5 0 11-11.36 0" />
  </svg>
);

const creditCardIcon = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path d="M4 4a2 2 0 00-2 2v4h16V6a2 2 0 00-2-2H4z" />
    <path fillRule="evenodd" d="M2 10a2 2 0 012-2h12a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2v-6zm2 1a1 1 0 000 2h1a1 1 0 000-2H4zm10 0a1 1 0 100 2h1a1 1 0 100-2h-1z" clipRule="evenodd" />
  </svg>
);

const plugIcon = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm6 0a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
  </svg>
);

const furyIcon = (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
    <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
  </svg>
);

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div
      className={[
        'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-semibold text-white animate-fade-in',
        type === 'success' ? 'bg-green-600' : 'bg-red-600',
      ].join(' ')}
    >
      {message}
    </div>
  );
}

export function Configuracoes() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('geral');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

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

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  const settingsTabs: SettingSection[] = [
    { id: 'geral', label: 'Geral', icon: cogIcon },
    { id: 'notificacoes', label: 'Notificações', icon: bellIcon },
    { id: 'seguranca', label: 'Segurança', icon: shieldIcon },
    { id: 'equipe', label: 'Equipe', icon: userIcon },
    { id: 'faturamento', label: 'Faturamento', icon: creditCardIcon },
    { id: 'integracoes', label: 'Integrações', icon: plugIcon },
    { id: 'fury', label: 'FURY Engine', icon: furyIcon },
  ];

  return (
    <AppLayout
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Configurações</h2>
        </div>
      }
    >
      {toast && <Toast message={toast.message} type={toast.type} />}

      <div className="space-y-8">
        <PageHeader
          title="Configurações"
          description="Gerencie as preferências da sua conta e da sua organização"
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-1">
            <Card>
              <div className="p-0 divide-y divide-border">
                {settingsTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (tab.id === 'integracoes') {
                        navigate('/configuracoes/integracoes');
                      } else {
                        setActiveTab(tab.id as TabType);
                      }
                    }}
                    className={`w-full px-4 py-3 flex items-center gap-3 font-semibold text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'bg-accent-light/10 text-accent'
                        : 'text-text-secondary hover:bg-surface-secondary'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            </Card>
          </aside>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Geral */}
            {activeTab === 'geral' && (
              <Card>
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-text-primary mb-4">Informações da Conta</h3>
                    {meLoading ? (
                      <div className="flex justify-center py-8">
                        <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-text-secondary mb-2">
                            Nome Completo
                          </label>
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Seu nome"
                            className="w-full px-4 py-2 border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-text-secondary mb-2">
                            Email
                          </label>
                          <input
                            type="email"
                            value={meData?.email ?? ''}
                            readOnly
                            className="w-full px-4 py-2 border border-border rounded-lg text-text-secondary bg-surface-secondary cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-text-secondary mb-2">
                            Organização
                          </label>
                          <input
                            type="text"
                            value={tenantName}
                            onChange={(e) => setTenantName(e.target.value)}
                            placeholder="Nome da organização"
                            className="w-full px-4 py-2 border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border pt-6">
                    <h3 className="text-lg font-bold text-text-primary mb-4">Preferências</h3>
                    <div className="space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4" />
                        <span className="text-sm font-semibold text-text-primary">Modo Escuro</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4" />
                        <span className="text-sm font-semibold text-text-primary">Modo Compacto</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => {
                        setName(meData?.name ?? '');
                        setTenantName(meData?.tenantName ?? '');
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="primary"
                      size="md"
                      disabled={updateMeMutation.isPending}
                      onClick={() => updateMeMutation.mutate({ name, tenantName })}
                    >
                      {updateMeMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Notificações */}
            {activeTab === 'notificacoes' && (
              <Card>
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-text-primary mb-4">Preferências de Notificação</h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-surface-secondary transition-colors cursor-pointer">
                        <div>
                          <p className="font-semibold text-text-primary">Campanhas</p>
                          <p className="text-sm text-text-secondary">Notificações sobre campanhas ativas</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5" />
                      </label>
                      <label className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-surface-secondary transition-colors cursor-pointer">
                        <div>
                          <p className="font-semibold text-text-primary">Performance</p>
                          <p className="text-sm text-text-secondary">Alertas de performance e relatórios</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5" />
                      </label>
                      <label className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-surface-secondary transition-colors cursor-pointer">
                        <div>
                          <p className="font-semibold text-text-primary">Equipe</p>
                          <p className="text-sm text-text-secondary">Notificações da atividade da equipe</p>
                        </div>
                        <input type="checkbox" className="w-5 h-5" />
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    <Button variant="primary" size="md">
                      Salvar Preferências
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {/* Segurança */}
            {activeTab === 'seguranca' && (
              <Card>
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-text-primary mb-4">Segurança da Conta</h3>
                    <div className="space-y-4">
                      <div className="p-4 border border-border rounded-lg flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-text-primary">Alterar Senha</p>
                          <p className="text-sm text-text-secondary">Atualize sua senha regularmente</p>
                        </div>
                        <Button variant="outline" size="sm">
                          Alterar
                        </Button>
                      </div>
                      <div className="p-4 border border-border rounded-lg flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-text-primary">Autenticação de Dois Fatores</p>
                          <p className="text-sm text-text-secondary">Ative para maior segurança</p>
                        </div>
                        <Button variant="outline" size="sm">
                          Configurar
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border pt-6">
                    <h3 className="text-lg font-bold text-text-primary mb-4">Sessões Ativas</h3>
                    <div className="p-4 border border-border rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-text-primary">Sessão Atual</p>
                        <p className="text-sm text-text-secondary">Windows Chrome - Último acesso: agora</p>
                      </div>
                      <span className="text-xs font-bold text-success">Ativa</span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Equipe */}
            {activeTab === 'equipe' && (
              <Card>
                <div className="p-6 space-y-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-text-primary">Membros da Equipe</h3>
                    <Button variant="primary" size="sm">
                      + Convidar Membro
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 border border-border rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-text-primary">Mallyssa Silva</p>
                        <p className="text-sm text-text-secondary">mallyssa@example.com</p>
                      </div>
                      <span className="text-xs font-bold text-accent">Proprietário</span>
                    </div>
                    <div className="p-4 border border-border rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-text-primary">Ricardo Silva</p>
                        <p className="text-sm text-text-secondary">ricardo@example.com</p>
                      </div>
                      <span className="text-xs font-bold text-success">Admin</span>
                    </div>
                    <div className="p-4 border border-border rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-text-primary">Gabrielle Silva</p>
                        <p className="text-sm text-text-secondary">gabrielle@example.com</p>
                      </div>
                      <span className="text-xs font-bold text-text-secondary">Membro</span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* FURY Engine */}
            {activeTab === 'fury' && <FuryConfig />}

            {/* Faturamento */}
            {activeTab === 'faturamento' && (
              <>
                <Card>
                  <div className="p-6 space-y-6">
                    {subLoading ? (
                      <div className="flex justify-center py-8">
                        <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                      </div>
                    ) : !subscription ? (
                      /* No subscription */
                      <div className="text-center py-8 space-y-4">
                        <p className="text-lg font-semibold text-text-primary">Nenhuma assinatura ativa</p>
                        <p className="text-sm text-text-secondary">
                          Assine um plano para acessar todos os recursos da FURY.
                        </p>
                        <Button variant="primary" size="md" onClick={() => navigate('/assinatura')}>
                          Ver Planos
                        </Button>
                      </div>
                    ) : subscription.status === 'trial' ? (
                      /* Trial state */
                      <>
                        <div>
                          <h3 className="text-lg font-bold text-text-primary mb-4">Plano Atual</h3>
                          <div className="p-4 border border-amber-200 rounded-lg bg-amber-50 space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-text-secondary">Plano</span>
                              <span className="text-sm font-bold text-amber-700">Trial</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-text-secondary">Trial expira em</span>
                              <span className="text-sm font-bold text-text-primary">
                                {formatDate(subscription.trialEndsAt)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-4 border-t border-border">
                          <Button variant="primary" size="md" onClick={() => navigate('/assinatura')}>
                            Assinar um Plano
                          </Button>
                        </div>
                      </>
                    ) : subscription.status === 'cancelled' ? (
                      /* Cancelled state */
                      <div className="text-center py-8 space-y-4">
                        <p className="text-lg font-semibold text-text-primary">Assinatura cancelada</p>
                        <p className="text-sm text-text-secondary">
                          Sua assinatura foi cancelada. Reative para continuar usando a FURY.
                        </p>
                        <Button variant="primary" size="md" onClick={() => navigate('/assinatura')}>
                          Ver Planos
                        </Button>
                      </div>
                    ) : (
                      /* Active / past_due subscription */
                      <>
                        <div>
                          <h3 className="text-lg font-bold text-text-primary mb-4">Plano Atual</h3>
                          <div className="p-4 border border-border rounded-lg bg-surface-secondary space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-text-secondary">Plano</span>
                              <span className="text-sm font-bold text-text-primary">
                                {subscription.plan?.name ?? '—'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-text-secondary">Próxima Cobrança</span>
                              <span className="text-sm font-bold text-text-primary">
                                {formatDate(subscription.currentPeriodEnd)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-semibold text-text-secondary">Valor Mensal</span>
                              <span className="text-sm font-bold text-text-primary">
                                {subscription.plan ? formatCents(subscription.plan.priceCents) : '—'}
                              </span>
                            </div>
                            {subscription.status === 'past_due' && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-red-600">Status</span>
                                <span className="text-sm font-bold text-red-600">Pagamento em atraso</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-border">
                          <Button
                            variant="outline"
                            size="md"
                            onClick={() => setCancelOpen(true)}
                          >
                            Cancelar Plano
                          </Button>
                          <Button variant="primary" size="md" onClick={() => navigate('/assinatura')}>
                            Atualizar para Plano Pro
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </Card>

                {/* Cancel confirmation dialog */}
                <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Cancelar assinatura?</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-text-secondary">
                      Ao cancelar, você perderá acesso aos recursos premium ao final do período atual. Esta ação não pode ser desfeita.
                    </p>
                    <DialogFooter>
                      <Button variant="outline" size="md" onClick={() => setCancelOpen(false)}>
                        Manter Assinatura
                      </Button>
                      <Button
                        variant="primary"
                        size="md"
                        className="bg-red-600 hover:bg-red-700 border-red-600"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate()}
                      >
                        {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar Cancelamento'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
