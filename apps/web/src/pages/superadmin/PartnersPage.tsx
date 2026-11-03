import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Plus, X } from "lucide-react";
import { isAxiosError } from "axios";
import api from "@/lib/api";

export interface Partner {
  id: string;
  name: string;
  maxTenants: number;
  usedTenants: number;
  accountEmail: string | null;
  keyLast4: string | null;
}

const EMPTY_FORM = { name: "", maxTenants: 10, accountName: "", accountEmail: "", accountPassword: "" };

const inputCls =
  "w-full bg-[#1A1C18] border border-[#2A2D27] rounded-lg px-3 py-2.5 text-sm text-[#ECEDEF] placeholder:text-[#5A605C] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30";

export function apiMessage(err: unknown, fallback: string) {
  return isAxiosError(err) ? err.response?.data?.error?.message ?? fallback : fallback;
}

export function SlotsBar({ used, max }: { used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-28 rounded-full bg-[#1A1C18] overflow-hidden" aria-hidden="true">
      <div className="h-full bg-[#1E88A8]" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    api
      .get("/admin/partners")
      .then((res) => setPartners(res.data.data))
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/admin/partners", form);
      setShowModal(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(apiMessage(err, "Não foi possível criar o parceiro."));
    } finally {
      setSaving(false);
    }
  }

  const used = partners.reduce((s, p) => s + p.usedTenants, 0);
  const max = partners.reduce((s, p) => s + p.maxTenants, 0);

  if (loading) return <div className="text-[#5A605C] text-sm">Carregando...</div>;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-[10px] bg-[#1E88A8]/10 border border-[#1E88A8]/20 flex items-center justify-center text-[#1E88A8]">
            <Briefcase className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold !text-[#ECEDEF]">Parceiros</h1>
            <p className="text-sm text-[#7E8480]">Empresas parceiras e quantos clientes cada uma pode ter.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
        <Link
          to="/admin/parceiros/padrao"
          className="px-4 py-2.5 rounded-lg border border-[#2A2D27] text-[#ECEDEF] hover:border-[#1E88A8]/40 text-sm font-medium"
        >
          Permissões padrão (todos)
        </Link>
        <button
          onClick={() => { setError(""); setShowModal(true); }}
          className="bg-[#1E88A8] hover:bg-[#2299BC] text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Novo parceiro
        </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        {[
          { label: "Parceiros ativos", value: String(partners.length) },
          { label: "Vagas usadas", value: `${used} de ${max}` },
          { label: "Clientes de parceiros", value: String(used) },
        ].map((k) => (
          <div key={k.label} className="bg-[#161714] border border-[#2A2D27] rounded-lg p-5">
            <div className="text-sm text-[#7E8480]">{k.label}</div>
            <div className="text-2xl font-bold text-[#ECEDEF] mt-1">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="bg-[#161714] border border-[#2A2D27] rounded-lg overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-[#7E8480] border-b border-[#2A2D27]">
              <th className="px-4 py-3 font-medium">Parceiro</th>
              <th className="px-4 py-3 font-medium">Vagas</th>
              <th className="px-4 py-3 font-medium">Chave de IA</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {partners.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-[#5A605C]">Nenhum parceiro cadastrado</td></tr>
            )}
            {partners.map((p) => (
              <tr key={p.id} className="border-b border-[#1F211C] last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold text-[#ECEDEF]">{p.name}</div>
                  <div className="text-xs text-[#5A605C]">{p.accountEmail ?? "Sem conta"}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 text-[#ECEDEF]">
                    <SlotsBar used={p.usedTenants} max={p.maxTenants} />
                    {p.usedTenants} de {p.maxTenants}
                  </div>
                </td>
                <td className="px-4 py-3 text-[#7E8480]">{p.keyLast4 ? `•••• ${p.keyLast4}` : "Sem chave"}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/admin/parceiros/${p.id}`}
                    className="inline-flex items-center px-3 py-2 rounded-lg border border-[#2A2D27] text-[#ECEDEF] hover:border-[#1E88A8]/40 text-xs font-medium"
                  >
                    Configurar
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <form onSubmit={handleCreate} className="bg-[#161714] border border-[#2A2D27] rounded-lg p-6 w-full max-w-md mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#ECEDEF]">Novo parceiro</h2>
              <button type="button" onClick={() => setShowModal(false)} aria-label="Fechar" className="text-[#5A605C] hover:text-[#ECEDEF]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#7E8480]">Nome da empresa</span>
              <input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#7E8480]">Máximo de clientes</span>
              <input required type="number" min={0} className={inputCls} value={form.maxTenants}
                onChange={(e) => setForm({ ...form, maxTenants: Number(e.target.value) })} />
            </label>
            <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-[#7E8480]">Conta do parceiro</div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#7E8480]">Nome</span>
              <input required className={inputCls} value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#7E8480]">E-mail</span>
              <input required type="email" className={inputCls} value={form.accountEmail} onChange={(e) => setForm({ ...form, accountEmail: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#7E8480]">Senha inicial (mínimo 8 caracteres)</span>
              <input required type="password" minLength={8} className={inputCls} value={form.accountPassword}
                onChange={(e) => setForm({ ...form, accountPassword: e.target.value })} />
            </label>
            {error && <p role="alert" className="text-sm text-[#E05A4B]">{error}</p>}
            <button type="submit" disabled={saving}
              className="w-full bg-[#1E88A8] hover:bg-[#2299BC] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
              {saving ? "Criando..." : "Criar parceiro"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
