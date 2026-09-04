/**
 * Helpers puros do Planejador (histórico + pós-conclusão).
 * Sem dependências de UI/API — testáveis em ambiente node.
 */

export interface HistoryPlanRow {
  id: string;
  title: string;
  postCount: number;
  status: string;
  createdAt?: string;
}

export interface HistoryDisplayRow {
  id: string;
  title: string;
  dateLabel: string;
  postCount: number;
  statusLabel: string;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-09-05" (ou ISO completo) → "05 set 2026"; vazio/inválido → "—". Timezone-free. */
export function formatPlanDate(iso?: string): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return '—';
  const [, y, m, d] = match;
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** Status legível do plano (campaignPlans.status). */
export function planStatusLabel(status: string): string {
  if (status === 'draft') return 'Rascunho';
  if (status === 'active') return 'Ativo';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Converte a lista da API (plano + postCount) em linhas de exibição do histórico. */
export function buildHistoryRows(plans: HistoryPlanRow[]): HistoryDisplayRow[] {
  return plans.map((p) => ({
    id: p.id,
    title: p.title || 'Plano sem título',
    dateLabel: formatPlanDate(p.createdAt),
    postCount: p.postCount,
    statusLabel: planStatusLabel(p.status),
  }));
}

/**
 * Payload do POST /planner/generate. NUNCA omitir `postsCount`: sem body a API
 * assume 8 e o usuário que escolheu 1 vira 8 posts. A API valida 1–100.
 */
export function generatePayload(postsCount?: number): { postsCount: number } {
  return { postsCount: postsCount ?? 8 };
}

/**
 * Watchdog do polling do job: desiste após `maxMs` sem mudança de estado
 * (status de espera: generating/running/pending). Ponto de verdade do FRONT —
 * a API pode travar (imagem que nunca completa) e o usuário não pode ficar
 * preso na tela "gerando..." para sempre sem reiniciar nada.
 */
export function shouldGiveUpPolling(
  status: string | undefined,
  startedAt: number,
  now: number,
  maxMs = 25 * 60 * 1000
): boolean {
  if (!status || !startedAt) return false;
  if (status === 'done' || status === 'error') return false;
  const waiting = ['pending', 'running', 'generating'].includes(status);
  return waiting && now - startedAt > maxMs;
}

/**
 * Decide se a tela "Recuperando planejamento..." deve segurar a página.
 * Só tem sentido enquanto um job salvo está sendo recuperado (recovered) e a
 * geração ainda está ativa (view 'generating'). Quando o job terminou
 * (view 'review'/'idle'), NUNCA pode bloquear — senão, após DONE/ERROR, o
 * jobId é limpo e a query do job fica disabled (isFetched=false) → tela de
 * recuperação para sempre.
 */
export function shouldShowRecoveryScreen(args: {
  recovered: boolean;
  isFetched: boolean;
  view: string;
}): boolean {
  return args.recovered && !args.isFetched && args.view === 'generating';
}