import { KeyRound, Pencil, Trash2 } from "lucide-react";
import { roleBadgeClass, roleLabel } from "@/lib/platform-role";

export interface TenantUser {
  id: string;
  name: string;
  email: string;
  role: string;
  platformRole?: string | null;
  createdAt: string;
}

const fieldCls = "text-[11px] font-semibold uppercase tracking-wide text-admin-text-faint";

function initials(user: TenantUser) {
  const base = (user.name || user.email || "?").trim();
  return base.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

// Card de um usuário do cliente
export function UserCard({ user, onEdit, onResetPassword, onRemove }: { user: TenantUser; onEdit: () => void; onResetPassword: () => void; onRemove: () => void }) {
  return (
    <article className="bg-admin-surface border border-admin-border rounded-2xl p-4 flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <div aria-hidden="true" className="gradient-teal w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-sm font-bold">
          {initials(user)}
        </div>
        <div className="min-w-0">
          <div className={fieldCls}>Nome</div>
          <div className="font-bold text-admin-text break-words">{user.name}</div>
        </div>
      </div>
      <div className="min-w-0">
        <div className={fieldCls}>Email</div>
        <div className="text-sm text-admin-text-muted break-all">{user.email}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className={fieldCls}>Cargo</div>
          <div className={`inline-block mt-0.5 text-xs px-2 py-1 rounded-full ${roleBadgeClass(user)}`}>{roleLabel(user)}</div>
        </div>
        <div>
          <div className={fieldCls}>Criado em</div>
          <div className="text-sm text-admin-text-muted mt-0.5">{new Date(user.createdAt).toLocaleDateString()}</div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-admin-border pt-3">
        <div className={fieldCls}>Ações</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="ady-btn w-8 h-8 flex items-center justify-center rounded-lg text-admin-text-faint hover:text-admin-petrol hover:bg-admin-surface-2 transition-all"
            title="Editar usuário"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onResetPassword}
            className="ady-btn w-8 h-8 flex items-center justify-center rounded-lg text-admin-text-faint hover:text-admin-petrol hover:bg-admin-surface-2 transition-all"
            title="Trocar senha"
          >
            <KeyRound className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="ady-btn w-8 h-8 flex items-center justify-center rounded-lg text-admin-text-faint hover:text-admin-danger hover:bg-admin-surface-2 transition-all"
            title="Remover usuário"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </article>
  );
}
