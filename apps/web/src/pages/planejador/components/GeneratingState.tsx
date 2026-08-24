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
  'context',
  'research',
  'analytics',
  'strategy',
  'planner',
  'copywriter',
  'creative',
  'image-generation',
  'quality',
  'scheduler',
  'branding',
  'save',
];

const FALLBACK_LABELS: Record<string, string> = {
  context: 'Coletando contexto do seu negócio',
  research: 'Pesquisando tendências e datas comemorativas',
  analytics: 'Analisando melhores formatos e horários',
  strategy: 'Definindo estratégia e pilares de conteúdo',
  planner: 'Montando calendário de posts',
  copywriter: 'Escrevendo legendas e CTAs',
  creative: 'Criando prompts de imagem',
  'image-generation': 'Gerando imagens dos posts',
  quality: 'Validando qualidade do conteúdo',
  scheduler: 'Programando melhores horários de publicação',
  branding: 'Verificando compliance da marca',
  save: 'Salvando plano no banco',
};

const STAGE_TO_AGENT_KEY: Record<string, string> = {
  'Context Agent': 'context',
  'Research Agent': 'research',
  'Analytics Agent': 'analytics',
  'Strategy Agent': 'strategy',
  'Planner Agent': 'planner',
  'Copywriter Agent': 'copywriter',
  'Creative Agent': 'creative',
  'Image Generation Agent': 'image-generation',
  'Quality Agent': 'quality',
  'Scheduler Agent': 'scheduler',
  'Branding Agent': 'branding',
  'Salvar plano': 'save',
};

export function GeneratingState({ jobStatus, agentLabels }: GeneratingStateProps) {
  const order = agentLabels?.order ?? FALLBACK_ORDER;
  const labels = agentLabels?.labels ?? FALLBACK_LABELS;

  if (!jobStatus) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-3 text-gray-400">Iniciando pipeline...</span>
      </div>
    );
  }

  if (jobStatus.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-red-400">
        <AlertCircle className="h-12 w-12 mb-4" />
        <p className="text-lg font-semibold">Erro na geração</p>
        <p className="text-sm text-gray-500 mt-1">{jobStatus.error || 'Erro desconhecido'}</p>
      </div>
    );
  }

  // Mapeia o currentAgent do backend (ex: "Image Generation Agent") para a chave do order/labels
  const currentAgentKey = STAGE_TO_AGENT_KEY[jobStatus.currentAgent] ?? jobStatus.currentAgent;
  const currentLabel = labels[currentAgentKey] ?? jobStatus.currentAgent;

  return (
    <div className="space-y-3 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
        <span className="text-sm text-gray-300">
          {jobStatus.status === 'done' ? 'Pipeline concluído' : `Processando: ${currentLabel}`}
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
            <div key={key} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/50">
              {status === 'completed' && <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />}
              {status === 'running' && <Loader2 className="h-5 w-5 animate-spin text-blue-400 shrink-0" />}
              {status === 'failed' && <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />}
              {status === 'pending' && <div className="h-5 w-5 rounded-full border-2 border-gray-600 shrink-0" />}
              <span className={`text-sm ${status === 'completed' ? 'text-gray-300' : status === 'running' ? 'text-blue-300' : 'text-gray-500'}`}>
                {label}
              </span>
              {step?.pct !== undefined && (
                <div className="ml-auto w-24 h-1.5 rounded-full bg-gray-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
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
