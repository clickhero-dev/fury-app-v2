import type { AgentStep } from './types';

const STAGE_LABELS: Record<string, string> = {
  'Context Agent': 'Coletando dados da sua empresa…',
  'Research Agent': 'Pesquisando tendências e datas…',
  'Analytics Agent': 'Analisando suas métricas…',
  'Strategy Agent': 'Definindo estratégia de conteúdo…',
  'Planner Agent': 'Planejando os posts do mês…',
  'Copywriter Agent': 'Escrevendo os conteúdos…',
  'Creative Agent': 'Criando sugestões de artes…',
  'Quality Agent': 'Revisando a qualidade…',
  'Scheduler Agent': 'Agendando no calendário…',
  'Branding Agent': 'Validando com a marca…',
  'Pipeline concluído': 'Planejamento concluído',
};

const FALLBACK_LABEL = 'Preparando seu conteúdo…';

export function stageLabel(currentAgent: string): string {
  return STAGE_LABELS[currentAgent] ?? FALLBACK_LABEL;
}

export function overallProgress(steps: AgentStep[]): number {
  const max = steps.reduce((acc, s) => Math.max(acc, s.pct), 0);
  return Math.min(100, Math.max(0, max));
}