import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import api from "@/lib/api";
import { errorMessage } from "@/lib/error-message";
import { apiMessage, SlotsBar, type Partner } from "./PartnersPage";
import { PermissionsPanel } from "./PermissionsPanel";
import { IntegrationsPanel } from "./IntegrationsPanel";
import { PartnerPaymentPanel } from "./PartnerPaymentPanel";
import { ResetPasswordModal } from "./tenant-detail/ResetPasswordModal";
import { ConfirmWaitModal } from "./ConfirmWaitModal";
import { formatBRL } from "./adminDashboard.utils";
import type { PartnerPlan } from "./PartnerPlanFormModal";

type Tab = "dados" | "limites" | "permissoes" | "integracoes" | "pagamentos";

const inputCls =
  "w-full bg-admin-bg border border-admin-border rounded-xl px-3 py-2.5 text-sm text-admin-text focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30 disabled:opacity-60";
const btnCls = "ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors px-4 py-2.5";

// Configurações do parceiro: dados, limites, permissões, integrações e pagamentos
export function PartnerConfigPage() {
  const { id } = useParams();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [notFound, setNotFound] = useState("");
  const [tab, setTab] = useState<Tab>("dados");
  const [name, setName] = useState("");
  const [maxTenants, setMaxTenants] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [plans, setPlans] = useState<PartnerPlan[] | null>(null);
  const [plansError, setPlansError] = useState("");
  const [planId, setPlanId] = useState("");
  const [confirm, setConfirm] = useState<"assign" | "reduce" | null>(null);

  useEffect(() => {
    api
      .get(`/admin/partners/${id}`)
      .then((res) => {
        const p = res.data.data as Partner;
        setPartner(p);
        setName(p.name);
        setMaxTenants(p.maxTenants);
      })
      .catch((err) => setNotFound(errorMessage(err, "Não foi possível carregar o parceiro")));
  }, [id]);

  // parceiro sem plano: carrega os planos ativos para vincular
  function loadPlans() {
    setPlans(null);
    setPlansError("");
    api
      .get("/admin/partner-plans")
      .then((res) => setPlans((res.data.data as PartnerPlan[]).filter((p) => p.isActive)))
      .catch((err) => setPlansError(errorMessage(err, "Não foi possível carregar os planos de parceiro")));
  }

  const needsPlan = !!partner && !partner.partnerPlanId;
  useEffect(() => {
    if (needsPlan) loadPlans();
  }, [needsPlan]);

  // vincula plano: copia vagas e telas; erro sobe para o modal
  async function assignPlan() {
    const res = await api.put(`/admin/partners/${id}/plan`, { partnerPlanId: planId });
    const p = res.data.data as Partner;
    setPartner(p);
    setMaxTenants(p.maxTenants);
    setConfirm(null);
    setMsg("Plano vinculado");
  }

  // Salvar de Limites: abaixo do plano pede confirmação
  function onSaveLimits() {
    if (!belowPlanOf(maxTenants)) return save({ maxTenants });
    setMsg("");
    setConfirm("reduce");
  }

  function belowPlanOf(value: number) {
    const planMax = partner?.partnerPlanMaxTenants ?? null;
    return planMax !== null && value < planMax;
  }

  // vagas abaixo do plano: só depois do modal
  async function saveLimit() {
    const res = await api.patch(`/admin/partners/${id}`, { maxTenants });
    setPartner(res.data.data);
    setConfirm(null);
    setMsg("Alterações salvas");
  }

  async function save(payload: Partial<Pick<Partner, "name" | "maxTenants">>) {
    setSaving(true);
    setMsg("");
    try {
      const res = await api.patch(`/admin/partners/${id}`, payload);
      setPartner(res.data.data);
      setMsg("Alterações salvas");
    } catch (err) {
      setMsg(apiMessage(err, "Não foi possível salvar."));
    } finally {
      setSaving(false);
    }
  }

  // troca a senha da conta do parceiro; sessões caem
  async function resetPassword(password: string) {
    if (!partner?.accountUserId) return;
    setResetting(true);
    setResetError("");
    try {
      await api.post(`/admin/users/${partner.accountUserId}/password`, { password });
      setResetOpen(false);
      setMsg("Senha do parceiro alterada");
    } catch (err) {
      setResetError(apiMessage(err, "Não foi possível trocar a senha."));
    } finally {
      setResetting(false);
    }
  }

  if (notFound) return <div role="alert" className="text-text-secondary text-sm">{notFound}</div>;
  if (!partner) return <div className="text-text-tertiary text-sm">Carregando...</div>;

  const belowUsage = maxTenants < partner.usedTenants;
  const planMax = partner.partnerPlanMaxTenants ?? null;
  const chosen = plans?.find((p) => p.id === planId) ?? null;
  const tabCls = (t: Tab) =>
    `ady-btn px-4 py-3 text-sm -mb-px border-b-2 ${tab === t ? "border-brand text-[#17708A] dark:text-[#1E88A8] font-semibold" : "border-transparent text-text-secondary hover:text-text-primary"}`;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/admin/parceiros" className="text-xs text-[#17708A] dark:text-[#1E88A8] hover:underline">← Parceiros</Link>
        <h1 className="text-2xl font-bold text-text-primary mt-1">{partner.name}</h1>
      </div>

      <div role="tablist" aria-label="Configurações do parceiro" className="flex gap-1 border-b border-border">
        <button role="tab" aria-selected={tab === "dados"} className={tabCls("dados")} onClick={() => { setTab("dados"); setMsg(""); }}>
          Dados da empresa
        </button>
        <button role="tab" aria-selected={tab === "limites"} className={tabCls("limites")} onClick={() => { setTab("limites"); setMsg(""); }}>
          Limites
        </button>
        <button role="tab" aria-selected={tab === "permissoes"} className={tabCls("permissoes")} onClick={() => { setTab("permissoes"); setMsg(""); }}>
          Permissões
        </button>
        <button role="tab" aria-selected={tab === "integracoes"} className={tabCls("integracoes")} onClick={() => { setTab("integracoes"); setMsg(""); }}>
          Integrações
        </button>
        <button role="tab" aria-selected={tab === "pagamentos"} className={tabCls("pagamentos")} onClick={() => { setTab("pagamentos"); setMsg(""); }}>
          Pagamentos
        </button>
      </div>

      {msg && <div role="status" className="text-sm text-text-primary">{msg}</div>}

      {tab === "dados" && (
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-4 max-w-xl">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-text-secondary">Nome da empresa</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-text-secondary">Plano</div>
            {partner.partnerPlanId ? (
              <div className="rounded-xl border border-border px-3 py-2.5">
                <div className="text-sm font-semibold text-text-primary">{partner.partnerPlanName} · {formatBRL(partner.partnerPlanPriceCents ?? 0)}</div>
                <div className="text-xs text-text-secondary">Vagas e telas foram copiadas na compra. Upgrades são ajustes em Limites e Permissões.</div>
              </div>
            ) : (
              <div className="rounded-xl border border-error/40 px-3 py-3 space-y-2">
                <div className="text-sm font-semibold text-error">Sem plano: vincule um</div>
                <div className="flex flex-wrap gap-2">
                  <select aria-label="Plano para vincular" className={`${inputCls} flex-1 min-w-[200px]`} value={planId} disabled={!plans} onChange={(e) => setPlanId(e.target.value)}>
                    <option value="">{plans ? (plans.length ? "Escolha um plano" : "Nenhum plano ativo") : plansError ? "Planos indisponíveis" : "Carregando planos..."}</option>
                    {plans?.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} · {formatBRL(p.priceCents)} · {p.maxTenants} vagas</option>
                    ))}
                  </select>
                  <button type="button" className={btnCls} disabled={!chosen} onClick={() => { setMsg(""); setConfirm("assign"); }}>
                    Vincular
                  </button>
                </div>
                {plansError && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div role="alert" className="text-sm text-error">{plansError}</div>
                    <button type="button" onClick={loadPlans} className="ady-btn text-xs font-semibold text-[#17708A] dark:text-[#1E88A8] underline">
                      Tentar novamente
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-text-secondary">E-mail da conta do parceiro</span>
            <input className={inputCls} value={partner.accountEmail ?? "Sem conta"} disabled />
          </label>
          {partner.accountUserId && (
            <button
              type="button"
              onClick={() => { setResetError(""); setResetOpen(true); setMsg(""); }}
              className="ady-btn h-9 px-3 flex items-center gap-1.5 rounded-lg border border-admin-petrol/40 text-sm font-semibold text-[#17708A] dark:text-[#1E88A8] hover:bg-admin-petrol/10 transition-all"
            >
              <KeyRound className="w-4 h-4" />
              Trocar senha
            </button>
          )}
          <button className={btnCls} disabled={saving || !name.trim()} onClick={() => save({ name: name.trim() })}>
            Salvar
          </button>
        </div>
      )}

      {tab === "limites" && (
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-4 max-w-xl">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-text-secondary">Máximo de clientes</span>
            <input type="number" min={0} className={`${inputCls} max-w-[160px]`} value={maxTenants}
              onChange={(e) => setMaxTenants(Number(e.target.value))} />
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-text-primary">
              <span>Em uso</span>
              <strong>{partner.usedTenants} de {partner.maxTenants}</strong>
            </div>
            <SlotsBar used={partner.usedTenants} max={partner.maxTenants} />
            <div className={`text-xs ${belowUsage ? "text-error" : "text-text-secondary"}`}>
              Não é possível definir um limite menor que os {partner.usedTenants} clientes atuais.
            </div>
            {planMax !== null && <div className="text-xs text-text-secondary">O plano {partner.partnerPlanName} dá {planMax} vagas.</div>}
          </div>
          <button className={btnCls} disabled={saving || belowUsage} onClick={onSaveLimits}>
            Salvar
          </button>
        </div>
      )}

      {tab === "permissoes" && <PermissionsPanel partnerId={partner.id} />}

      {tab === "integracoes" && <IntegrationsPanel url={`/admin/partners/${partner.id}/ai-key`} readOnly />}

      {tab === "pagamentos" && (
        <PartnerPaymentPanel partnerId={partner.id} planName={partner.partnerPlanName ?? null} planPriceCents={partner.partnerPlanPriceCents ?? null} />
      )}

      {confirm === "assign" && chosen && (
        <ConfirmWaitModal title="Vincular plano" confirmLabel="Sim, vincular" errorAction="Não foi possível vincular o plano" onConfirm={assignPlan} onClose={() => setConfirm(null)}>
          Vincular <strong className="text-admin-text">{chosen.name}</strong> a {partner.name}? O parceiro passa a ter {chosen.maxTenants} vagas e as telas do plano; as permissões atuais dele são substituídas. Depois não dá para trocar de plano.
        </ConfirmWaitModal>
      )}

      {confirm === "reduce" && (
        <ConfirmWaitModal title="Reduzir vagas" confirmLabel="Sim, reduzir" errorAction="Não foi possível salvar o limite" onConfirm={saveLimit} onClose={() => setConfirm(null)}>
          O plano {partner.partnerPlanName} dá {planMax} vagas. Deixar {partner.name} com <strong className="text-admin-text">{maxTenants}</strong>?
        </ConfirmWaitModal>
      )}

      {resetOpen && (
        <ResetPasswordModal
          userName={partner.accountEmail ?? partner.name}
          saving={resetting}
          error={resetError}
          onSubmit={resetPassword}
          onClose={() => setResetOpen(false)}
        />
      )}
    </div>
  );
}
