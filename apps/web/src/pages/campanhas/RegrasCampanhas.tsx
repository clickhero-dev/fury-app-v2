import { useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSaveAutomationRules, type AutomationRules } from '@/hooks/useSaveAutomationRules';

export function RegrasCampanhas() {
  const [rules, setRules] = useState<AutomationRules>({
    pauseLowRoas: true,
    pauseLowRoasThreshold: 1.5,
    pauseNoConversions: true,
    pauseNoConversionsSpending: 100,
  });

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
      [key]: isNaN(value) ? 0 : value,
    }));
  };

  const handleSave = async () => {
    setFeedback(null);
    try {
      await saveRulesMutation.mutateAsync(rules);
      setFeedback({ type: 'success', message: 'Regras salvas com sucesso!' });
    } catch (error) {
      console.error('Save rules error:', error);
      setFeedback({ type: 'error', message: 'Erro ao salvar regras. Tente novamente.' });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Banner de Feedback */}
      {feedback && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm border ${
            feedback.type === 'success'
              ? 'bg-success-light border-success/20 text-success'
              : 'bg-error-light border-error/20 text-error'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span className="flex-1 font-medium">{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Regra 1: Pausar com ROAS Baixo */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-text-primary">Pausar com ROAS Baixo</h3>
            <p className="text-xs text-text-tertiary">
              Pausa automaticamente campanhas quando o retorno sobre investimento cai abaixo do limite estipulado.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleToggle('pauseLowRoas')}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
              rules.pauseLowRoas ? 'bg-brand' : 'bg-surface-secondary'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-text-primary transition-transform ${
                rules.pauseLowRoas ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {rules.pauseLowRoas && (
          <div className="pt-2 space-y-2 border-t border-border">
            <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              Pausar se ROAS estiver abaixo de
            </label>
            <div className="flex items-center gap-3 max-w-xs">
              <input
                type="number"
                value={rules.pauseLowRoasThreshold}
                onChange={(e) =>
                  handleInputChange('pauseLowRoasThreshold', parseFloat(e.target.value))
                }
                min="0.1"
                step="0.1"
                placeholder="1.5"
                className="w-full bg-background border border-border-light rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-brand transition-colors"
              />
              <span className="text-sm font-semibold text-text-primary">x</span>
            </div>
          </div>
        )}
      </div>

      {/* Regra 2: Pausar sem Conversões */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-text-primary">Pausar sem Conversões</h3>
            <p className="text-xs text-text-tertiary">
              Pausa automaticamente campanhas que atingirem determinado valor de gasto sem gerar clientes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleToggle('pauseNoConversions')}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
              rules.pauseNoConversions ? 'bg-brand' : 'bg-surface-secondary'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-text-primary transition-transform ${
                rules.pauseNoConversions ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {rules.pauseNoConversions && (
          <div className="pt-2 space-y-2 border-t border-border">
            <label className="block text-xs font-semibold text-text-tertiary uppercase tracking-wider">
              Pausar se gastar sem conversão
            </label>
            <div className="flex items-center gap-3 max-w-xs">
              <span className="text-sm font-semibold text-text-tertiary">R$</span>
              <input
                type="number"
                value={rules.pauseNoConversionsSpending}
                onChange={(e) =>
                  handleInputChange('pauseNoConversionsSpending', parseFloat(e.target.value))
                }
                min="1"
                step="1"
                placeholder="100.00"
                className="w-full bg-background border border-border-light rounded-xl px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-brand transition-colors"
              />
            </div>
          </div>
        )}
      </div>

      {/* Botões de Ação */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => {
            setRules({
              pauseLowRoas: true,
              pauseLowRoasThreshold: 1.5,
              pauseNoConversions: true,
              pauseNoConversionsSpending: 100,
            });
            setFeedback(null);
          }}
          className="px-5 py-2.5 text-xs font-semibold text-text-tertiary hover:text-text-primary rounded-full transition-colors cursor-pointer"
        >
          Restaurar Padrão
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saveRulesMutation.isPending}
          className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-text-primary bg-brand hover:bg-brand-hover rounded-full transition-all shadow-lg hover:shadow-brand/20 disabled:opacity-50 cursor-pointer"
        >
          {saveRulesMutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar Regras'
          )}
        </button>
      </div>
    </div>
  );
}