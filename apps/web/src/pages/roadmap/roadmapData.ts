/**
 * Roadmap do Ady — dados da linha do tempo.
 *
 * Mantido em linguagem simples (não-técnica) para que qualquer pessoa,
 * inclusive usuários finais, entenda a evolução e o futuro da ferramenta.
 *
 * Editar apenas a lista abaixo — o layout se adapta sozinho.
 */

export type MilestoneStatus = 'done' | 'active' | 'planned';

export interface Milestone {
  /** Período exibido no cabeçalho (ex: "Abr 2026"). */
  period: string;
  /** Título curto do capítulo/marco. */
  title: string;
  /** Frase em linguagem simples do que você ganha. */
  summary: string;
  /** Fala fictícia que traduz a entrega. */
  quote?: string;
  /** Lista de ganhos práticos para o usuário. */
  gains: string[];
  /** Estado do marco. */
  status: MilestoneStatus;
  /** Marca o capítulo mais recente / momento atual. */
  current?: boolean;
}

/**
 * Não há ainda uma fonte de verdade de produto aprovada para publicar marcos.
 * O estado vazio é intencional: evita transformar hipóteses em promessas públicas.
 */
export const roadmap: Milestone[] = [];

export interface RoadmapSummary {
  done: number;
  active: number;
  planned: number;
}

export function getRoadmapSummary(items: Milestone[]): RoadmapSummary {
  return items.reduce<RoadmapSummary>(
    (summary, item) => ({ ...summary, [item.status]: summary[item.status] + 1 }),
    { done: 0, active: 0, planned: 0 },
  );
}

export function validateRoadmap(items: Milestone[]): string[] {
  const errors: string[] = [];
  const summary = getRoadmapSummary(items);
  const currentCount = items.filter((item) => item.current).length;
  const duplicateKeys = new Set<string>();
  const hasDuplicate = items.some((item) => {
    const key = `${item.period}:${item.title}`;
    if (duplicateKeys.has(key)) return true;
    duplicateKeys.add(key);
    return false;
  });

  if (summary.active > 1) errors.push('O roadmap pode ter no máximo um marco em andamento.');
  if (currentCount !== summary.active) errors.push('O marco atual deve ser o único marco em andamento.');
  if (hasDuplicate) errors.push('Os marcos do roadmap não podem ser duplicados.');

  return errors;
}

export const summaryCards = (items: Milestone[] = roadmap) => {
  const summary = getRoadmapSummary(items);
  return [
    { label: 'Já entregue', value: summary.done, status: 'done' as const, description: `${summary.done} capítulo${summary.done === 1 ? '' : 's'} concluído${summary.done === 1 ? '' : 's'} na trajetória do Ady` },
    { label: 'Em andamento', value: summary.active, status: 'active' as const, description: `${summary.active} capítulo${summary.active === 1 ? '' : 's'} atual${summary.active === 1 ? '' : 'is'}` },
    { label: 'A caminho', value: summary.planned, status: 'planned' as const, description: `${summary.planned} capítulo${summary.planned === 1 ? '' : 's'} a caminho` },
  ];
};
