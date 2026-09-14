import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import type { JobStatus } from '../types';

interface AgentLabels {
  order: string[];
  labels: Record<string, string>;
}

interface GeneratingStateProps {
  jobStatus: JobStatus | null;
  agentLabels?: AgentLabels;
}

// Fallback hardcoded para compatibilidade caso a API falhe
const FALLBACK_ORDER = [
  'prerequisites',
  'context',
  'planner',
  'image-generation',
  'save',
];

const FALLBACK_LABELS: Record<string, string> = {
  prerequisites: 'Checando pré-requisitos e disponibilidade do gerador',
  context: 'Coletando contexto da sua empresa',
  planner: 'Criando os posts do calendário',
  'image-generation': 'Gerando as imagens dos posts',
  save: 'Salvando no calendário',
};

const STAGE_TO_AGENT_KEY: Record<string, string> = {
  'Prerequisites Agent': 'prerequisites',
  'Context Agent': 'context',
  'Planner Agent': 'planner',
  'Image Generation Agent': 'image-generation',
  'Salvar plano': 'save',
};

export function GeneratingState({ jobStatus, agentLabels }: GeneratingStateProps) {
  const order = agentLabels?.order ?? FALLBACK_ORDER;
  const labels = agentLabels?.labels ?? FALLBACK_LABELS;

  if (!jobStatus) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <span className="ml-3 text-text-tertiary">Iniciando pipeline...</span>
      </div>
    );
  }

  if (jobStatus.state === 'ERROR') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-error">
        <AlertCircle className="h-12 w-12 mb-4" />
        <p className="text-lg font-semibold">Erro na geração</p>
        <p className="text-sm text-text-secondary mt-1">{jobStatus.error || 'Erro desconhecido'}</p>
      </div>
    );
  }

  // Mapeia o currentAgent do backend (ex: "Image Generation Agent") para a chave do order/labels
  const currentAgentKey = STAGE_TO_AGENT_KEY[jobStatus.currentAgent] ?? jobStatus.currentAgent;
  const currentLabel = labels[currentAgentKey] ?? jobStatus.currentAgent;

  return (
    <div className="space-y-3 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Loader2 className="h-5 w-5 animate-spin text-brand" />
        <span className="text-sm text-text-secondary">
          {jobStatus.state === 'DONE' ? 'Pipeline concluído' : `Processando: ${currentLabel}`}
        </span>
      </div>
      <div className="grid gap-2">
        {order.map((key) => {
          const label = labels[key] ?? key;
          // Mapeia a chave do order para o nome do agente no agentProgress
          const agentName = Object.entries(STAGE_TO_AGENT_KEY).find(([, v]) => v === key)?.[0] ?? key;
          const step = jobStatus.agentProgress.find(s => s.name === agentName);
          const status = step?.status ?? 'pending';
          return (
            <div key={key} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface">
              {status === 'completed' && <CheckCircle className="h-5 w-5 text-success shrink-0" />}
              {status === 'running' && <Loader2 className="h-5 w-5 animate-spin text-brand shrink-0" />}
              {status === 'failed' && <AlertCircle className="h-5 w-5 text-error shrink-0" />}
              {status === 'pending' && <div className="h-5 w-5 rounded-full border-2 border-border shrink-0" />}
              <span className={`text-sm ${status === 'completed' ? 'text-text-secondary' : status === 'running' ? 'text-brand' : 'text-text-tertiary'}`}>
                {label}
              </span>
              {step?.pct !== undefined && (
                <div className="ml-auto w-24 h-1.5 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all duration-500"
                    style={{ width: `${step.pct}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
