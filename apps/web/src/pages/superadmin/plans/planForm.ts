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
  // funcionalidades que o cliente do plano não vê (forma crua)
  blockedViews: string[];
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
  if ([...draft.blockedViews].sort().join() !== [...orig.blockedViews].sort().join()) out.blockedViews = draft.blockedViews;
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

// ─── O que o cliente vê ───────────────────────────────

export interface PlanView {
  key: string;
  description: string;
  group: "ads" | "content";
  parent: string | null;
  // o ator já não tem: fica desligada e travada
  locked: boolean;
}

export const VIEW_GROUP_LABEL: Record<PlanView["group"], string> = { ads: "Anúncios", content: "Conteúdo" };

const parentOf = (views: PlanView[], key: string) => views.find((v) => v.key === key)?.parent ?? null;

export function viewVisible(blocked: string[], key: string, views: PlanView[]): boolean {
  const parent = parentOf(views, key);
  return !blocked.includes(key) && !(parent && blocked.includes(parent));
}

// liga/desliga; desligar o pai já leva as filhas
export function toggleView(blocked: string[], key: string, views: PlanView[]): string[] {
  if (blocked.includes(key)) return blocked.filter((k) => k !== key);
  return [...blocked.filter((k) => parentOf(views, k) !== key), key];
}

// combinam entre si, sem depender: só avisa
export const VIEW_PAIRS: Record<string, { other: string; text: string }> = {
  planner: { other: "calendar", text: "Combina com o Calendário: os posts gerados aparecem e são agendados lá." },
  calendar: { other: "planner", text: "Combina com o Planejador: é ele quem gera os posts do calendário." },
};

export function blockedSummary(count: number): string {
  if (count === 0) return "Tudo liberado";
  return `${count} funcionalidade${count > 1 ? "s" : ""} bloqueada${count > 1 ? "s" : ""}`;
}
