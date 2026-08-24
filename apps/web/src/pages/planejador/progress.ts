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

/**
 * Calcula o progresso geral do pipeline com base nos steps.
 *
 * O backend envia `pct` cumulativos (5 → 15 → 25 → … → 100), mas em
 * retries (ex.: Copywriter reexecutado após Quality falhar) o pct de
 * um agente volta a um valor menor, o que faria a barra regredir.
 *
 * Estratégia: retorna o maior `pct` entre os steps que estão
 * `running` — ou, se nenhum estiver running, o maior `pct` entre os
 * `completed`. Isso garante monotonicidade (nunca regredir) e reflete
 * corretamente qual agente está ativo no momento.
 */
export function overallProgress(steps: AgentStep[]): number {
  if (steps.length === 0) return 0;

  const running = steps.filter((s) => s.status === 'running');
  if (running.length > 0) {
    return Math.min(100, Math.max(0, ...running.map((s) => s.pct)));
  }

  const completed = steps.filter((s) => s.status === 'completed');
  if (completed.length > 0) {
    return Math.min(100, Math.max(0, ...completed.map((s) => s.pct)));
  }

  return 0;
}
