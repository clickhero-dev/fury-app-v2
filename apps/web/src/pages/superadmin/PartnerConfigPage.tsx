import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "@/lib/api";
import { apiMessage, SlotsBar, type Partner } from "./PartnersPage";
import { PermissionsPanel } from "./PermissionsPanel";

type Tab = "dados" | "limites" | "permissoes";

const inputCls =
  "w-full bg-[#1A1C18] border border-[#2A2D27] rounded-lg px-3 py-2.5 text-sm text-[#ECEDEF] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30 disabled:opacity-60";
const btnCls = "bg-[#1E88A8] hover:bg-[#2299BC] disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium";

// Configurações do parceiro; Integrações chega na tarefa 10
export function PartnerConfigPage() {
  const { id } = useParams();
  const [partner, setPartner] = useState<Partner | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("dados");
  const [name, setName] = useState("");
  const [maxTenants, setMaxTenants] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api
      .get(`/admin/partners/${id}`)
      .then((res) => {
        const p = res.data.data as Partner;
        setPartner(p);
        setName(p.name);
        setMaxTenants(p.maxTenants);
      })
      .catch(() => setNotFound(true));
  }, [id]);

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

  if (notFound) return <div className="text-[#7E8480] text-sm">Parceiro não encontrado.</div>;
  if (!partner) return <div className="text-[#5A605C] text-sm">Carregando...</div>;

  const belowUsage = maxTenants < partner.usedTenants;
  const tabCls = (t: Tab) =>
    `px-4 py-3 text-sm -mb-px border-b-2 ${tab === t ? "border-[#1E88A8] text-[#ECEDEF] font-semibold" : "border-transparent text-[#7E8480] hover:text-[#ECEDEF]"}`;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/admin/parceiros" className="text-xs text-[#1E88A8] hover:underline">← Parceiros</Link>
        <h1 className="text-2xl font-bold !text-[#ECEDEF] mt-1">{partner.name}</h1>
      </div>

      <div role="tablist" aria-label="Configurações do parceiro" className="flex gap-1 border-b border-[#2A2D27]">
        <button role="tab" aria-selected={tab === "dados"} className={tabCls("dados")} onClick={() => { setTab("dados"); setMsg(""); }}>
          Dados da empresa
        </button>
        <button role="tab" aria-selected={tab === "limites"} className={tabCls("limites")} onClick={() => { setTab("limites"); setMsg(""); }}>
          Limites
        </button>
        <button role="tab" aria-selected={tab === "permissoes"} className={tabCls("permissoes")} onClick={() => { setTab("permissoes"); setMsg(""); }}>
          Permissões
        </button>
      </div>

      {msg && <div role="status" className="text-sm text-[#ECEDEF]">{msg}</div>}

      {tab === "dados" && (
        <div className="bg-[#161714] border border-[#2A2D27] rounded-lg p-5 space-y-4 max-w-xl">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#7E8480]">Nome da empresa</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#7E8480]">E-mail da conta do parceiro</span>
            <input className={inputCls} value={partner.accountEmail ?? "Sem conta"} disabled />
          </label>
          <button className={btnCls} disabled={saving || !name.trim()} onClick={() => save({ name: name.trim() })}>
            Salvar
          </button>
        </div>
      )}

      {tab === "limites" && (
        <div className="bg-[#161714] border border-[#2A2D27] rounded-lg p-5 space-y-4 max-w-xl">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#7E8480]">Máximo de clientes</span>
            <input type="number" min={0} className={`${inputCls} max-w-[160px]`} value={maxTenants}
              onChange={(e) => setMaxTenants(Number(e.target.value))} />
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-[#ECEDEF]">
              <span>Em uso</span>
              <strong>{partner.usedTenants} de {partner.maxTenants}</strong>
            </div>
            <SlotsBar used={partner.usedTenants} max={partner.maxTenants} />
            <p className={`text-xs ${belowUsage ? "text-[#E05A4B]" : "text-[#7E8480]"}`}>
              Não é possível definir um limite menor que os {partner.usedTenants} clientes atuais.
            </p>
          </div>
          <button className={btnCls} disabled={saving || belowUsage} onClick={() => save({ maxTenants })}>
            Salvar
          </button>
        </div>
      )}

      {tab === "permissoes" && <PermissionsPanel partnerId={partner.id} />}
    </div>
  );
}
