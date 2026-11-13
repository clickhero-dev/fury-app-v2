import { useEffect } from "react";
import { Lock, Mail, User, UserPlus, X } from "lucide-react";
import { FieldLabel } from "./FormSection";

export interface NewUser {
  name: string;
  email: string;
  password: string;
  role: string;
}

interface CreateUserModalProps {
  open: boolean;
  value: NewUser;
  onChange: (next: NewUser) => void;
  onSubmit: () => void;
  onClose: () => void;
  saving: boolean;
  error: string;
}

const inputCls =
  "w-full bg-admin-bg border border-admin-border rounded-xl px-4 py-2.5 text-sm text-admin-text placeholder:text-admin-text-faint focus:outline-none focus:ring-2 focus:ring-admin-petrol/30 focus:border-admin-petrol";

// Modal de criação de usuário do cliente; sempre cargo Usuário
export function CreateUserModal({ open, value, onChange, onSubmit, onClose, saving, error }: CreateUserModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-title"
        className="bg-admin-surface border border-admin-border rounded-2xl p-6 w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="create-user-title" className="text-lg font-semibold text-admin-text">Criar Usuário</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="ady-btn text-admin-text-faint hover:text-admin-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form
          className="ady-form-plain space-y-4"
          onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        >
          <div>
            <FieldLabel icon={User} htmlFor="new-user-name">Nome</FieldLabel>
            <input id="new-user-name" autoFocus value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="Nome" autoComplete="off" className={inputCls} />
          </div>
          <div>
            <FieldLabel icon={Mail} htmlFor="new-user-email">Email</FieldLabel>
            <input id="new-user-email" type="email" value={value.email} onChange={(e) => onChange({ ...value, email: e.target.value })} placeholder="Email" autoComplete="off" className={inputCls} />
          </div>
          <div>
            <FieldLabel icon={Lock} htmlFor="new-user-password">Senha</FieldLabel>
            <input id="new-user-password" type="password" value={value.password} onChange={(e) => onChange({ ...value, password: e.target.value })} placeholder="Senha" autoComplete="new-password" className={inputCls} />
          </div>
          {error && (
            <div role="alert" className="text-sm text-error bg-error/10 border border-error/30 rounded-xl px-3 py-2.5">{error}</div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="ady-btn flex-1 bg-surface-secondary text-text-primary border border-border-light hover:border-brand/50 py-2.5 rounded-full text-sm font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="ady-btn flex-1 bg-[#17708A] hover:bg-[#17708A]/90 disabled:opacity-50 text-white shadow-sm rounded-full text-sm font-semibold transition-colors py-2.5 flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" /> Criar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
