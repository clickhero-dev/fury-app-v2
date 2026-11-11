import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Lock, X } from "lucide-react";
import { FieldLabel } from "./FormSection";

// Mesma política da API (packages/shared/password-policy)
export const PASSWORD_CHECKS: { label: string; test: (p: string) => boolean }[] = [
  { label: "Pelo menos 8 caracteres", test: (p) => p.length >= 8 },
  { label: "Uma letra minúscula", test: (p) => /[a-z]/.test(p) },
  { label: "Uma letra maiúscula", test: (p) => /[A-Z]/.test(p) },
  { label: "Um número", test: (p) => /\d/.test(p) },
  { label: "Um caractere especial", test: (p) => /[^a-zA-Z0-9]/.test(p) },
];

interface ResetPasswordModalProps {
  userName: string;
  saving: boolean;
  error: string;
  onSubmit: (password: string) => void;
  onClose: () => void;
}

const inputCls =
  "w-full bg-admin-bg border border-admin-border rounded-xl pl-4 pr-11 py-2.5 text-sm text-admin-text placeholder:text-admin-text-faint focus:outline-none focus:ring-2 focus:ring-admin-petrol/30 focus:border-admin-petrol";

// Suporte troca a senha de um usuário do cliente
export function ResetPasswordModal({ userName, saving, error, onSubmit, onClose }: ResetPasswordModalProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const strong = PASSWORD_CHECKS.every((c) => c.test(password));
  const matches = confirm.length > 0 && confirm === password;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="reset-password-title" className="bg-admin-surface border border-admin-border rounded-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-2">
          <h2 id="reset-password-title" className="text-lg font-semibold text-admin-text flex items-center gap-2">
            <KeyRound aria-hidden="true" className="w-5 h-5 text-[#17708A] dark:text-[#1E88A8]" /> Trocar senha
          </h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Fechar" className="ady-btn text-admin-text-faint hover:text-admin-text transition-colors disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="text-sm text-admin-text-muted mb-5">
          Nova senha de <strong className="text-admin-text">{userName}</strong>. As sessões salvas do usuário são encerradas.
        </div>

        <form
          className="ady-form-plain space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (strong && matches && !saving) onSubmit(password); }}
        >
          <div>
            <FieldLabel icon={Lock} htmlFor="reset-password">Nova senha</FieldLabel>
            <div className="relative">
              <input
                id="reset-password"
                type={show ? "text" : "password"}
                autoFocus
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="reset-password-rules"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Esconder senha" : "Mostrar senha"}
                className="ady-btn absolute right-3 top-1/2 -translate-y-1/2 text-admin-text-faint hover:text-admin-text"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <ul id="reset-password-rules" className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
              {PASSWORD_CHECKS.map((c) => {
                const ok = c.test(password);
                return (
                  <li key={c.label} className={`flex items-center gap-1.5 text-xs ${ok ? "text-success" : "text-admin-text-faint"}`}>
                    <Check aria-hidden="true" className={`w-3.5 h-3.5 ${ok ? "" : "opacity-30"}`} />
                    <div>{c.label}<span className="sr-only">{ok ? " (atendido)" : " (pendente)"}</span></div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <FieldLabel icon={Lock} htmlFor="reset-password-confirm">Confirmar senha</FieldLabel>
            <input
              id="reset-password-confirm"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputCls}
            />
            {confirm.length > 0 && !matches && <div className="text-xs text-error mt-1">As senhas não conferem.</div>}
          </div>

          {error && <div role="alert" className="text-sm text-error bg-error/10 border border-error/30 rounded-xl px-3 py-2.5">{error}</div>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="ady-btn flex-1 bg-surface-secondary text-text-primary border border-border-light hover:border-brand/50 py-2.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!strong || !matches || saving}
              className="ady-btn flex-1 bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-sm rounded-full text-sm font-semibold transition-colors py-2.5 flex items-center justify-center gap-2"
            >
              <KeyRound className="w-4 h-4" /> {saving ? "Salvando..." : "Trocar senha"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
