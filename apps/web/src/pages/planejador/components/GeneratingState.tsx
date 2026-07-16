import { CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import type { JobStatus } from '../types';

interface GeneratingStateProps {
  jobStatus: JobStatus | null;
}

export function GeneratingState({ jobStatus }: GeneratingStateProps) {
  const agents = [
    'Context Agent', 'Research Agent', 'Analytics Agent',
    'Strategy Agent', 'Planner Agent', 'Copywriter Agent',
    'Creative Agent', 'Quality Agent', 'Scheduler Agent', 'Branding Agent',
  ];

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

  return (
    <div className="space-y-3 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
        <span className="text-sm text-gray-300">
          {jobStatus.status === 'done' ? 'Pipeline concluído' : `Processando: ${jobStatus.currentAgent}`}
        </span>
      </div>
      <div className="grid gap-2">
        {agents.map(name => {
          const step = jobStatus.agentProgress.find(s => s.name === name);
          const status = step?.status ?? 'pending';
          return (
            <div key={name} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/50">
              {status === 'completed' && <CheckCircle className="h-5 w-5 text-green-400 shrink-0" />}
              {status === 'running' && <Loader2 className="h-5 w-5 animate-spin text-blue-400 shrink-0" />}
              {status === 'failed' && <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />}
              {status === 'pending' && <div className="h-5 w-5 rounded-full border-2 border-gray-600 shrink-0" />}
              <span className={`text-sm ${status === 'completed' ? 'text-gray-300' : status === 'running' ? 'text-blue-300' : 'text-gray-500'}`}>
                {name}
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
