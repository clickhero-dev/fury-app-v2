import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package, Plus } from "lucide-react";
import api from "@/lib/api";
import { errorMessage } from "@/lib/error-message";
import { formatBRL } from "./adminDashboard.utils";
import { PartnerPlanFormModal, type PartnerPlan, type PlanView } from "./PartnerPlanFormModal";

const btnCls = "ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors px-5 py-2.5";

// Planos de parceiro (pacote de pagamento único), só super_admin
export function PartnerPlansPage() {
  const [plans, setPlans] = useState<PartnerPlan[]>([]);
  const [views, setViews] = useState<PlanView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<PartnerPlan | "new" | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const [p, v] = await Promise.all([api.get("/admin/partner-plans"), api.get("/admin/partner-plans/views")]);
      setPlans(p.data.data);
      setViews(v.data.data);
      setLoadError("");
    } catch (err) {
      setLoadError(errorMessage(err, "Não foi possível carregar os planos de parceiro"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const label = (key: string) => views.find((v) => v.key === key)?.description ?? key;

  if (loading) return <div className="text-text-tertiary text-sm">Carregando...</div>;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/admin/parceiros" className="text-xs text-[#17708A] dark:text-[#1E88A8] hover:underline">← Parceiros</Link>
        <div className="flex flex-wrap items-end justify-between gap-4 mt-1">
          <div className="flex items-center gap-3">
            <div className="w-[38px] h-[38px] rounded-[10px] bg-brand/10 border border-brand/20 flex items-center justify-center text-[#17708A] dark:text-[#1E88A8]">
              <Package className="w-[18px] h-[18px]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Planos de parceiro</h1>
              <div className="text-sm text-text-secondary">Pacotes de pagamento único: vagas e telas que o parceiro recebe na compra.</div>
            </div>
          </div>
          <button type="button" className={`${btnCls} flex items-center gap-2`} onClick={() => { setMsg(""); setEditing("new"); }}>
            <Plus className="w-4 h-4" strokeWidth={2.5} /> Novo plano
          </button>
        </div>
      </div>

      {msg && <div role="status" className="text-sm text-text-primary">{msg}</div>}
      {loadError && (
        <div className="space-y-3">
          <div role="alert" className="text-sm text-error">{loadError}</div>
          <button type="button" className={btnCls} onClick={() => { setLoading(true); load(); }}>Tentar novamente</button>
        </div>
      )}

      {!loadError && plans.length === 0 && (
        <div className="bg-surface border border-border rounded-2xl p-5 text-sm text-text-primary">Nenhum plano de parceiro cadastrado ainda.</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className="bg-surface border border-border rounded-2xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-lg font-bold text-text-primary">{p.name}</div>
              <div className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.isActive ? "bg-success/10 text-success" : "bg-surface-secondary text-text-secondary"}`}>
                {p.isActive ? "Ativo" : "Inativo"}
              </div>
            </div>
            <div className="text-2xl font-bold text-text-primary">{formatBRL(p.priceCents)}</div>
            <div className="text-xs text-text-secondary">Pagamento único</div>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-text-secondary">Vagas de clientes</dt><dd className="font-semibold text-text-primary">{p.maxTenants}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-text-secondary">Parceiros com este plano</dt><dd className="font-semibold text-text-primary">{p.partnersCount}</dd></div>
              <div>
                <dt className="text-text-secondary">Telas fora do plano</dt>
                <dd className="text-text-primary">{p.blockedViews.length ? p.blockedViews.map(label).join(", ") : "Nenhuma: tudo liberado"}</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => { setMsg(""); setEditing(p); }}
              className="ady-btn w-full px-3.5 py-2 rounded-full border border-border-light bg-surface-secondary text-text-primary hover:border-brand/50 font-semibold transition-colors text-sm"
            >
              Editar
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <PartnerPlanFormModal
          plan={editing === "new" ? null : editing}
          views={views}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            const created = editing === "new";
            setEditing(null);
            await load();
            setMsg(created ? "Plano criado" : "Plano salvo");
          }}
        />
      )}
    </div>
  );
}
