import type { LucideIcon } from "lucide-react";
import { isValidGeo, regionLabel } from "@/components/campaign-wizard/types";
import { statusLabel } from "../subscriptionLabels";

export interface SectionItem<K extends string> {
  key: K;
  label: string;
  icon: LucideIcon;
  line1: string;
  line2: string;
  swatches?: string[];
}

interface SectionNavProps<K extends string> {
  items: SectionItem<K>[];
  active: K;
  onSelect: (key: K) => void;
}

// Cards de seção no lugar das abas
export function SectionNav<K extends string>({ items, active, onSelect }: SectionNavProps<K>) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
      {items.map((item) => {
        const on = item.key === active;
        const Icon = item.icon;
        const summaryId = `section-${item.key}-summary`;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            aria-label={item.label}
            aria-describedby={summaryId}
            aria-pressed={on}
            className={`ady-btn min-w-0 text-left rounded-2xl p-4 flex flex-col gap-2.5 transition-all ${
              on
                ? "gradient-teal shadow-lg"
                : "bg-admin-surface border border-admin-border hover:border-admin-petrol hover:-translate-y-0.5"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                on ? "bg-white/20" : "bg-admin-petrol/10 text-[#17708A] dark:text-[#1E88A8]"
              }`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className={`text-base font-bold ${on ? "" : "text-admin-text"}`}>{item.label}</div>
            <div id={summaryId} className="min-w-0 space-y-0.5">
              <div className={`text-[13px] font-semibold break-words ${on ? "" : "text-admin-text"}`}>
                {item.line1}
              </div>
              <div className={`text-xs break-words flex flex-wrap items-center gap-1.5 ${on ? "opacity-90" : "text-admin-text-muted"}`}>
                {item.swatches?.map((c) => (
                  <div
                    key={c}
                    aria-hidden="true"
                    className="w-3.5 h-3.5 rounded border border-black/20"
                    style={{ background: c }}
                  />
                ))}
                {item.line2}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

type Option = { value: string; label: string };

export interface SummarySource {
  users: { role: string }[];
  subscription: { status: string; plan: { name: string } | null } | null;
  furyConfig: { targetRoas: string; targetCpa: string } | null;
  goals: { objective: string; monthlyBudget: number } | null;
  audienceDefaults: { city?: string; ageMin?: number; ageMax?: number; gender?: string; geo?: unknown } | null;
  brandKit: { voiceTone: string; primaryColor: string; secondaryColor: string; photoUrls: string[] } | null;
}

export interface SummaryLabels {
  objectives: Option[];
  genders: Option[];
  tones: Option[];
}

export type SectionSummary = { line1: string; line2: string; swatches?: string[] };

const labelOf = (list: Option[], v?: string) => list.find((o) => o.value === v)?.label ?? "";
const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function locationSummary(a: SummarySource["audienceDefaults"]): string {
  const geo = a?.geo;
  if (isValidGeo(geo)) {
    if (geo.mode === "points") return geo.points.length ? `${geo.points.length} pontos no mapa` : "Sem localização";
    if (geo.regions.length) return geo.regions.map((r) => regionLabel(r, geo.regionType)).join(" · ");
  }
  return a?.city || "Sem localização";
}

// Resumo de cada card a partir dos dados salvos
export function buildSectionSummaries(
  data: SummarySource,
  { isSuperAdmin, maxMembers, labels }: { isSuperAdmin: boolean; maxMembers: number; labels: SummaryLabels },
) {
  const members = data.users.filter((u) => u.role === "member").length;
  const sub = data.subscription;
  const cfg = data.furyConfig;
  const goals = data.goals;
  const aud = data.audienceDefaults;
  const brand = data.brandKit;
  const summaries: Record<"users" | "subscription" | "config" | "metas" | "publico" | "brandkit", SectionSummary> = {
    users: {
      line1: `${data.users.length} usuários`,
      line2: isSuperAdmin ? "Sem limite de vagas" : `Vagas: ${members} de ${maxMembers}`,
    },
    subscription: sub
      ? { line1: sub.plan?.name ?? "Sem plano", line2: `Status: ${statusLabel(sub.status)}` }
      : { line1: "Sem assinatura", line2: "Configure um plano" },
    config: cfg && (cfg.targetRoas || cfg.targetCpa)
      ? { line1: `ROAS ${cfg.targetRoas || "—"}x`, line2: `CPA R$ ${cfg.targetCpa ? brl(Number(cfg.targetCpa)) : "—"}` }
      : { line1: "Não configurado", line2: "Defina ROAS e CPA" },
    metas: goals
      ? { line1: labelOf(labels.objectives, goals.objective) || "Sem objetivo", line2: `R$ ${brl(goals.monthlyBudget || 0)}/mês` }
      : { line1: "Não definido", line2: "Defina objetivo e orçamento" },
    publico: {
      line1: `${aud?.ageMin ?? 18} até ${aud?.ageMax ?? 65} · ${labelOf(labels.genders, aud?.gender ?? "all")}`,
      line2: locationSummary(aud),
    },
    brandkit: {
      line1: labelOf(labels.tones, brand?.voiceTone) || "Sem tom de voz",
      line2: `${brand?.photoUrls.length ?? 0} fotos`,
      swatches: brand ? [brand.primaryColor, brand.secondaryColor] : undefined,
    },
  };
  return summaries;
}
