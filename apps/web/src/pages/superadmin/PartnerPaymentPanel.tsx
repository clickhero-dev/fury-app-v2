import { useEffect, useLayoutEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import api from "@/lib/api";
import { errorMessage } from "@/lib/error-message";
import { formatBRL, formatYMD, parseBRLToCents } from "./adminDashboard.utils";
import { centsToInput } from "./PartnerPlanFormModal";

type PartnerPaymentKind = "plan" | "additional";

interface PartnerPayment {
  id: string;
  kind: PartnerPaymentKind;
  amountCents: number;
  paidAt: string;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

interface PaymentHistory {
  totalCents: number;
  lastPaidAt: string | null;
  payments: PartnerPayment[];
}

const KIND_LABEL: Record<PartnerPaymentKind, string> = { plan: "Plano", additional: "Adicional" };

const DELETE_WAIT_SECONDS = 5;
const inputCls =
  "w-full bg-admin-bg border border-admin-border rounded-xl px-3 py-2.5 text-sm text-admin-text focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const btnCls = "ady-btn bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors px-4 py-2.5";

// hoje em São Paulo (AAAA-MM-DD), limite do campo de data
function todayYMD(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

// Histórico de pagamentos do parceiro à ady: plano + adicionais (só super_admin)
export function PartnerPaymentPanel({
  partnerId,
  planName = null,
  planPriceCents = null,
}: {
  partnerId: string;
  planName?: string | null;
  planPriceCents?: number | null;
}) {
  const [history, setHistory] = useState<PaymentHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<PartnerPayment | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    try {
      const res = await api.get(`/admin/partners/${partnerId}/payments`);
      setHistory(res.data.data);
      setLoadError("");
    } catch (err) {
      setLoadError(errorMessage(err, "Não foi possível carregar os pagamentos"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  if (loading) return <div className="text-text-tertiary text-sm">Carregando...</div>;
  if (loadError || !history)
    return (
      <div className="space-y-3">
        <div role="alert" className="text-sm text-error">{loadError}</div>
        <button type="button" className={btnCls} onClick={() => { setLoading(true); load(); }}>Tentar novamente</button>
      </div>
    );

  const { payments } = history;

  return (
    <div className="space-y-4 max-w-4xl">
      {msg && <div role="status" className="text-sm text-text-primary">{msg}</div>}

      <div className="bg-surface border border-border rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-6 grid-cols-2">
            <div>
              <div className="text-xs font-medium text-text-secondary">Total pago</div>
              <div className="text-2xl font-bold text-success">{formatBRL(history.totalCents)}</div>
            </div>
            <div>
              <div className="text-xs font-medium text-text-secondary">Último pagamento</div>
              <div className="text-2xl font-bold text-text-primary">{history.lastPaidAt ? formatYMD(history.lastPaidAt) : "—"}</div>
            </div>
          </div>
          <button type="button" className={btnCls} onClick={() => { setMsg(""); setFormOpen(true); }}>
            + Registrar pagamento
          </button>
        </div>

        {payments.length === 0 ? (
          <div className="text-sm text-text-primary">Nenhum pagamento registrado para este parceiro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-secondary border-b border-border">
                  <th className="py-2 pr-3 font-semibold">Data</th>
                  <th className="py-2 pr-3 font-semibold">Tipo</th>
                  <th className="py-2 pr-3 font-semibold">Descrição</th>
                  <th className="py-2 pr-3 font-semibold">Valor</th>
                  <th className="py-2 pr-3 font-semibold">Registrado por</th>
                  <th className="py-2 font-semibold"><div className="sr-only">Ações</div></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-3 text-text-primary whitespace-nowrap">{formatYMD(p.paidAt)}</td>
                    <td className="py-3 pr-3">
                      <div className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.kind === "plan" ? "bg-brand/10 text-brand" : "bg-spark/10 text-spark"}`}>
                        {KIND_LABEL[p.kind]}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-text-primary">{p.note || "—"}</td>
                    <td className="py-3 pr-3 font-semibold text-text-primary whitespace-nowrap">{formatBRL(p.amountCents)}</td>
                    <td className="py-3 pr-3 text-text-secondary">{p.createdByName ?? "Usuário removido"}</td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        aria-label={`Excluir pagamento de ${formatYMD(p.paidAt)}`}
                        onClick={() => { setMsg(""); setToDelete(p); }}
                        className="ady-btn h-8 w-8 inline-flex items-center justify-center rounded-lg text-error hover:bg-error/10 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-xs text-text-secondary bg-brand/10 rounded-xl px-4 py-3">
        Só o super administrador vê e registra pagamentos; o parceiro não vê esta aba. O primeiro lançamento é o plano; cada ajuste vendido depois (vagas, telas) entra como adicional.
      </div>

      {formOpen && (
        <RegisterPaymentModal
          partnerId={partnerId}
          defaultKind={payments.length === 0 ? "plan" : "additional"}
          plan={planName && planPriceCents !== null ? { name: planName, priceCents: planPriceCents } : null}
          onClose={() => setFormOpen(false)}
          onSaved={async () => { setFormOpen(false); await load(); setMsg("Pagamento registrado"); }}
        />
      )}
      {toDelete && (
        <DeletePaymentModal
          partnerId={partnerId}
          payment={toDelete}
          onClose={() => setToDelete(null)}
          onDeleted={async () => { setToDelete(null); await load(); setMsg("Pagamento excluído"); }}
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

function RegisterPaymentModal({
  partnerId,
  defaultKind,
  plan,
  onClose,
  onSaved,
}: {
  partnerId: string;
  defaultKind: PartnerPaymentKind;
  plan: { name: string; priceCents: number } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = todayYMD();
  const [kind, setKind] = useState<PartnerPaymentKind>(defaultKind);
  // lançamento do plano já vem com preço e nome do plano
  const prefill = defaultKind === "plan" && plan;
  const [paidAt, setPaidAt] = useState(today);
  const [amount, setAmount] = useState(prefill ? centsToInput(plan.priceCents) : "");
  const [note, setNote] = useState(prefill ? plan.name : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = parseBRLToCents(amount);
    if (!amountCents) return setError("Informe o valor em reais, por exemplo 5.000,00.");
    if (!paidAt || paidAt > today) return setError("Informe a data do pagamento (hoje ou antes).");
    if (kind === "additional" && !note.trim()) return setError("Descreva o adicional, por exemplo: +5 vagas.");
    setSaving(true);
    setError("");
    try {
      await api.post(`/admin/partners/${partnerId}/payments`, { kind, paidAt, amountCents, ...(note.trim() ? { note: note.trim() } : {}) });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Não foi possível registrar o pagamento"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Registrar pagamento" onClose={onClose}>
      <form className="ady-form-plain space-y-4" onSubmit={submit}>
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-text-secondary">Tipo</legend>
          <div className="flex gap-2">
            {(["plan", "additional"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`ady-btn flex-1 rounded-full border px-3 py-2 text-sm font-semibold transition-colors ${kind === k ? "border-brand bg-brand/10 text-brand" : "border-border text-text-secondary hover:border-brand/50"}`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Data do pagamento</span>
          <input type="date" className={inputCls} value={paidAt} max={today} onChange={(e) => setPaidAt(e.target.value)} required />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">Valor (R$)</span>
          <input inputMode="decimal" className={inputCls} placeholder="5.000,00" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-text-secondary">{kind === "additional" ? "Descrição" : "Descrição (opcional)"}</span>
          <input className={inputCls} maxLength={500} placeholder={kind === "additional" ? "Ex.: +5 vagas" : "Ex.: Parceiro Ouro"} value={note} onChange={(e) => setNote(e.target.value)} />
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
      await api.delete(`/admin/partners/${partnerId}/payments/${payment.id}`);
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
        Excluir o lançamento de {KIND_LABEL[payment.kind].toLowerCase()} de <strong className="text-admin-text">{formatBRL(payment.amountCents)}</strong> de {formatYMD(payment.paidAt)}? Ele sai da receita do Dashboard.
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
