import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import api from "@/lib/api";
import { apiMessage } from "./PartnersPage";

interface AiKeyStatus {
  configured: boolean;
  last4: string | null;
}

const inputCls =
  "w-full bg-[#1A1C18] border border-[#2A2D27] rounded-lg px-3 py-2.5 text-sm text-[#ECEDEF] placeholder:text-[#5A605C] focus:outline-none focus:border-[#1E88A8] focus:ring-2 focus:ring-[#1E88A8]/30";
const btnCls = "bg-[#1E88A8] hover:bg-[#2299BC] disabled:opacity-50 text-white px-4 py-2.5 rounded-lg text-sm font-medium";

// Chave de IA do parceiro; a chave inteira nunca volta do servidor
// readOnly: super_admin só vê se existe (quem cadastra é o próprio parceiro)
export function IntegrationsPanel({ url, readOnly = false }: { url: string; readOnly?: boolean }) {
  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get(url).then((res) => setStatus(res.data.data)).catch((err) => setMsg(apiMessage(err, "Não foi possível carregar.")));
  }, [url]);

  async function run(call: () => Promise<{ data: { data: AiKeyStatus } }>, done: string) {
    setBusy(true);
    setMsg("");
    try {
      const res = await call();
      setStatus(res.data.data);
      setEditing(false);
      setKey("");
      setMsg(done);
    } catch (err) {
      setMsg(apiMessage(err, "Não foi possível salvar."));
    } finally {
      setBusy(false);
    }
  }

  if (!status) return msg ? <p role="alert" className="text-sm text-[#E05A4B]">{msg}</p> : <div className="text-[#5A605C] text-sm">Carregando...</div>;

  return (
    <div className="bg-[#161714] border border-[#2A2D27] rounded-lg p-5 space-y-4 max-w-xl">
      <div className="flex items-center gap-2 text-sm font-semibold text-[#ECEDEF]">
        <KeyRound className="w-4 h-4 text-[#1E88A8]" /> Chave de IA
      </div>
      <p className="text-xs text-[#7E8480]">
        Usada pelo parceiro e pelos clientes dele em todos os recursos de IA. Sem chave, ninguém usa IA.
      </p>

      {readOnly ? (
        <p className="text-sm text-[#ECEDEF]">
          {status.configured ? `Chave configurada: ••••${status.last4}` : "Sem chave cadastrada"}
          <span className="block text-xs text-[#7E8480] mt-1">A chave é cadastrada pelo próprio parceiro, no admin dele.</span>
        </p>
      ) : status.configured && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-[#ECEDEF]">Chave configurada: ••••{status.last4}</span>
          <div className="flex gap-2">
            <button className={btnCls} disabled={busy} onClick={() => { setMsg(""); setEditing(true); }}>Trocar</button>
            <button
              disabled={busy}
              onClick={() => run(() => api.delete(url), "Chave removida")}
              className="px-4 py-2.5 rounded-lg border border-[#2A2D27] text-[#E05A4B] hover:border-[#E05A4B]/40 text-sm font-medium disabled:opacity-50"
            >
              Remover
            </button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => { e.preventDefault(); run(() => api.put(url, { key: key.trim() }), "Chave salva"); }}
        >
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#7E8480]">Nova chave</span>
            <input type="password" autoComplete="off" required className={inputCls} value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={btnCls} disabled={busy || !key.trim()}>{busy ? "Testando..." : "Salvar"}</button>
            {status.configured && (
              <button type="button" onClick={() => { setEditing(false); setKey(""); }} className="px-4 py-2.5 rounded-lg border border-[#2A2D27] text-[#ECEDEF] text-sm">
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {msg && <p role="status" className="text-sm text-[#ECEDEF]">{msg}</p>}
    </div>
  );
}

// Página "Integrações" do admin do parceiro
export function MyIntegrationsPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold !text-[#ECEDEF]">Integrações</h1>
      <IntegrationsPanel url="/admin/my-partner/ai-key" />
    </div>
  );
}
