import { useState } from "react";
import { X } from "lucide-react";
import api from "@/lib/api";
import { errorMessage } from "@/lib/error-message";
import { parseBRLToCents } from "./adminDashboard.utils";
import { parentViewKey } from "@/lib/rbac-views";

export interface PartnerPlan {
  id: string;
  name: string;
  priceCents: number;
  maxTenants: number;
  isActive: boolean;
  blockedViews: string[];
  partnersCount: number;
}

export interface PlanView {
  key: string;
  description: string;
}

const inputCls =
  "w-full bg-admin-bg border border-admin-border rounded-xl px-3 py-2.5 text-sm text-admin-text focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const btnCls = "ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors px-5 py-2.5";

// centavos → "2.499,90" para o campo de preço
export function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// pai bloqueado leva os filhos (mesma regra da API, inclui Clientes sob Campanhas)
function parentOf(key: string, blocked: string[]) {
  const parent = parentViewKey(key);
  return parent && blocked.includes(parent) ? parent : blocked.find((b) => key.startsWith(b + "."));
}

// Criar/editar plano de parceiro: preço único, vagas e telas liberadas
export function PartnerPlanFormModal({
  plan,
  views,
  onClose,
  onSaved,
}: {
  plan: PartnerPlan | null;
  views: PlanView[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState(plan ? centsToInput(plan.priceCents) : "");
  const [maxTenants, setMaxTenants] = useState(String(plan?.maxTenants ?? 5));
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);
  const [blocked, setBlocked] = useState<string[]>(plan?.blockedViews ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggle(key: string) {
    setBlocked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur.filter((k) => !k.startsWith(key + ".") && parentViewKey(k) !== key), key]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const priceCents = parseBRLToCents(price);
    if (!name.trim()) return setError("Informe o nome do plano.");
    if (priceCents === null) return setError("Informe o preço em reais, por exemplo 2.499,90.");
    const slots = Number(maxTenants);
    // campo vazio não vira 0 sem querer
    if (maxTenants.trim() === "" || !Number.isInteger(slots) || slots < 0) return setError("Informe as vagas com um número inteiro, 0 ou mais.");
    setSaving(true);
    setError("");
    const body = { name: name.trim(), priceCents, maxTenants: slots, isActive, blockedViews: blocked };
    try {
      if (plan) await api.patch(`/admin/partner-plans/${plan.id}`, body);
      else await api.post("/admin/partner-plans", body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível salvar o plano"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={plan ? "Editar plano de parceiro" : "Novo plano de parceiro"}
        className="bg-admin-surface border border-admin-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <form className="ady-form-plain p-6 space-y-4" onSubmit={submit}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-admin-text">{plan ? "Editar plano de parceiro" : "Novo plano de parceiro"}</h2>
            <button type="button" aria-label="Fechar" onClick={onClose} className="ady-btn text-admin-text-faint hover:text-admin-text transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {plan && plan.partnersCount > 0 && (
            <div className="text-xs text-text-secondary bg-brand/10 rounded-xl px-4 py-3">
              Mudanças valem só para parceiros novos. Os {plan.partnersCount} parceiro(s) que já compraram mantêm o que compraram.
            </div>
          )}

          <label className="block space-y-1.5">
            <div className="text-xs font-medium text-text-secondary">Nome do plano</div>
            <input className={inputCls} maxLength={255} placeholder="Ex.: Parceiro Ouro" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="grid gap-4 grid-cols-2">
            <label className="block space-y-1.5">
              <div className="text-xs font-medium text-text-secondary">Preço único (R$)</div>
              <input inputMode="decimal" className={inputCls} placeholder="2.499,90" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <label className="block space-y-1.5">
              <div className="text-xs font-medium text-text-secondary">Vagas de clientes</div>
              <input type="number" min={0} className={inputCls} value={maxTenants} onChange={(e) => setMaxTenants(e.target.value)} />
            </label>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Telas liberadas</div>
            <div className="text-xs text-text-secondary">Desligado = o parceiro e os clientes dele não veem nem usam.</div>
            <ul className="border border-admin-border rounded-xl divide-y divide-admin-border">
              {views.map((v) => {
                const parent = parentOf(v.key, blocked);
                const on = !blocked.includes(v.key) && !parent;
                return (
                  <li key={v.key} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <div className={parentViewKey(v.key) ? "pl-4" : ""}>
                      <div className="text-sm text-text-primary">{v.description}</div>
                      {parent && <div className="text-xs text-text-tertiary">Bloqueado junto com {views.find((p) => p.key === parent)?.description}</div>}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={v.description}
                      disabled={!!parent}
                      onClick={() => toggle(v.key)}
                      className={`ady-btn relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-brand" : "bg-border-light"}`}
                    >
                      <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          <label className="flex items-center gap-2 text-sm text-text-primary">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <div>Ativo (pode ser escolhido para parceiros novos)</div>
          </label>

          {error && <div role="alert" className="text-sm text-error bg-error/10 border border-error/30 rounded-xl px-3 py-2.5">{error}</div>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="ady-btn bg-surface-secondary text-text-primary border border-border-light hover:border-brand/50 rounded-full text-sm font-semibold transition-colors px-5 py-2.5">
              Cancelar
            </button>
            <button type="submit" className={btnCls} disabled={saving}>
              {saving ? "Salvando..." : plan ? "Salvar" : "Criar plano"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
