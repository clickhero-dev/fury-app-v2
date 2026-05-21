import { useState, useEffect } from 'react';
import { Button, Card, Input } from '@/components';
import type { FuryRule, CreateFuryRulePayload } from '@/hooks/useFuryRules';

interface FuryRuleDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CreateFuryRulePayload) => Promise<void>;
  rule?: FuryRule;
  isPending?: boolean;
}

const METRICS = [
  { value: 'cpc', label: 'CPC (Custo por Clique)' },
  { value: 'ctr', label: 'CTR (Taxa de Cliques)' },
  { value: 'roas', label: 'ROAS (Retorno sobre Anúncios)' },
  { value: 'cpa', label: 'CPA (Custo por Aquisição)' },
  { value: 'spend', label: 'Spend (Gasto)' },
];

const OPERATORS = [
  { value: 'gt', label: 'Maior que (>)' },
  { value: 'lt', label: 'Menor que (<)' },
  { value: 'eq', label: 'Igual (=)' },
];

const ACTIONS = [
  { value: 'pause_campaign', label: 'Pausar Campanha' },
  { value: 'reduce_budget', label: 'Reduzir Orçamento' },
  { value: 'notify', label: 'Notificar' },
  { value: 'increase_budget', label: 'Aumentar Orçamento' },
];

export function FuryRuleDialog({
  isOpen,
  onClose,
  onSave,
  rule,
  isPending = false,
}: FuryRuleDialogProps) {
  const [form, setForm] = useState<CreateFuryRulePayload>({
    name: '',
    conditionField: 'roas',
    conditionOperator: 'gt',
    conditionValue: 0,
    action: 'pause_campaign',
    isActive: true,
  });

  useEffect(() => {
    if (rule) {
      setForm({
        name: rule.name,
        conditionField: rule.conditionField,
        conditionOperator: rule.conditionOperator,
        conditionValue: parseFloat(rule.conditionValue),
        action: rule.action,
        actionValue: rule.actionValue ? parseFloat(rule.actionValue) : undefined,
        isActive: rule.isActive,
      });
    } else {
      setForm({
        name: '',
        conditionField: 'roas',
        conditionOperator: 'gt',
        conditionValue: 0,
        action: 'pause_campaign',
        isActive: true,
      });
    }
  }, [rule, isOpen]);

  const handleSave = async () => {
    try {
      await onSave(form);
      onClose();
    } catch (error) {
      console.error('Error saving rule:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <div className="p-6">
          <h2 className="text-lg font-bold text-text-primary mb-6">
            {rule ? 'Editar Regra' : 'Nova Regra'}
          </h2>

          <div className="space-y-4">
            {/* Nome */}
            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">
                Nome da Regra
              </label>
              <Input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Pausar campanhas com ROAS baixo"
              />
            </div>

            {/* Condição */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-text-secondary">
                Se
              </label>
              <div className="flex gap-2">
                {/* Métrica */}
                <select
                  value={form.conditionField}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      conditionField: e.target.value as CreateFuryRulePayload['conditionField'],
                    })
                  }
                  className="flex-1 px-4 py-3.5 border border-[#E0E0E0] rounded-xl bg-white text-[#1C1C1E] focus:outline-none focus:border-[#E8631A] focus:ring-1 focus:ring-[#E8631A]/20 text-sm"
                >
                  {METRICS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>

                {/* Operador */}
                <select
                  value={form.conditionOperator}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      conditionOperator: e.target.value as CreateFuryRulePayload['conditionOperator'],
                    })
                  }
                  className="w-32 px-4 py-3.5 border border-[#E0E0E0] rounded-xl bg-white text-[#1C1C1E] focus:outline-none focus:border-[#E8631A] focus:ring-1 focus:ring-[#E8631A]/20 text-sm"
                >
                  {OPERATORS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {/* Valor */}
                <Input
                  type="number"
                  value={form.conditionValue}
                  onChange={(e) =>
                    setForm({ ...form, conditionValue: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="0"
                  className="w-24"
                />
              </div>
            </div>

            {/* Ação */}
            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">
                Então
              </label>
              <select
                value={form.action}
                onChange={(e) =>
                  setForm({
                    ...form,
                    action: e.target.value as CreateFuryRulePayload['action'],
                  })
                }
                className="w-full px-4 py-3.5 border border-[#E0E0E0] rounded-xl bg-white text-[#1C1C1E] focus:outline-none focus:border-[#E8631A] focus:ring-1 focus:ring-[#E8631A]/20 text-sm"
              >
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="w-4 h-4 rounded cursor-pointer"
              />
              <label htmlFor="isActive" className="text-sm font-semibold text-text-secondary cursor-pointer">
                Ativar regra
              </label>
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-3 justify-end mt-6">
            <Button variant="ghost" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={isPending}>
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
