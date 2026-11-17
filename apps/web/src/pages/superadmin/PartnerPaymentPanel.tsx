import { useEffect, useLayoutEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import api from "@/lib/api";
import { errorMessage } from "@/lib/error-message";
import { formatBRL, formatYMD, parseBRLToCents } from "./adminDashboard.utils";

export interface PartnerPayment {
  id: string;
  amountCents: number;
  paidAt: string;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

const DELETE_WAIT_SECONDS = 5;
const inputCls =
  "w-full bg-admin-bg border border-admin-border rounded-xl px-3 py-2.5 text-sm text-admin-text focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const btnCls = "ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors px-4 py-2.5";

// hoje em São Paulo (AAAA-MM-DD), limite do campo de data
function todayYMD(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

// Pagamento único do parceiro à ady (só super_admin)
export function PartnerPaymentPanel({ partnerId }: { partnerId: string }) {
  const [payment, setPayment] = useState<PartnerPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api
      .get(`/admin/partners/${partnerId}/payment`)
      .then((res) => setPayment(res.data.data.payment))
      .catch((err) => setLoadError(errorMessage(err, "Não foi possível carregar o pagamento")))
      .finally(() => setLoading(false));
  }, [partnerId]);

  if (loading) return <div className="text-text-tertiary text-sm">Carregando...</div>;
  if (loadError) return <div role="alert" className="text-sm text-error">{loadError}</div>;

  return (
    <div className="space-y-4 max-w-3xl">
      {msg && <div role="status" className="text-sm text-text-primary">{msg}</div>}

      {payment ? (
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-xs font-medium text-text-secondary">Valor pago</div>
              <div className="text-2xl font-bold text-success">{formatBRL(payment.amountCents)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-text-secondary">Pago em</div>
              <div className="text-2xl font-bold text-text-primary">{formatYMD(payment.paidAt)}</div>
            </div>
          </div>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-secondary">Observação</dt>
              <dd className="text-text-primary">{payment.note || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-secondary">Registrado por</dt>
              <dd className="text-text-primary">{payment.createdByName ?? "Usuário removido"}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => { setMsg(""); setDeleteOpen(true); }}
            className="ady-btn h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-error/40 text-sm font-semibold text-error hover:bg-error/10 transition-all"
          >
            <Trash2 className="w-4 h-4" /> Excluir pagamento
          </button>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl p-5 space-y-3">
          <div className="text-sm text-text-primary">Nenhum pagamento registrado para este parceiro.</div>
          <button type="button" className={btnCls} onClick={() => { setMsg(""); setFormOpen(true); }}>
            + Registrar pagamento
          </button>
        </div>
      )}

      <div className="text-xs text-text-secondary bg-brand/10 rounded-xl px-4 py-3">
        Só o super administrador vê e registra o pagamento. O parceiro não vê esta aba. Cada parceiro tem um pagamento; para corrigir, exclua e registre de novo.
      </div>

      {formOpen && (
        <RegisterPaymentModal
          partnerId={partnerId}
          onClose={() => setFormOpen(false)}
          onSaved={(p) => { setPayment(p); setFormOpen(false); setMsg("Pagamento registrado"); }}
        />
      )}
      {deleteOpen && payment && (
        <DeletePaymentModal
          partnerId={partnerId}
          payment={payment}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => { setPayment(null); setDeleteOpen(false); setMsg("Pagamento excluído"); }}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-admin-surface border border-admin-border rounded-2xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-admin-text">{title}</h2>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ady-btn text-admin-text-faint hover:text-admin-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function RegisterPaymentModal({ partnerId, onClose, onSaved }: { partnerId: string; onClose: () => void; onSaved: (p: PartnerPayment) => void }) {
  const today = todayYMD();
  const [paidAt, setPaidAt] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = parseBRLToCents(amount);
    if (!amountCents) return setError("Informe o valor em reais, por exemplo 5.000,00.");
    if (!paidAt || paidAt > today) return setError("Informe a data do pagamento (hoje ou antes).");
    setSaving(true);
    setError("");
    try {
      const res = await api.post(`/admin/partners/${partnerId}/payment`, { paidAt, amountCents, ...(note.trim() ? { note: note.trim() } : {}) });
      onSaved(res.data.data.payment);
    } catch (err) {
      setError(errorMessage(err, "Não foi possível registrar o pagamento"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Registrar pagamento" onClose={onClose}>
      <form className="ady-form-plain space-y-4" onSubmit={submit}>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Data do pagamento</span>
          <input type="date" className={inputCls} value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} required />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Valor (R$)</span>
          <input inputMode="decimal" className={inputCls} placeholder="5.000,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Observação (opcional)</span>
          <input className={inputCls} maxLength={500} placeholder="Ex.: venda inicial – 5 vagas" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && <div role="alert" className="text-sm text-error">{error}</div>}
        <button type="submit" className={`${btnCls} w-full`} disabled={saving}>
          {saving ? "Salvando..." : "Registrar"}
        </button>
      </form>
    </Modal>
  );
}

function DeletePaymentModal({ partnerId, payment, onClose, onDeleted }: { partnerId: string; payment: PartnerPayment; onClose: () => void; onDeleted: () => void }) {
  const [seconds, setSeconds] = useState(DELETE_WAIT_SECONDS);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // botão nasce travado e libera após a contagem
  useLayoutEffect(() => {
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function confirm() {
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/admin/partners/${partnerId}/payment/${payment.id}`);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível excluir o pagamento"));
      setSeconds(DELETE_WAIT_SECONDS);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal title="Excluir pagamento" onClose={onClose}>
      <p className="text-sm text-admin-text-muted mb-4">
        Excluir o pagamento de <strong className="text-admin-text">{formatBRL(payment.amountCents)}</strong> de {formatYMD(payment.paidAt)}? Ele sai da receita do Dashboard.
      </p>
      {error && <div role="alert" className="text-sm text-error mb-4">{error}</div>}
      <div className="flex gap-3">
        <button type="button" onClick={onClose} className="ady-btn flex-1 bg-surface-secondary text-text-primary border border-border-light hover:border-brand/50 py-2.5 rounded-full text-sm font-semibold transition-colors">
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={deleting || seconds > 0}
          className="ady-btn flex-1 bg-[#E5534B] hover:bg-[#E5534B]/90 disabled:opacity-50 text-white py-2.5 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
        >
          {deleting ? "Excluindo..." : seconds > 0 ? `Aguarde ${seconds}s` : <><Trash2 className="w-4 h-4" /> Sim, excluir</>}
        </button>
      </div>
    </Modal>
  );
}
