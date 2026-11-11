export interface PlanLimits {
  creativesPerMonth: number | null;
  modificationsPerCreative: number | null;
  // vídeo: chave ausente vale 0 (vídeo desligado no plano)
  videosPerMonth?: number | null;
  modificationsPerVideo?: number | null;
}

export type Interval = "monthly" | "yearly";

export interface PlanDraft {
  name: string;
  priceCents: number;
  interval: string;
  isActive: boolean;
  limits: PlanLimits;
}

export type LimitKey = keyof PlanLimits;
export type LimitMode = "none" | "qty" | "off";

export const EMPTY_LIMITS: PlanLimits = { creativesPerMonth: null, modificationsPerCreative: null, videosPerMonth: 0, modificationsPerVideo: 0 };

export const INTERVAL_LABEL: Record<string, string> = { monthly: "Mensal", yearly: "Anual" };

// Menor quantidade aceita pela API em cada limite
export const LIMIT_MIN: Record<LimitKey, number> = {
  creativesPerMonth: 0,
  modificationsPerCreative: 1,
  videosPerMonth: 1,
  modificationsPerVideo: 0,
};

const MAX_CENTS = 99_999_999;

// Dígitos digitados viram centavos
export function centsFromInput(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return Math.min(MAX_CENTS, parseInt(digits || "0", 10));
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Vídeo ausente vale 0, como na tela antiga
export function normalizeLimits(l: Partial<PlanLimits> | null | undefined): PlanLimits {
  return {
    creativesPerMonth: l?.creativesPerMonth ?? null,
    modificationsPerCreative: l?.modificationsPerCreative ?? null,
    videosPerMonth: l?.videosPerMonth === undefined ? 0 : l.videosPerMonth,
    modificationsPerVideo: l?.modificationsPerVideo === undefined ? 0 : l.modificationsPerVideo,
  };
}

export function limitMode(key: LimitKey, value: number | null | undefined): LimitMode {
  if (value === null) return "none";
  if (key === "videosPerMonth" && !value) return "off";
  return "qty";
}

export function applyLimitMode(limits: PlanLimits, key: LimitKey, mode: LimitMode): PlanLimits {
  const current = limits[key];
  // mesmo modo: mantém o valor
  if (limitMode(key, current) === mode) return limits;
  const qty = typeof current === "number" && current >= LIMIT_MIN[key] && current > 0 ? current : Math.max(LIMIT_MIN[key], key === "videosPerMonth" ? 5 : 10);
  const next: PlanLimits = { ...limits, [key]: mode === "none" ? null : mode === "off" ? 0 : qty };
  // sem vídeo não sobra modificação de vídeo
  if (key === "videosPerMonth" && mode === "off") next.modificationsPerVideo = 0;
  return next;
}

export function setLimitQty(limits: PlanLimits, key: LimitKey, value: number): PlanLimits {
  return { ...limits, [key]: Math.max(LIMIT_MIN[key], Math.floor(value) || 0) };
}

export function limitText(key: LimitKey, value: number | null | undefined): string {
  if (value === null) return "Sem limite";
  if (key === "videosPerMonth" && !value) return "Sem vídeo";
  return String(value ?? 0);
}

// Só os campos alterados vão no PATCH
export function planChanges(orig: PlanDraft, draft: PlanDraft): Partial<PlanDraft> {
  const out: Partial<PlanDraft> = {};
  if (draft.name !== orig.name) out.name = draft.name;
  if (draft.priceCents !== orig.priceCents) out.priceCents = draft.priceCents;
  if (draft.interval !== orig.interval) out.interval = draft.interval;
  if (draft.isActive !== orig.isActive) out.isActive = draft.isActive;
  if (JSON.stringify(draft.limits) !== JSON.stringify(orig.limits)) out.limits = draft.limits;
  return out;
}

// Preço zero só segue se o plano já era gratuito (Trial)
export function validateDraft(draft: PlanDraft, orig?: PlanDraft): { name?: string; price?: string } {
  const errors: { name?: string; price?: string } = {};
  if (!draft.name.trim()) errors.name = "Informe o nome do plano.";
  if (draft.priceCents <= 0 && (!orig || orig.priceCents > 0)) errors.price = "O preço precisa ser maior que zero.";
  return errors;
}

export function tierBadge(name: string): { label: string; cls: string } {
  const u = name.trim().toUpperCase();
  if (u === "STARTER") return { label: "BÁSICO", cls: "bg-surface-secondary text-text-secondary" };
  if (u === "PRO") return { label: "INTERMEDIÁRIO", cls: "bg-brand/15 text-[#17708A] dark:text-[#1E88A8]" };
  if (u === "ENTERPRISE") return { label: "EMPRESARIAL", cls: "bg-spark/15 text-[#B55F02] dark:text-spark" };
  return { label: name.trim() || "Novo plano", cls: "bg-surface-secondary text-text-secondary" };
}
