import { useState } from 'react';
import { AppLayout, PageHeader, Button, Card, Input } from '@/components';
import { useSaveAutomationRules, type AutomationRules } from '@/hooks/useSaveAutomationRules';

export function RegrasCampanhas() {
  const [rules, setRules] = useState<AutomationRules>({
    pauseLowRoas: true,
    pauseLowRoasThreshold: 1.5,
    pauseNoConversions: true,
    pauseNoConversionsSpending: 100,
  });

  const saveRulesMutation = useSaveAutomationRules();

  const handleToggle = (key: 'pauseLowRoas' | 'pauseNoConversions') => {
    setRules((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleInputChange = (key: string, value: number) => {
    setRules((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    try {
      await saveRulesMutation.mutateAsync(rules);
      alert('Regras salvas com sucesso!');
    } catch (error) {
      alert('Erro ao salvar regras. Tente novamente.');
      console.error('Save rules error:', error);
    }
  };

  return (
    <AppLayout
      header={
        <h2 className="text-lg font-bold text-text-primary">Regras de Automação</h2>
      }
    >
      <div className="space-y-8">
        <PageHeader
          title="Regras de Automação"
          description="Configure regras automáticas para gerenciar suas campanhas"
        />

        {/* Pausar com ROAS Baixo */}
        <Card>
          <div className="p-6 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-text-primary">Pausar com ROAS Baixo</h3>
                  <p className="text-sm text-text-secondary mt-1">
                    Pausa automaticamente campanhas quando o retorno sobre investimento cai muito
                  </p>
                </div>
                <button
                  onClick={() => handleToggle('pauseLowRoas')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    rules.pauseLowRoas ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      rules.pauseLowRoas ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {rules.pauseLowRoas && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-text-primary">
                    Pausar se ROAS abaixo de
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={rules.pauseLowRoasThreshold}
                      onChange={(e) =>
                        handleInputChange('pauseLowRoasThreshold', parseFloat(e.target.value))
                      }
                      min="0.1"
                      step="0.1"
                      placeholder="1.5"
                      className="flex-1"
                    />
                    <span className="text-text-primary font-medium">x</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Pausar sem Conversões */}
        <Card>
          <div className="p-6 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-text-primary">Pausar sem Conversões</h3>
                  <p className="text-sm text-text-secondary mt-1">
                    Pausa automaticamente campanhas que gastar sem gerar conversões
                  </p>
                </div>
                <button
                  onClick={() => handleToggle('pauseNoConversions')}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    rules.pauseNoConversions ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      rules.pauseNoConversions ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {rules.pauseNoConversions && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-text-primary">
                    Pausar se gastar R$ sem conversão
                  </label>
                  <Input
                    type="number"
                    value={rules.pauseNoConversionsSpending}
                    onChange={(e) =>
                      handleInputChange('pauseNoConversionsSpending', parseFloat(e.target.value))
                    }
                    min="1"
                    step="1"
                    placeholder="100.00"
                  />
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Botões de Ação */}
        <div className="flex justify-end gap-3">
          <Button variant="outline" size="md">
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSave}
            disabled={saveRulesMutation.isPending}
          >
            {saveRulesMutation.isPending ? 'Salvando...' : 'Salvar Regras'}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
