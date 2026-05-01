import { useState } from 'react';
import { AppLayout, PageHeader, Button, Card } from '@/components';

type TabType = 'geral' | 'notificacoes' | 'seguranca' | 'equipe' | 'faturamento';

interface SettingSection {
  id: TabType;
  label: string;
  icon: React.ReactNode;
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

export function Configuracoes() {
  const [activeTab, setActiveTab] = useState<TabType>('geral');

  const settingsTabs: SettingSection[] = [
    { id: 'geral', label: 'Geral', icon: cogIcon },
    { id: 'notificacoes', label: 'Notificações', icon: bellIcon },
    { id: 'seguranca', label: 'Segurança', icon: shieldIcon },
    { id: 'equipe', label: 'Equipe', icon: userIcon },
    { id: 'faturamento', label: 'Faturamento', icon: creditCardIcon },
  ];

  return (
    <AppLayout
      header={
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#1C1C1E]">Configurações</h2>
        </div>
      }
    >
      <div className="space-y-8">
        <PageHeader
          title="Configurações"
          description="Gerencie as preferências da sua conta e da sua organização"
        />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-1">
            <Card>
              <div className="p-0 divide-y divide-[#E0E0E0]">
                {settingsTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full px-4 py-3 flex items-center gap-3 font-semibold text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'bg-[#E8631A]/10 text-[#E8631A]'
                        : 'text-[#6E7681] hover:bg-[#F6F8FA]'
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
                    <h3 className="text-lg font-bold text-[#1C1C1E] mb-4">Informações da Conta</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-semibold text-[#6E7681] mb-2">
                          Nome Completo
                        </label>
                        <input
                          type="text"
                          defaultValue="Mallyssa Silva"
                          className="w-full px-4 py-2 border border-[#E0E0E0] rounded-lg text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#E8631A]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#6E7681] mb-2">
                          Email
                        </label>
                        <input
                          type="email"
                          defaultValue="mallyssa@example.com"
                          className="w-full px-4 py-2 border border-[#E0E0E0] rounded-lg text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#E8631A]"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-[#6E7681] mb-2">
                          Organização
                        </label>
                        <input
                          type="text"
                          defaultValue="FURY"
                          className="w-full px-4 py-2 border border-[#E0E0E0] rounded-lg text-[#1C1C1E] focus:outline-none focus:ring-2 focus:ring-[#E8631A]"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#E0E0E0] pt-6">
                    <h3 className="text-lg font-bold text-[#1C1C1E] mb-4">Preferências</h3>
                    <div className="space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4" />
                        <span className="text-sm font-semibold text-[#1C1C1E]">Modo Escuro</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" defaultChecked className="w-4 h-4" />
                        <span className="text-sm font-semibold text-[#1C1C1E]">Modo Compacto</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-[#E0E0E0]">
                    <Button variant="outline" size="md">
                      Cancelar
                    </Button>
                    <Button variant="primary" size="md">
                      Salvar Alterações
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
                    <h3 className="text-lg font-bold text-[#1C1C1E] mb-4">Preferências de Notificação</h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between p-4 border border-[#E0E0E0] rounded-lg hover:bg-[#F6F8FA] transition-colors cursor-pointer">
                        <div>
                          <p className="font-semibold text-[#1C1C1E]">Campanhas</p>
                          <p className="text-sm text-[#6E7681]">Notificações sobre campanhas ativas</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5" />
                      </label>
                      <label className="flex items-center justify-between p-4 border border-[#E0E0E0] rounded-lg hover:bg-[#F6F8FA] transition-colors cursor-pointer">
                        <div>
                          <p className="font-semibold text-[#1C1C1E]">Performance</p>
                          <p className="text-sm text-[#6E7681]">Alertas de performance e relatórios</p>
                        </div>
                        <input type="checkbox" defaultChecked className="w-5 h-5" />
                      </label>
                      <label className="flex items-center justify-between p-4 border border-[#E0E0E0] rounded-lg hover:bg-[#F6F8FA] transition-colors cursor-pointer">
                        <div>
                          <p className="font-semibold text-[#1C1C1E]">Equipe</p>
                          <p className="text-sm text-[#6E7681]">Notificações da atividade da equipe</p>
                        </div>
                        <input type="checkbox" className="w-5 h-5" />
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-[#E0E0E0]">
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
                    <h3 className="text-lg font-bold text-[#1C1C1E] mb-4">Segurança da Conta</h3>
                    <div className="space-y-4">
                      <div className="p-4 border border-[#E0E0E0] rounded-lg flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-[#1C1C1E]">Alterar Senha</p>
                          <p className="text-sm text-[#6E7681]">Atualize sua senha regularmente</p>
                        </div>
                        <Button variant="outline" size="sm">
                          Alterar
                        </Button>
                      </div>
                      <div className="p-4 border border-[#E0E0E0] rounded-lg flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-[#1C1C1E]">Autenticação de Dois Fatores</p>
                          <p className="text-sm text-[#6E7681]">Ative para maior segurança</p>
                        </div>
                        <Button variant="outline" size="sm">
                          Configurar
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#E0E0E0] pt-6">
                    <h3 className="text-lg font-bold text-[#1C1C1E] mb-4">Sessões Ativas</h3>
                    <div className="p-4 border border-[#E0E0E0] rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[#1C1C1E]">Sessão Atual</p>
                        <p className="text-sm text-[#6E7681]">Windows Chrome - Último acesso: agora</p>
                      </div>
                      <span className="text-xs font-bold text-[#2EA043]">Ativa</span>
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
                    <h3 className="text-lg font-bold text-[#1C1C1E]">Membros da Equipe</h3>
                    <Button variant="primary" size="sm">
                      + Convidar Membro
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 border border-[#E0E0E0] rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[#1C1C1E]">Mallyssa Silva</p>
                        <p className="text-sm text-[#6E7681]">mallyssa@example.com</p>
                      </div>
                      <span className="text-xs font-bold text-[#E8631A]">Proprietário</span>
                    </div>
                    <div className="p-4 border border-[#E0E0E0] rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[#1C1C1E]">Ricardo Silva</p>
                        <p className="text-sm text-[#6E7681]">ricardo@example.com</p>
                      </div>
                      <span className="text-xs font-bold text-[#2EA043]">Admin</span>
                    </div>
                    <div className="p-4 border border-[#E0E0E0] rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[#1C1C1E]">Gabrielle Silva</p>
                        <p className="text-sm text-[#6E7681]">gabrielle@example.com</p>
                      </div>
                      <span className="text-xs font-bold text-[#6E7681]">Membro</span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Faturamento */}
            {activeTab === 'faturamento' && (
              <Card>
                <div className="p-6 space-y-6">
                  <div>
                    <h3 className="text-lg font-bold text-[#1C1C1E] mb-4">Plano Atual</h3>
                    <div className="p-4 border border-[#E0E0E0] rounded-lg bg-[#F6F8FA] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#6E7681]">Plano</span>
                        <span className="text-sm font-bold text-[#1C1C1E]">Premium</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#6E7681]">Próxima Cobrança</span>
                        <span className="text-sm font-bold text-[#1C1C1E]">15 de Junho, 2026</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#6E7681]">Valor Mensal</span>
                        <span className="text-sm font-bold text-[#1C1C1E]">R$ 299,00</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#E0E0E0] pt-6">
                    <h3 className="text-lg font-bold text-[#1C1C1E] mb-4">Método de Pagamento</h3>
                    <div className="p-4 border border-[#E0E0E0] rounded-lg flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-[#1C1C1E]">Cartão de Crédito</p>
                        <p className="text-sm text-[#6E7681]">****  ****  ****  4242</p>
                      </div>
                      <Button variant="outline" size="sm">
                        Alterar
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-[#E0E0E0]">
                    <Button variant="outline" size="md">
                      Cancelar Plano
                    </Button>
                    <Button variant="primary" size="md">
                      Atualizar para Plano Pro
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
