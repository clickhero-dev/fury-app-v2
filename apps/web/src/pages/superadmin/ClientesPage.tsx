import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Plus, X } from "lucide-react";
import api from "@/lib/api";
import { apiMessage, SlotsBar } from "./PartnersPage";

interface Slots {
  maxTenants: number;
  usedTenants: number;
}

interface Client {
  id: string;
  name: string;
  userCount: number;
  createdAt: string;
}

const EMPTY_FORM = { name: "", userName: "", userEmail: "", userPassword: "" };

const inputCls =
  "w-full bg-[#1A1C18] border border-[#2A2D27] rounded-lg px-3 py-2.5 text-sm text-[#ECEDEF] placeholder:text-[#5A605C] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30";

// Clientes do parceiro logado: vagas + Novo Cliente
export function ClientesPage() {
  const [slots, setSlots] = useState<Slots | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    Promise.all([api.get("/admin/my-partner"), api.get("/admin/tenants")])
      .then(([s, t]) => {
        setSlots(s.data.data);
        setClients(t.data.data);
      })
      .catch((err) => setError(apiMessage(err, "Não foi possível carregar os clientes.")));

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/admin/my-partner/clients", form);
      setShowModal(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(apiMessage(err, "Não foi possível criar o cliente."));
    } finally {
      setSaving(false);
    }
  }

  if (!slots) return error ? <p role="alert" className="text-sm text-[#E05A4B]">{error}</p> : <div className="text-[#5A605C] text-sm">Carregando...</div>;

  const full = slots.usedTenants >= slots.maxTenants;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-[38px] h-[38px] rounded-[10px] bg-[#1E88A8]/10 border border-[#1E88A8]/20 flex items-center justify-center text-[#1E88A8]">
            <Building2 className="w-[18px] h-[18px]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold !text-[#ECEDEF]">Clientes</h1>
            <div className="flex items-center gap-3 text-sm text-[#7E8480]">
              <SlotsBar used={slots.usedTenants} max={slots.maxTenants} />
              <span>{slots.usedTenants} de {slots.maxTenants} vagas</span>
            </div>
          </div>
        </div>
        <button
          disabled={full}
          onClick={() => { setError(""); setShowModal(true); }}
          className="bg-[#1E88A8] hover:bg-[#2299BC] disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} /> Novo Cliente
        </button>
      </div>

      {full && (
        <p className="mb-4 text-sm text-[#E05A4B]">
          Limite de clientes atingido ({slots.usedTenants} de {slots.maxTenants}). Fale com a ady para aumentar.
        </p>
      )}
      {error && !showModal && <p role="alert" className="mb-4 text-sm text-[#E05A4B]">{error}</p>}

      <div className="bg-[#161714] border border-[#2A2D27] rounded-lg overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left text-xs text-[#7E8480] border-b border-[#2A2D27]">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Usuários</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-10 text-center text-[#5A605C]">Nenhum cliente cadastrado</td></tr>
            )}
            {clients.map((c) => (
              <tr key={c.id} className="border-b border-[#1F211C] last:border-0">
                <td className="px-4 py-3">
                  <Link to={`/admin/tenants/${c.id}`} className="font-semibold text-[#ECEDEF] hover:text-[#1E88A8]">{c.name}</Link>
                </td>
                <td className="px-4 py-3 text-[#ECEDEF]">{c.userCount}</td>
                <td className="px-4 py-3 text-[#7E8480]">{new Date(c.createdAt).toLocaleDateString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <form onSubmit={handleCreate} className="bg-[#161714] border border-[#2A2D27] rounded-lg p-6 w-full max-w-md mx-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#ECEDEF]">Novo Cliente</h2>
              <button type="button" onClick={() => setShowModal(false)} aria-label="Fechar" className="text-[#5A605C] hover:text-[#ECEDEF]">
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#7E8480]">Nome da empresa</span>
              <input required className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-[#7E8480]">Dono do cliente</div>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#7E8480]">Nome</span>
              <input required className={inputCls} value={form.userName} onChange={(e) => setForm({ ...form, userName: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#7E8480]">E-mail</span>
              <input required type="email" className={inputCls} value={form.userEmail} onChange={(e) => setForm({ ...form, userEmail: e.target.value })} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#7E8480]">Senha inicial (mínimo 8 caracteres)</span>
              <input required type="password" minLength={8} className={inputCls} value={form.userPassword}
                onChange={(e) => setForm({ ...form, userPassword: e.target.value })} />
            </label>
            {error && <p role="alert" className="text-sm text-[#E05A4B]">{error}</p>}
            <button type="submit" disabled={saving}
              className="w-full bg-[#1E88A8] hover:bg-[#2299BC] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium">
              {saving ? "Criando..." : "Criar cliente"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
