import { useState, useEffect } from 'react';
import { useFuryConfig, useUpdateFuryConfig } from '@/hooks/useFuryConfig';
import { Card, Button } from '@/components';

// ──────────────────────────────────────────────
// Preview score (client-side replica of scoring logic)
// ──────────────────────────────────────────────

const EXAMPLE_METRICS = {
  roas: 3.5,
  cpa: 55,
  ctr: 2.4,
  spend: 820,
  budget: 1000,
};

function calcPreviewScore(config: {
  targetRoas: number;
  targetCpa: number;
  targetCtr: number;
  targetBudgetUtilization: number;
}): number {
  const roasScore = Math.min(EXAMPLE_METRICS.roas / config.targetRoas, 1) * 40;
  const ctrScore = Math.min(EXAMPLE_METRICS.ctr / config.targetCtr, 1) * 30;
  const cpaScore = EXAMPLE_METRICS.cpa > 0 ? Math.max(0, Math.min(config.targetCpa / EXAMPLE_METRICS.cpa, 1)) * 20 : 0;

  const utilizationPct = (EXAMPLE_METRICS.spend / EXAMPLE_METRICS.budget) * 100;
  const diff = Math.abs(utilizationPct - config.targetBudgetUtilization);
  const utilizationScore = diff <= 10 ? 10 : diff <= 20 ? 5 : 0;

  return Math.round(roasScore + ctrScore + cpaScore + utilizationScore);
}

function getGradeLabel(score: number): { grade: string; color: string } {
  if (score >= 90) return { grade: 'A', color: 'text-green-700' };
  if (score >= 75) return { grade: 'B', color: 'text-blue-600' };
  if (score >= 60) return { grade: 'C', color: 'text-yellow-700' };
  if (score >= 40) return { grade: 'D', color: 'text-orange-600' };
  return { grade: 'F', color: 'text-red-600' };
}

// ──────────────────────────────────────────────
// Tooltip
// ──────────────────────────────────────────────

function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="w-4 h-4 rounded-full bg-surface-secondary text-text-secondary text-xs font-bold flex items-center justify-center leading-none"
        aria-label="Ajuda"
      >
        ?
      </button>
      {show && (
        <span className="absolute left-6 top-0 z-50 w-56 rounded-lg border border-border bg-surface-secondary p-3 text-xs text-text-secondary shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────

export function FuryConfig() {
  const { data: config, isLoading } = useFuryConfig();
  const { mutate: updateConfig, isPending, isSuccess, isError } = useUpdateFuryConfig();

  const [targetRoas, setTargetRoas] = useState('4.00');
  const [targetCpa, setTargetCpa] = useState('50.00');
  const [targetCtr, setTargetCtr] = useState('3.00');
  const [targetBudgetUtilization, setTargetBudgetUtilization] = useState(80);

  useEffect(() => {
    if (config) {
      setTargetRoas(config.targetRoas);
      setTargetCpa(config.targetCpa);
      setTargetCtr(config.targetCtr);
      setTargetBudgetUtilization(parseFloat(config.targetBudgetUtilization));
    }
  }, [config]);

  const previewScore = calcPreviewScore({
    targetRoas: parseFloat(targetRoas) || 4,
    targetCpa: parseFloat(targetCpa) || 50,
    targetCtr: parseFloat(targetCtr) || 3,
    targetBudgetUtilization,
  });
  const { grade, color } = getGradeLabel(previewScore);

  function handleSave() {
    updateConfig({
      targetRoas: parseFloat(targetRoas),
      targetCpa: parseFloat(targetCpa),
      targetCtr: parseFloat(targetCtr),
      targetBudgetUtilization,
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-text-secondary text-sm">
        Carregando configurações…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-text-primary mb-1">Benchmarks de Performance</h3>
            <p className="text-sm text-text-secondary">
              Defina as metas que o FURY usa para calcular o score (0–100) de cada campanha.
            </p>
          </div>

          <div className="space-y-5">
            {/* ROAS */}
            <div>
              <label className="flex items-center text-sm font-semibold text-text-secondary mb-2">
                Meta de ROAS
                <Tooltip text="Retorno sobre investimento em anúncios. Um ROAS igual ou acima da meta vale 40 pts no score." />
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={targetRoas}
                  onChange={(e) => setTargetRoas(e.target.value)}
                  className="w-32 px-4 py-2 border border-border rounded-lg text-text-primary bg-transparent focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <span className="text-text-secondary text-sm">x</span>
                <span className="text-xs text-text-secondary">Ex: 4.0x significa R$4 de retorno para cada R$1 investido</span>
              </div>
            </div>

            {/* CPA */}
            <div>
              <label className="flex items-center text-sm font-semibold text-text-secondary mb-2">
                Meta de CPA
                <Tooltip text="Custo por aquisição/conversão. CPAs abaixo da meta valem até 20 pts. Quanto menor o CPA real, melhor." />
              </label>
              <div className="flex items-center gap-3">
                <span className="text-text-secondary text-sm">R$</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={targetCpa}
                  onChange={(e) => setTargetCpa(e.target.value)}
                  className="w-32 px-4 py-2 border border-border rounded-lg text-text-primary bg-transparent focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <span className="text-xs text-text-secondary">Custo máximo aceitável por conversão</span>
              </div>
            </div>

            {/* CTR */}
            <div>
              <label className="flex items-center text-sm font-semibold text-text-secondary mb-2">
                Meta de CTR
                <Tooltip text="Taxa de cliques. Um CTR igual ou acima da meta vale 30 pts. Média de mercado: 1–3%." />
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={targetCtr}
                  onChange={(e) => setTargetCtr(e.target.value)}
                  className="w-32 px-4 py-2 border border-border rounded-lg text-text-primary bg-transparent focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <span className="text-text-secondary text-sm">%</span>
                <span className="text-xs text-text-secondary">Percentual de cliques sobre impressões</span>
              </div>
            </div>

            {/* Budget utilization */}
            <div>
              <label className="flex items-center text-sm font-semibold text-text-secondary mb-2">
                Utilização de budget alvo
                <Tooltip text="Percentual ideal do orçamento diário a ser utilizado. Estar ±10% da meta vale 10 pts; ±20% vale 5 pts." />
              </label>
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={targetBudgetUtilization}
                    onChange={(e) => setTargetBudgetUtilization(Number(e.target.value))}
                    className="flex-1 accent-accent"
                  />
                  <span className="w-14 text-right text-text-primary font-bold text-sm">
                    {targetBudgetUtilization}%
                  </span>
                </div>
                <p className="text-xs text-text-secondary">
                  Score cheio se spend estiver entre {Math.max(0, targetBudgetUtilization - 10)}% e {Math.min(100, targetBudgetUtilization + 10)}% do orçamento
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Score preview */}
      <Card>
        <div className="p-6">
          <h3 className="text-sm font-semibold text-text-secondary mb-4">
            Preview do score — campanha de exemplo
          </h3>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center gap-1">
              <span className={`text-5xl font-black ${color}`}>{grade}</span>
              <span className="text-xs text-text-secondary">Nota</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 bg-surface-secondary rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${previewScore}%`,
                      background: previewScore >= 75 ? '#22c55e' : previewScore >= 60 ? '#eab308' : '#ef4444',
                    }}
                  />
                </div>
                <span className="text-2xl font-bold text-text-primary w-14 text-right">{previewScore}</span>
              </div>
              <p className="text-xs text-text-secondary">
                Métricas do exemplo: ROAS {EXAMPLE_METRICS.roas}x · CPA R${EXAMPLE_METRICS.cpa} · CTR {EXAMPLE_METRICS.ctr}% · Budget {Math.round((EXAMPLE_METRICS.spend / EXAMPLE_METRICS.budget) * 100)}% utilizado
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Feedback & actions */}
      {isSuccess && (
        <div className="px-4 py-3 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm font-semibold">
          Configurações salvas com sucesso.
        </div>
      )}
      {isError && (
        <div className="px-4 py-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm font-semibold">
          Erro ao salvar. Verifique os valores e tente novamente.
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="primary" size="md" onClick={handleSave} disabled={isPending}>
          {isPending ? 'Salvando…' : 'Salvar configurações'}
        </Button>
      </div>
    </div>
  );
}
