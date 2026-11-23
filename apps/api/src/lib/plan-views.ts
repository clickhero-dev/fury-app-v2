import { AppError } from '../middleware/errorHandler.js';
import { PLAN_BLOCKABLE_VIEWS, PLAN_BLOCKABLE_VIEW_KEYS, RBAC_VIEWS, type PlanViewGroup } from './rbac-views.js';

const parentOf = (key: string): string | null => PLAN_BLOCKABLE_VIEWS.find((v) => v.key === key)?.parent ?? null;

// o que o ator pode ligar/desligar: tudo menos o que ele mesmo já não tem
export function configurablePlanViews(actorBlocked: readonly string[]): string[] {
  return PLAN_BLOCKABLE_VIEW_KEYS.filter((k) => !actorBlocked.includes(k));
}

// sem duplicata e sem filho de pai já bloqueado
export function normalizePlanViews(keys: readonly string[]): string[] {
  const set = new Set(keys);
  return PLAN_BLOCKABLE_VIEW_KEYS.filter((k) => set.has(k) && !(parentOf(k) && set.has(parentOf(k)!)));
}

// só funcionalidades bloqueáveis; o que muda precisa estar ao alcance do ator
export function validatePlanViews(requested: readonly string[], configurable: readonly string[], current: readonly string[] = []): string[] {
  const invalid = requested.filter((k) => !PLAN_BLOCKABLE_VIEW_KEYS.includes(k));
  if (invalid.length) throw new AppError(400, 'INVALID_PLAN_VIEW', `Funcionalidade inválida: ${invalid.join(', ')}`);
  const next = normalizePlanViews(requested);
  // marcações antigas que saíram da lista (ex.: planner) são descartadas
  current = current.filter((k) => PLAN_BLOCKABLE_VIEW_KEYS.includes(k));
  const changed = [...next.filter((k) => !current.includes(k)), ...current.filter((k) => !next.includes(k))];
  const outOfReach = changed.filter((k) => !configurable.includes(k));
  if (outOfReach.length)
    throw new AppError(400, 'INVALID_PLAN_VIEW', `Funcionalidade fora do seu acesso: ${outOfReach.join(', ')}`);
  return next;
}

export interface ConfigurablePlanView {
  key: string;
  description: string;
  group: PlanViewGroup;
  parent: string | null;
  locked: boolean;
}

// lista para o modal do plano
export function describePlanViews(configurable: readonly string[]): ConfigurablePlanView[] {
  return PLAN_BLOCKABLE_VIEWS.map((v) => ({
    key: v.key,
    description: RBAC_VIEWS.find((r) => r.key === v.key)?.description ?? v.key,
    group: v.group,
    parent: v.parent,
    locked: !configurable.includes(v.key),
  }));
}
