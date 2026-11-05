import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import api from "@/lib/api";
import { apiMessage } from "./PartnersPage";

interface AiKeyStatus {
  configured: boolean;
  last4: string | null;
}

const inputCls =
  "w-full bg-admin-bg border border-admin-border rounded-xl px-3 py-2.5 text-sm text-admin-text placeholder:text-text-tertiary focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const btnCls = "ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors px-5 py-2.5";

// Chave OpenRouter do parceiro; a chave inteira nunca volta do servidor
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

  if (!status) return msg ? <div role="alert" className="text-sm text-error">{msg}</div> : <div className="text-text-tertiary text-sm">Carregando...</div>;

  return (
    <div className="bg-surface border border-border rounded-2xl p-5 space-y-4 max-w-xl">
      <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
        <KeyRound className="w-4 h-4 text-brand" /> Chave da OpenRouter
      </div>
      <p className="text-xs text-text-secondary">
        Cole a chave da sua conta OpenRouter (começa com <code>sk-or-</code>). Usada pelo parceiro e pelos clientes dele em todos os recursos de IA. Sem chave, ninguém usa IA.
      </p>

      {readOnly ? (
        <div className="text-sm text-text-primary">
          {status.configured ? `Chave configurada: ••••${status.last4}` : "Sem chave cadastrada"}
          <span className="block text-xs text-text-secondary mt-1">A chave é cadastrada pelo próprio parceiro, no admin dele.</span>
        </div>
      ) : status.configured && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-text-primary">Chave configurada: ••••{status.last4}</div>
          <div className="flex gap-2">
            <button className={btnCls} disabled={busy} onClick={() => { setMsg(""); setEditing(true); }}>Trocar</button>
            <button
              disabled={busy}
              onClick={() => run(() => api.delete(url), "Chave removida")}
              className="ady-btn px-4 py-2.5 rounded-full border border-error/30 bg-error/10 text-error hover:bg-error/20 text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              Remover
            </button>
          </div>
        </div>
      ) : (
        <form
          className="ady-form-plain space-y-3"
          onSubmit={(e) => { e.preventDefault(); run(() => api.put(url, { key: key.trim() }), "Chave salva"); }}
        >
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-text-secondary">Nova chave</span>
            <input type="password" autoComplete="off" required placeholder="sk-or-..." className={inputCls} value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="submit" className={btnCls} disabled={busy || !key.trim()}>{busy ? "Testando..." : "Salvar"}</button>
            {status.configured && (
              <button type="button" onClick={() => { setEditing(false); setKey(""); }} className="ady-btn rounded-full border border-border-light bg-surface-secondary text-text-primary hover:border-brand/50 font-semibold transition-colors px-4 py-2.5 text-sm">
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {msg && <div role="status" className="text-sm text-text-primary">{msg}</div>}
    </div>
  );
}

// Página "Integrações" do admin do parceiro
export function MyIntegrationsPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-text-primary">Integrações</h1>
      <IntegrationsPanel url="/admin/my-partner/ai-key" />
    </div>
  );
}
