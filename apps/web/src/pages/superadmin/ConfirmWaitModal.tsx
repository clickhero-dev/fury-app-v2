import { useLayoutEffect, useState } from "react";
import { X } from "lucide-react";
import { errorMessage } from "@/lib/error-message";

export const CONFIRM_WAIT_SECONDS = 5;

// Confirmação com botão travado alguns segundos; erro aparece no próprio modal
export function ConfirmWaitModal({
  title,
  children,
  confirmLabel,
  errorAction,
  onConfirm,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  errorAction: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [seconds, setSeconds] = useState(CONFIRM_WAIT_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // botão nasce travado e libera após a contagem
  useLayoutEffect(() => {
    const timer = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (err) {
      setError(errorMessage(err, errorAction));
      setSeconds(CONFIRM_WAIT_SECONDS);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="bg-admin-surface border border-admin-border rounded-2xl p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-admin-text">{title}</h2>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ady-btn text-admin-text-faint hover:text-admin-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="text-sm text-admin-text-muted mb-4">{children}</div>
        {error && <div role="alert" className="text-sm text-error mb-4">{error}</div>}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="ady-btn flex-1 bg-surface-secondary text-text-primary border border-border-light hover:border-brand/50 py-2.5 rounded-full text-sm font-semibold transition-colors">
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || seconds > 0}
            className="ady-btn flex-1 bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white py-2.5 rounded-full text-sm font-semibold transition-colors"
          >
            {busy ? "Salvando..." : seconds > 0 ? `Aguarde ${seconds}s` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
