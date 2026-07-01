import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout, Button, Card } from '@/components';
import { FuryConfig } from './FuryConfig';
import { IntegracoesContent } from './IntegracoesContent';
import { useSubscription, useCancelSubscription } from '@/hooks/useBilling';
import { useTheme } from '@/hooks/useTheme';
import api from '@/lib/api';
import { MetasPage } from '../onboarding/MetasPage';
import { MinhasRegrasContent } from '../automacao/MinhasRegras';
import { PublicoContent } from './PublicoContent';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { ConfiguracoesTabsNav } from './ConfiguracoesTabsNav';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

type TabType = 'geral' | 'notificacoes' | 'seguranca' | 'equipe' | 'faturamento' | 'integracoes' | 'fury' | 'metas' | 'automacao' | 'publico';

const VALID_TABS: TabType[] = ['geral', 'notificacoes', 'seguranca', 'equipe', 'faturamento', 'integracoes', 'fury', 'metas', 'automacao', 'publico'];

interface NotificationPrefs {
  campanhas: boolean;
  performance: boolean;
  equipe: boolean;
}

interface MeResponse {
  id: string;
  name: string | null;
  email: string;
  tenantName: string;
  role: string;
  tenantId: string;
  notificationPrefs: NotificationPrefs;
}

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
        'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-semibold text-white',
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

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

  // ── Aba Notificações ─────────────────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    campanhas: true,
    performance: true,
    equipe: false,
  });

  useEffect(() => {
    if (meData?.notificationPrefs) {
      setNotifPrefs(meData.notificationPrefs);
    }
  }, [meData]);

  const saveNotifMutation = useMutation({
    mutationFn: async (prefs: NotificationPrefs) => {
      await api.patch('/auth/me', { notificationPrefs: prefs });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      showToast('Preferências salvas com sucesso!', 'success');
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

  return (
    <AppLayout
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary">Configurações</h2>
        </div>
      }
    >
      {toast && <Toast message={toast.message} type={toast.type} />}

      <ConfiguracoesTabsNav activeTab={activeTab} />

      <Tabs value={activeTab} onValueChange={setTab}>
          {/* Geral */}
          <TabsContent value="geral">
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
                      <input
                        type="checkbox"
                        checked={isDark}
                        onChange={(e) => setDark(e.target.checked)}
                        className="w-4 h-4"
                      />
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
          </TabsContent>

          {/* Notificações */}
          <TabsContent value="notificacoes">
            <Card>
              <div className="p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-text-primary mb-4">Preferências de Notificação</h3>
                  {meLoading ? (
                    <div className="flex justify-center py-8">
                      <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(
                        [
                          { key: 'campanhas', label: 'Campanhas', desc: 'Notificações sobre campanhas ativas' },
                          { key: 'performance', label: 'Performance', desc: 'Alertas de performance e relatórios' },
                          { key: 'equipe', label: 'Equipe', desc: 'Notificações da atividade da equipe' },
                        ] as const
                      ).map(({ key, label, desc }) => (
                        <label
                          key={key}
                          className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-surface-secondary transition-colors cursor-pointer"
                        >
                          <div>
                            <p className="font-semibold text-text-primary">{label}</p>
                            <p className="text-sm text-text-secondary">{desc}</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={notifPrefs[key]}
                            onChange={(e) =>
                              setNotifPrefs((prev) => ({ ...prev, [key]: e.target.checked }))
                            }
                            className="w-5 h-5"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <Button
                    variant="primary"
                    size="md"
                    disabled={saveNotifMutation.isPending}
                    onClick={() => saveNotifMutation.mutate(notifPrefs)}
                  >
                    {saveNotifMutation.isPending ? 'Salvando...' : 'Salvar Preferências'}
                  </Button>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Segurança */}
          <TabsContent value="seguranca">
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
                      <Button variant="outline" size="sm">Alterar</Button>
                    </div>
                    <div className="p-4 border border-border rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-text-primary">Autenticação de Dois Fatores</p>
                        <p className="text-sm text-text-secondary">Ative para maior segurança</p>
                      </div>
                      <Button variant="outline" size="sm">Configurar</Button>
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
          </TabsContent>

          {/* Equipe */}
          <TabsContent value="equipe">
            <Card>
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-text-primary">Membros da Equipe</h3>
                  <Button variant="primary" size="sm">+ Convidar Membro</Button>
                </div>

                <div className="space-y-3">
                  {[
                    { name: 'Mallyssa Silva', email: 'mallyssa@example.com', role: 'Proprietário', color: 'text-accent' },
                    { name: 'Ricardo Silva', email: 'ricardo@example.com', role: 'Admin', color: 'text-success' },
                    { name: 'Gabrielle Silva', email: 'gabrielle@example.com', role: 'Membro', color: 'text-text-secondary' },
                  ].map(({ name: n, email, role, color }) => (
                    <div key={email} className="p-4 border border-border rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-text-primary">{n}</p>
                        <p className="text-sm text-text-secondary">{email}</p>
                      </div>
                      <span className={`text-xs font-bold ${color}`}>{role}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Faturamento */}
          <TabsContent value="faturamento">
            <Card>
              <div className="p-6 space-y-6">
                {subLoading ? (
                  <div className="flex justify-center py-8">
                    <span className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                  </div>
                ) : !subscription ? (
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
                      <Button variant="outline" size="md" onClick={() => setCancelOpen(true)}>
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
          </TabsContent>

          {/* Integrações */}
          <TabsContent value="integracoes">
            <Card>
              <div className="p-6">
                <IntegracoesContent />
              </div>
            </Card>
          </TabsContent>

          {/* FURY Engine */}
          <TabsContent value="fury">
            <FuryConfig />
          </TabsContent>

          {/* Metas */}
          <TabsContent value="metas">
            <MetasPage />
          </TabsContent>

          {/* Automação — movido da leftbar para cá */}
          <TabsContent value="automacao">
            <Card>
              <div className="p-6">
                <MinhasRegrasContent />
              </div>
            </Card>
          </TabsContent>

          {/* Público — público-alvo padrão para campanhas */}
          <TabsContent value="publico">
            <PublicoContent />
          </TabsContent>
        </Tabs>
    </AppLayout>
  );
}
