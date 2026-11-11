import { Clapperboard, Film, Image as ImageIcon, Pencil, Trash2, WandSparkles, type LucideIcon } from "lucide-react";
import { INTERVAL_LABEL, formatCents, limitText, tierBadge, type LimitKey, type PlanDraft } from "./planForm";

export const LIMIT_FIELDS: { key: LimitKey; label: string; icon: LucideIcon }[] = [
  { key: "creativesPerMonth", label: "Criativos por mês", icon: ImageIcon },
  { key: "modificationsPerCreative", label: "Modificações por criativo", icon: WandSparkles },
  { key: "videosPerMonth", label: "Vídeos por mês", icon: Clapperboard },
  { key: "modificationsPerVideo", label: "Modificações por vídeo", icon: Film },
];

interface PlanCardProps {
  plan: PlanDraft;
  subscriberCount?: number;
  // prévia do modal: sem rodapé
  preview?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}

// Card de um plano na listagem
export function PlanCard({ plan, subscriberCount = 0, preview, onEdit, onDelete, disabled }: PlanCardProps) {
  const tier = tierBadge(plan.name);
  return (
    <article
      aria-label={preview ? "Prévia do plano" : plan.name}
      className={`bg-admin-surface border border-admin-border rounded-2xl p-5 flex flex-col gap-4 min-w-0 transition-colors ${
        preview ? "shadow-lg" : "hover:border-admin-petrol/40"
      } ${plan.isActive ? "" : "opacity-80"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={`px-3 py-1 rounded-full text-xs font-semibold ${tier.cls}`}>{tier.label}</div>
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
            plan.isActive ? "bg-success/15 text-success" : "bg-admin-surface-2 text-admin-text-faint"
          }`}
        >
          <div aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-current" />
          {plan.isActive ? "Ativo" : "Inativo"}
        </div>
      </div>

      <div className="min-w-0">
        <h3 className="text-lg font-bold text-admin-text break-words">{plan.name || "Nome do plano"}</h3>
        <div className="flex flex-wrap items-baseline gap-1.5">
          <div className="text-2xl font-bold text-admin-text tabular-nums">R$ {formatCents(plan.priceCents)}</div>
          <div className="text-sm text-admin-text-muted">{INTERVAL_LABEL[plan.interval] ?? plan.interval}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {LIMIT_FIELDS.map(({ key, label, icon: Icon }) => {
          const text = limitText(key, plan.limits[key]);
          const soft = Number.isNaN(Number(text));
          return (
            <div key={key} className="bg-admin-surface-2 rounded-xl px-3 py-2.5 min-w-0">
              <div className="flex items-center gap-1.5 text-[11.5px] text-admin-text-muted">
                <Icon aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-[#17708A] dark:text-[#1E88A8]" />
                {label}
              </div>
              <div className={`text-[15px] font-bold tabular-nums ${soft ? "text-admin-text-faint" : "text-admin-text"}`}>{text}</div>
            </div>
          );
        })}
      </div>

      {!preview && (
        <>
          <div className={`text-xs font-semibold ${subscriberCount > 0 ? "text-[#B55F02] dark:text-spark" : "text-admin-text-faint"}`}>
            {subscriberCount} assinante{subscriberCount !== 1 ? "s" : ""}
          </div>
          <div className="flex items-center gap-2 border-t border-admin-border pt-3">
            <button
              type="button"
              onClick={onEdit}
              disabled={disabled}
              className="ady-btn flex-1 bg-brand/10 hover:bg-brand/20 border border-brand/20 text-[#17708A] dark:text-[#1E88A8] disabled:opacity-30 rounded-full text-sm font-semibold transition-colors px-4 py-2 flex items-center justify-center gap-2"
            >
              <Pencil className="w-4 h-4" /> Editar
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={disabled}
              title="Deletar plano"
              aria-label="Deletar plano"
              className="ady-btn bg-error/15 hover:bg-error/25 disabled:opacity-30 text-error px-3 py-2 rounded-full text-sm transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </article>
  );
}
